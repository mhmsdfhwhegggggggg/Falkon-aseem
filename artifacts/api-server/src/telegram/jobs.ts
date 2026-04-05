import fs from "fs";
import path from "path";

const DATA_DIR = process.env["DATA_DIR"] || path.join(process.cwd(), "../../data");
const JOBS_FILE = path.join(DATA_DIR, "jobs.json");

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type JobType = "extraction" | "add_members" | "bulk_message" | "extract_and_add";

export interface MemberRecord {
  userId: string;
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

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadJobs(): Job[] {
  ensureDir();
  if (!fs.existsSync(JOBS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(JOBS_FILE, "utf-8")) as Job[];
  } catch {
    return [];
  }
}

export function saveJobs(jobs: Job[]) {
  ensureDir();
  fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2));
}

export function createJob(type: JobType, config: Record<string, unknown>, accountId?: string): Job {
  const job: Job = {
    id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    status: "queued",
    progress: 0,
    total: 0,
    createdAt: new Date().toISOString(),
    config,
    accountId,
  };
  const jobs = loadJobs();
  jobs.push(job);
  saveJobs(jobs);
  return job;
}

export function updateJob(id: string, updates: Partial<Job>) {
  const jobs = loadJobs();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx >= 0) {
    jobs[idx] = { ...jobs[idx]!, ...updates };
    saveJobs(jobs);
    return jobs[idx]!;
  }
  return null;
}

export function getJob(id: string): Job | undefined {
  return loadJobs().find((j) => j.id === id);
}
