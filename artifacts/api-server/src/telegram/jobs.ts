/**
 * JOBS STORE v5.0 — PostgreSQL Hybrid (In-Memory + PostgreSQL)
 * =============================================================
 * القراءات: من الذاكرة O(1) — سريعة لاستعلامات الحالة
 * الكتابات: ذاكرة أولاً + PostgreSQL كل 2s (batch)
 * Boot: يُحمَّل من PostgreSQL (يستأنف بعد Restart)
 * يدعم 1000+ مستخدم متزامن
 */

import { dbPool } from "./session-store.js";
import { logger } from "../lib/logger.js";

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type JobType   = "extraction" | "add_members" | "bulk_message" | "extract_and_add";

export interface MemberRecord {
  userId:      string;
  accessHash?: string;
  username:    string;
  firstName:   string;
  lastName:    string;
  isOnline:    boolean;
  phone?:      string;
  lastSeen?:   string;
  status:      "pending" | "added" | "failed" | "flood" | "already_member" | "privacy";
  error?:      string;
}

export interface Job {
  id:           string;
  type:         JobType;
  status:       JobStatus;
  progress:     number;
  total:        number;
  createdAt:    string;
  startedAt?:   string;
  completedAt?: string;
  config:       Record<string, unknown>;
  result?: {
    members?:       MemberRecord[];
    extracted?:     number;
    added?:         number;
    failed?:        number;
    skipped?:       number;
    errors?:        string[];
    accountHealth?: number;
  };
  error?:       string;
  accountId?:   string;
  savedFileId?: string;
  ownerHwid?:   string;
}

const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS falkon_jobs (
    id            TEXT PRIMARY KEY,
    type          TEXT    NOT NULL,
    status        TEXT    NOT NULL DEFAULT 'queued',
    progress      INTEGER NOT NULL DEFAULT 0,
    total         INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL,
    started_at    TEXT,
    completed_at  TEXT,
    config_json   JSONB   NOT NULL DEFAULT '{}',
    result_json   JSONB,
    error         TEXT,
    account_id    TEXT,
    saved_file_id TEXT,
    owner_hwid    TEXT DEFAULT 'default'
  );
  CREATE INDEX IF NOT EXISTS idx_falkon_jobs_status  ON falkon_jobs(status);
  CREATE INDEX IF NOT EXISTS idx_falkon_jobs_account ON falkon_jobs(account_id);
  CREATE INDEX IF NOT EXISTS idx_falkon_jobs_owner   ON falkon_jobs(owner_hwid);
  CREATE INDEX IF NOT EXISTS idx_falkon_jobs_created ON falkon_jobs(created_at DESC);
`;

let initialized = false;
async function ensureSchema() {
  if (initialized) return;
  await dbPool.query(INIT_SQL);
  initialized = true;
  logger.info("jobs-store: PostgreSQL schema ready");
}

const jobsMap = new Map<string, Job>();
let flushPending = false;
const flushQueue = new Set<string>();

function schedulePgFlush(jobId: string) {
  flushQueue.add(jobId);
  if (flushPending) return;
  flushPending = true;
  setTimeout(async () => {
    flushPending = false;
    const ids = [...flushQueue]; flushQueue.clear();
    try {
      await ensureSchema();
      for (const id of ids) {
        const job = jobsMap.get(id);
        if (!job) continue;
        const cfg = { ...job.config }; delete cfg["sessionString"];
        const res = job.result ? { ...job.result, members: undefined } : undefined;
        dbPool.query(
          `INSERT INTO falkon_jobs
             (id,type,status,progress,total,created_at,started_at,completed_at,config_json,result_json,error,account_id,saved_file_id,owner_hwid)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (id) DO UPDATE SET
             status=$3, progress=$4, total=$5, started_at=$7, completed_at=$8,
             result_json=$10, error=$11, saved_file_id=$13`,
          [job.id, job.type, job.status, job.progress, job.total,
           job.createdAt, job.startedAt ?? null, job.completedAt ?? null,
           JSON.stringify(cfg), res ? JSON.stringify(res) : null,
           job.error ?? null, job.accountId ?? null,
           job.savedFileId ?? null, job.ownerHwid ?? "default"]
        ).catch((e: any) => logger.warn({ jobId: id, err: String(e) }, "jobs: PG flush failed"));
      }
    } catch (err) {
      logger.error({ err: String(err) }, "jobs: batch flush failed");
    }
  }, 2000);
}

async function bootLoad() {
  await ensureSchema();
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const res = await dbPool.query(
      "SELECT * FROM falkon_jobs WHERE created_at > $1 ORDER BY created_at DESC LIMIT 1000",
      [cutoff]
    );
    for (const row of res.rows) {
      const wasRunning = row.status === "running" || row.status === "queued";
      const job: Job = {
        id: row.id, type: row.type,
        status: wasRunning ? "failed" : row.status,
        progress: row.progress, total: row.total,
        createdAt: row.created_at, startedAt: row.started_at ?? undefined,
        completedAt: row.completed_at ?? (wasRunning ? new Date().toISOString() : undefined),
        config: typeof row.config_json === "string" ? JSON.parse(row.config_json) : (row.config_json ?? {}),
        result: row.result_json ? (typeof row.result_json === "string" ? JSON.parse(row.result_json) : row.result_json) : undefined,
        error: row.error ?? (wasRunning ? "Server restarted — job interrupted" : undefined),
        accountId: row.account_id ?? undefined,
        savedFileId: row.saved_file_id ?? undefined,
        ownerHwid: row.owner_hwid ?? "default",
      };
      if (job.config["sessionString"]) delete job.config["sessionString"];
      jobsMap.set(job.id, job);
    }
    logger.info({ loaded: jobsMap.size }, "jobs-store: loaded from PostgreSQL");
  } catch (err) {
    logger.error({ err: String(err) }, "jobs-store: boot load failed");
  }
}

bootLoad().catch((err) => logger.error({ err: String(err) }, "jobs-store: boot failed"));

setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const [id, job] of jobsMap) {
    if (["completed","failed","cancelled"].includes(job.status) && job.completedAt &&
        new Date(job.completedAt).getTime() < cutoff) {
      jobsMap.delete(id); removed++;
    }
  }
  if (removed > 0) logger.info({ removed }, "jobs: cleaned old jobs from memory");
}, 60 * 60 * 1000);

export function loadJobs(ownerHwid?: string): Job[] {
  const all = [...jobsMap.values()];
  if (!ownerHwid) return all;
  return all.filter((j) => !j.ownerHwid || j.ownerHwid === ownerHwid || j.ownerHwid === "default");
}

export function createJob(type: JobType, config: Record<string, unknown>, accountId?: string, ownerHwid?: string): Job {
  const job: Job = {
    id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type, status: "queued", progress: 0, total: 0,
    createdAt: new Date().toISOString(), config, accountId, ownerHwid: ownerHwid ?? "default",
  };
  jobsMap.set(job.id, job);
  schedulePgFlush(job.id);
  return job;
}

export function updateJob(id: string, updates: Partial<Job>): Job | null {
  const existing = jobsMap.get(id);
  if (!existing) return null;
  const updated = { ...existing, ...updates };
  jobsMap.set(id, updated);
  schedulePgFlush(id);
  return updated;
}

export function getJob(id: string): Job | undefined {
  return jobsMap.get(id);
}
