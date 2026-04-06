/**
 * JOBS STORE — In-Memory with Periodic Persistence
 * ==================================================
 * Critical for 500+ concurrent users:
 * - All reads/writes go to in-memory Map (μs latency vs ms file I/O)
 * - Periodic flush every 30s to disk (durability without performance hit)
 * - Race-condition-safe: no concurrent file writes
 * - Session strings are STRIPPED before disk persistence (security)
 */

import fs from "fs";
import path from "path";

const DATA_DIR = process.env["DATA_DIR"] || path.join(process.cwd(), "../../data");
const JOBS_FILE = path.join(DATA_DIR, "jobs.json");

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type JobType = "extraction" | "add_members" | "bulk_message" | "extract_and_add";

export interface MemberRecord {
  userId: string;
  accessHash?: string;   // REQUIRED for adding by ID — stored at extraction time
  username: string;
  firstName: string;
  lastName: string;
  isOnline: boolean;
  phone?: string;
  lastSeen?: string;
  status: "pending" | "added" | "failed" | "flood" | "already_member" | "privacy";
  error?: string;
}

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  total: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  config: Record<string, unknown>;
  result?: {
    members?: MemberRecord[];
    extracted?: number;
    added?: number;
    failed?: number;
    skipped?: number;
    errors?: string[];
    accountHealth?: number;
  };
  error?: string;
  accountId?: string;
  savedFileId?: string;
}

// ─── In-memory store (the only source of truth at runtime) ───────────────────

const jobsMap = new Map<string, Job>();
let flushPending = false;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ─── Boot: load from disk once ───────────────────────────────────────────────

function bootLoad() {
  ensureDir();
  if (!fs.existsSync(JOBS_FILE)) return;
  try {
    const raw = fs.readFileSync(JOBS_FILE, "utf-8");
    const jobs = JSON.parse(raw) as Job[];
    // Only load completed/failed/cancelled — running/queued jobs are invalid after restart
    for (const job of jobs) {
      if (job.status === "running" || job.status === "queued") {
        job.status = "failed";
        job.error = "Server restarted — job interrupted";
        job.completedAt = new Date().toISOString();
      }
      // Strip session strings on load (safety)
      if (job.config["sessionString"]) delete job.config["sessionString"];
      jobsMap.set(job.id, job);
    }
  } catch {
    // corrupted file — start fresh
  }
}

bootLoad();

// ─── Periodic flush to disk (non-blocking, debounced) ────────────────────────

function scheduleFlush() {
  if (flushPending) return;
  flushPending = true;
  setTimeout(() => {
    flushPending = false;
    flushToDisk();
  }, 5000); // batch writes: flush max once every 5s
}

function flushToDisk() {
  try {
    ensureDir();
    // Strip session strings and large member arrays before persisting
    const jobs = [...jobsMap.values()].map((job) => {
      const config = { ...job.config };
      delete config["sessionString"]; // NEVER persist session strings to disk
      const result = job.result
        ? { ...job.result, members: undefined } // don't persist large member arrays
        : undefined;
      return { ...job, config, result };
    });
    // Keep only last 500 jobs on disk (oldest jobs dropped first)
    const toSave = jobs.slice(-500);
    fs.writeFileSync(JOBS_FILE, JSON.stringify(toSave, null, 2));
  } catch (err) {
    // Never crash on flush failure
    console.error("[jobs] flush failed:", err);
  }
}

// Auto-flush every 30s regardless
setInterval(flushToDisk, 30_000);

// Flush on graceful shutdown
process.on("SIGTERM", () => { flushToDisk(); });
process.on("SIGINT",  () => { flushToDisk(); });

// ─── Public API — all O(1) in-memory operations ──────────────────────────────

export function loadJobs(): Job[] {
  return [...jobsMap.values()];
}

export function createJob(type: JobType, config: Record<string, unknown>, accountId?: string): Job {
  const job: Job = {
    id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    status: "queued",
    progress: 0,
    total: 0,
    createdAt: new Date().toISOString(),
    config,   // session string lives here in-memory only; stripped before disk
    accountId,
  };
  jobsMap.set(job.id, job);
  scheduleFlush();
  return job;
}

export function updateJob(id: string, updates: Partial<Job>): Job | null {
  const existing = jobsMap.get(id);
  if (!existing) return null;
  const updated = { ...existing, ...updates };
  jobsMap.set(id, updated);
  scheduleFlush();
  return updated;
}

export function getJob(id: string): Job | undefined {
  return jobsMap.get(id);
}

// Clean up completed jobs older than 24h to prevent memory growth
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, job] of jobsMap) {
    if (
      (job.status === "completed" || job.status === "failed" || job.status === "cancelled") &&
      job.completedAt &&
      new Date(job.completedAt).getTime() < cutoff
    ) {
      jobsMap.delete(id);
    }
  }
}, 60 * 60 * 1000); // run hourly
