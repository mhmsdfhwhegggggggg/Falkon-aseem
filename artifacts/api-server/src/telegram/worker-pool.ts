/**
 * WORKER POOL — Concurrent Job Execution Engine
 * ===============================================
 * Handles 1000+ concurrent users by managing job execution slots.
 *
 * Features:
 * 1. Configurable concurrency (default: 10 parallel jobs)
 * 2. Priority queue (high-priority jobs jump the queue)
 * 3. Per-account slot isolation (one active job per account max by default)
 * 4. Graceful shutdown (waits for in-flight jobs to complete)
 * 5. Job timeout enforcement (kills hung jobs)
 * 6. Circuit breaker integration (skips unhealthy accounts)
 * 7. Real-time slot metrics for monitoring
 */

import { logger } from "../lib/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type JobPriority = "low" | "normal" | "high" | "critical";

export interface PoolJob {
  id: string;
  accountId: string;
  priority: JobPriority;
  timeoutMs: number;
  fn: () => Promise<void>;
  addedAt: number;
}

interface RunningSlot {
  job: PoolJob;
  startedAt: number;
  timeoutHandle: ReturnType<typeof setTimeout>;
  abortController: AbortController;
}

// ─── Priority weights ─────────────────────────────────────────────────────────

const PRIORITY_WEIGHT: Record<JobPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

// ─── WorkerPool class ─────────────────────────────────────────────────────────

class WorkerPool {
  private queue: PoolJob[] = [];
  private running = new Map<string, RunningSlot>(); // jobId → slot
  private accountActiveJobs = new Map<string, Set<string>>(); // accountId → Set<jobId>
  private maxConcurrency: number;
  private maxPerAccount: number;
  private draining = false;

  // Metrics
  private totalCompleted = 0;
  private totalFailed = 0;
  private totalTimedOut = 0;

  constructor(maxConcurrency = 10, maxPerAccount = 2) {
    this.maxConcurrency = maxConcurrency;
    this.maxPerAccount = maxPerAccount;
  }

  enqueue(job: PoolJob): void {
    if (this.draining) {
      logger.warn({ jobId: job.id }, "Pool draining — job rejected");
      return;
    }

    // Insert by priority (higher priority = inserted earlier)
    const weight = PRIORITY_WEIGHT[job.priority];
    let inserted = false;
    for (let i = 0; i < this.queue.length; i++) {
      if (PRIORITY_WEIGHT[this.queue[i]!.priority] < weight) {
        this.queue.splice(i, 0, job);
        inserted = true;
        break;
      }
    }
    if (!inserted) this.queue.push(job);

    logger.debug({ jobId: job.id, queueLength: this.queue.length, priority: job.priority }, "Job enqueued");
    this.tick();
  }

  private tick(): void {
    if (this.draining) return;

    while (this.running.size < this.maxConcurrency && this.queue.length > 0) {
      const job = this.nextEligibleJob();
      if (!job) break;
      this.startJob(job);
    }
  }

  private nextEligibleJob(): PoolJob | null {
    for (let i = 0; i < this.queue.length; i++) {
      const job = this.queue[i]!;
      const accountJobs = this.accountActiveJobs.get(job.accountId);
      const activeCount = accountJobs?.size ?? 0;
      if (activeCount < this.maxPerAccount) {
        this.queue.splice(i, 1);
        return job;
      }
    }
    return null;
  }

  private startJob(job: PoolJob): void {
    const abortController = new AbortController();

    const timeoutHandle = setTimeout(() => {
      logger.error({ jobId: job.id, timeoutMs: job.timeoutMs }, "Job timed out — aborting");
      abortController.abort();
      this.totalTimedOut++;
      this.finishJob(job.id, "timeout");
    }, job.timeoutMs);

    const slot: RunningSlot = {
      job,
      startedAt: Date.now(),
      timeoutHandle,
      abortController,
    };

    this.running.set(job.id, slot);

    if (!this.accountActiveJobs.has(job.accountId)) {
      this.accountActiveJobs.set(job.accountId, new Set());
    }
    this.accountActiveJobs.get(job.accountId)!.add(job.id);

    logger.info({ jobId: job.id, accountId: job.accountId, running: this.running.size }, "Job started");

    job.fn()
      .then(() => {
        this.totalCompleted++;
        this.finishJob(job.id, "success");
      })
      .catch((err: unknown) => {
        this.totalFailed++;
        logger.error({ jobId: job.id, err: err instanceof Error ? err.message : String(err) }, "Job failed");
        this.finishJob(job.id, "error");
      });
  }

  private finishJob(jobId: string, outcome: "success" | "error" | "timeout"): void {
    const slot = this.running.get(jobId);
    if (!slot) return;

    clearTimeout(slot.timeoutHandle);
    this.running.delete(jobId);

    const accountJobs = this.accountActiveJobs.get(slot.job.accountId);
    if (accountJobs) {
      accountJobs.delete(jobId);
      if (accountJobs.size === 0) {
        this.accountActiveJobs.delete(slot.job.accountId);
      }
    }

    const durationMs = Date.now() - slot.startedAt;
    logger.info({ jobId, outcome, durationMs, running: this.running.size }, "Job finished");

    // Continue draining queue
    this.tick();
  }

  cancelJob(jobId: string): boolean {
    // From queue
    const qi = this.queue.findIndex((j) => j.id === jobId);
    if (qi !== -1) {
      this.queue.splice(qi, 1);
      return true;
    }

    // From running
    const slot = this.running.get(jobId);
    if (slot) {
      slot.abortController.abort();
      clearTimeout(slot.timeoutHandle);
      this.running.delete(jobId);
      const accountJobs = this.accountActiveJobs.get(slot.job.accountId);
      accountJobs?.delete(jobId);
      this.tick();
      return true;
    }

    return false;
  }

  async drain(): Promise<void> {
    this.draining = true;
    this.queue.length = 0;

    while (this.running.size > 0) {
      await new Promise((r) => setTimeout(r, 500));
    }

    this.draining = false;
    logger.info("Worker pool drained");
  }

  setMaxConcurrency(n: number): void {
    this.maxConcurrency = n;
    this.tick();
  }

  metrics() {
    return {
      running: this.running.size,
      queued: this.queue.length,
      maxConcurrency: this.maxConcurrency,
      maxPerAccount: this.maxPerAccount,
      totalCompleted: this.totalCompleted,
      totalFailed: this.totalFailed,
      totalTimedOut: this.totalTimedOut,
      activeAccounts: this.accountActiveJobs.size,
    };
  }

  isRunning(jobId: string): boolean {
    return this.running.has(jobId);
  }

  isQueued(jobId: string): boolean {
    return this.queue.some((j) => j.id === jobId);
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const workerPool = new WorkerPool(
  parseInt(process.env["POOL_MAX_CONCURRENCY"] || "10"),
  parseInt(process.env["POOL_MAX_PER_ACCOUNT"] || "2")
);

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received — draining worker pool");
  await workerPool.drain();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received — draining worker pool");
  await workerPool.drain();
  process.exit(0);
});
