import { logger } from "../lib/logger.js";

export interface ScheduledJob {
  id: string;
  name: string;
  taskType: "extraction" | "add-members" | "bulk-message";
  scheduledAt: number; // Unix ms
  status: "pending" | "running" | "done" | "failed";
  params: Record<string, unknown>;
  result?: { success: boolean; message: string };
  createdAt: number;
}

// In-memory store (stateless server)
const scheduledJobs = new Map<string, ScheduledJob>();

export function createScheduledJob(job: Omit<ScheduledJob, "id" | "status" | "createdAt">): ScheduledJob {
  const id = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const newJob: ScheduledJob = { ...job, id, status: "pending", createdAt: Date.now() };
  scheduledJobs.set(id, newJob);
  logger.info(`Scheduled job created: ${id} → ${job.name} at ${new Date(job.scheduledAt).toISOString()}`);
  return newJob;
}

export function getScheduledJob(id: string): ScheduledJob | undefined {
  return scheduledJobs.get(id);
}

export function listScheduledJobs(): ScheduledJob[] {
  return Array.from(scheduledJobs.values()).sort((a, b) => a.scheduledAt - b.scheduledAt);
}

export function deleteScheduledJob(id: string): boolean {
  return scheduledJobs.delete(id);
}

export function updateScheduledJobStatus(
  id: string,
  status: ScheduledJob["status"],
  result?: ScheduledJob["result"]
): void {
  const job = scheduledJobs.get(id);
  if (job) {
    scheduledJobs.set(id, { ...job, status, ...(result ? { result } : {}) });
  }
}

export function getPendingJobsDue(): ScheduledJob[] {
  const now = Date.now();
  return listScheduledJobs().filter((j) => j.status === "pending" && j.scheduledAt <= now);
}
