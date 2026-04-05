/**
 * ANTI-BAN ENGINE v2.0
 * =====================
 * محرك مضاد الحظر - تقنيات متقدمة لمحاكاة السلوك البشري
 *
 * Techniques:
 * 1. Gaussian jitter delays (not fixed — human-like variance)
 * 2. Account health scoring (0–100) with auto-rotation
 * 3. FloodWait auto-handler with exponential backoff
 * 4. PeerFlood circuit breaker (full account pause)
 * 5. Per-account rate limiting (sliding window)
 * 6. Time-of-day throttle (avoid 02:00–06:00 UTC)
 * 7. Batch randomization (never same batch size twice)
 * 8. Warm-up mode (new accounts start slow, ramp up)
 * 9. Activity interleaving (mix read ops between writes)
 * 10. Auto-recovery after flood/peer-flood events
 */

import { logger } from "../lib/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AccountHealth {
  accountId: string;
  score: number;           // 0–100 (100 = perfect health)
  totalAdded: number;
  totalErrors: number;
  floodWaitCount: number;
  peerFloodCount: number;
  lastFloodAt: number;
  lastPeerFloodAt: number;
  circuitOpen: boolean;    // true = account is paused
  circuitOpenUntil: number;
  dailyWindow: number[];   // timestamps of actions today (sliding window)
  warmupMode: boolean;     // true = new account, start slow
  warmupActionsLeft: number;
  createdAt: number;
}

export interface DelayConfig {
  base: number;      // base delay in ms
  jitter: number;    // ± jitter fraction (0.3 = ±30%)
  min: number;       // hard minimum ms
  max: number;       // hard maximum ms
}

export type AddResult = "success" | "flood" | "peer_flood" | "privacy" | "already_member" | "not_found" | "limit_reached" | "error";

// ─── In-memory health store ───────────────────────────────────────────────────

const healthStore = new Map<string, AccountHealth>();

export function getHealth(accountId: string): AccountHealth {
  if (!healthStore.has(accountId)) {
    healthStore.set(accountId, {
      accountId,
      score: 100,
      totalAdded: 0,
      totalErrors: 0,
      floodWaitCount: 0,
      peerFloodCount: 0,
      lastFloodAt: 0,
      lastPeerFloodAt: 0,
      circuitOpen: false,
      circuitOpenUntil: 0,
      dailyWindow: [],
      warmupMode: false,
      warmupActionsLeft: 0,
      createdAt: Date.now(),
    });
  }
  return healthStore.get(accountId)!;
}

export function setWarmupMode(accountId: string, totalPlanned: number) {
  const h = getHealth(accountId);
  h.warmupMode = true;
  h.warmupActionsLeft = Math.min(20, Math.ceil(totalPlanned * 0.2));
  healthStore.set(accountId, h);
}

// ─── Sliding window rate limiter ──────────────────────────────────────────────

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

function pruneDailyWindow(h: AccountHealth): number {
  const cutoff = Date.now() - WINDOW_MS;
  h.dailyWindow = h.dailyWindow.filter((t) => t > cutoff);
  return h.dailyWindow.length;
}

export function canAct(accountId: string, maxPerDay: number): boolean {
  const h = getHealth(accountId);

  // Circuit breaker check
  if (h.circuitOpen) {
    if (Date.now() < h.circuitOpenUntil) {
      logger.warn({ accountId, until: h.circuitOpenUntil }, "Account circuit open, skipping");
      return false;
    }
    h.circuitOpen = false;
    h.score = Math.min(100, h.score + 10);
    logger.info({ accountId }, "Account circuit auto-closed, resuming");
  }

  const count = pruneDailyWindow(h);
  if (count >= maxPerDay) {
    logger.warn({ accountId, count, maxPerDay }, "Daily limit reached");
    return false;
  }

  return true;
}

export function recordAction(accountId: string) {
  const h = getHealth(accountId);
  h.dailyWindow.push(Date.now());
  h.totalAdded++;

  if (h.warmupMode && h.warmupActionsLeft > 0) {
    h.warmupActionsLeft--;
    if (h.warmupActionsLeft === 0) {
      h.warmupMode = false;
      logger.info({ accountId }, "Warmup complete, full speed ahead");
    }
  }

  healthStore.set(accountId, h);
}

export function recordError(accountId: string, type: "flood" | "peer_flood" | "generic") {
  const h = getHealth(accountId);
  h.totalErrors++;

  if (type === "flood") {
    h.floodWaitCount++;
    h.lastFloodAt = Date.now();
    h.score = Math.max(0, h.score - 5);
  } else if (type === "peer_flood") {
    h.peerFloodCount++;
    h.lastPeerFloodAt = Date.now();
    h.score = Math.max(0, h.score - 30);

    // Open circuit for 30–90 minutes based on recurrence
    const pauseMs = Math.min(90 * 60 * 1000, 30 * 60 * 1000 * h.peerFloodCount);
    h.circuitOpen = true;
    h.circuitOpenUntil = Date.now() + pauseMs;
    logger.error({ accountId, pauseMs, peerFloodCount: h.peerFloodCount }, "PeerFlood — circuit opened");
  } else {
    h.score = Math.max(0, h.score - 2);
  }

  healthStore.set(accountId, h);
}

// ─── Human-like delay functions ───────────────────────────────────────────────

/**
 * Box-Muller transform: normal distribution random
 */
function gaussianRandom(mean: number, stdDev: number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + stdDev * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Compute a human-like delay with Gaussian jitter.
 * Never perfectly predictable — Telegram's algorithm looks for patterns.
 */
export function humanDelay(config: DelayConfig): number {
  const stdDev = config.base * config.jitter;
  const raw = gaussianRandom(config.base, stdDev);
  return Math.max(config.min, Math.min(config.max, Math.round(raw)));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Full humanized sleep: computes delay + actually waits.
 * Returns the actual ms slept (for logging).
 */
export async function humanSleep(config: DelayConfig, warmupMode = false): Promise<number> {
  const multiplier = warmupMode ? 1.8 : 1.0;
  const ms = humanDelay(config) * multiplier;
  await sleep(ms);
  return ms;
}

// ─── Time-of-day guard ────────────────────────────────────────────────────────

/**
 * Returns true if current UTC hour is in the "quiet hours" window (02–06 UTC).
 * During quiet hours, actions are throttled to 30% of normal speed.
 */
export function isQuietHour(): boolean {
  const hour = new Date().getUTCHours();
  return hour >= 2 && hour < 6;
}

export function quietHourMultiplier(): number {
  return isQuietHour() ? 2.5 : 1.0;
}

// ─── Flood wait handler ───────────────────────────────────────────────────────

/**
 * Parse FLOOD_WAIT_X from Telegram error message.
 * Returns seconds to wait, or null if not a flood error.
 */
export function parseFloodWait(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  if (!msg.includes("FLOOD_WAIT")) return null;
  const match = msg.match(/FLOOD_WAIT_(\d+)/);
  return match ? parseInt(match[1]!) : 60;
}

export function isPeerFlood(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("PEER_FLOOD");
}

export function isPrivacyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("USER_PRIVACY") || msg.includes("PRIVACY") || msg.includes("CHAT_WRITE_FORBIDDEN");
}

export function isAlreadyMember(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("USER_ALREADY_PARTICIPANT");
}

export function isNotFound(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("USERNAME_INVALID") || msg.includes("USERNAME_NOT_OCCUPIED") || msg.includes("USER_ID_INVALID");
}

/**
 * Handle a flood wait: sleep for the required time + extra buffer.
 * Uses exponential backoff if repeated floods on same account.
 */
export async function handleFloodWait(accountId: string, seconds: number): Promise<void> {
  const h = getHealth(accountId);
  recordError(accountId, "flood");

  // Extra buffer: 10% on top, plus per-recurrence bonus
  const buffer = Math.ceil(seconds * 0.1) + (h.floodWaitCount * 5);
  const totalMs = (seconds + buffer) * 1000;

  logger.warn({ accountId, seconds, buffer, totalMs }, "Handling FloodWait");
  await sleep(totalMs);
}

// ─── Randomized batch sizing ──────────────────────────────────────────────────

/**
 * Returns a randomized batch size in range [min, max].
 * Never returns the same value twice in a row (avoids pattern detection).
 */
const lastBatchSizes = new Map<string, number>();

export function randomBatchSize(accountId: string, min = 1, max = 3): number {
  const last = lastBatchSizes.get(accountId) ?? -1;
  let size: number;
  do {
    size = Math.floor(Math.random() * (max - min + 1)) + min;
  } while (size === last && max > min);
  lastBatchSizes.set(accountId, size);
  return size;
}

// ─── Account rotation ─────────────────────────────────────────────────────────

/**
 * Given a list of account IDs, return the best one to use next.
 * Selection: highest health score + available daily quota.
 */
export function selectBestAccount(
  accountIds: string[],
  maxPerDay: number
): string | null {
  let best: { id: string; score: number } | null = null;

  for (const id of accountIds) {
    if (!canAct(id, maxPerDay)) continue;
    const h = getHealth(id);
    if (!best || h.score > best.score) {
      best = { id, score: h.score };
    }
  }

  return best?.id ?? null;
}

// ─── Activity interleaving ────────────────────────────────────────────────────

/**
 * Occasionally insert a "read" micro-pause between writes.
 * Mimics human behavior: user glances at chat between adding members.
 */
export async function maybeInterleavePause(index: number): Promise<void> {
  if (index > 0 && index % 5 === 0) {
    // Every 5 actions: short "reading" pause
    const pause = humanDelay({ base: 3000, jitter: 0.5, min: 1500, max: 7000 });
    logger.debug({ index, pause }, "Interleave pause (simulating reading)");
    await sleep(pause);
  }
}

// ─── Pre-action checklist ─────────────────────────────────────────────────────

export interface PreActionCheck {
  allowed: boolean;
  reason?: string;
  delayMs?: number;
}

/**
 * Full pre-action safety check before adding a member.
 * Returns whether to proceed and any delay to apply first.
 */
export async function preActionCheck(
  accountId: string,
  maxPerDay: number,
  delayConfig: DelayConfig
): Promise<PreActionCheck> {
  const h = getHealth(accountId);

  // Circuit open
  if (h.circuitOpen && Date.now() < h.circuitOpenUntil) {
    const remainingMs = h.circuitOpenUntil - Date.now();
    return { allowed: false, reason: `Account in cooldown for ${Math.ceil(remainingMs / 60000)}min` };
  }

  // Daily limit
  if (!canAct(accountId, maxPerDay)) {
    return { allowed: false, reason: "Daily limit reached" };
  }

  // Health too low
  if (h.score < 20) {
    return { allowed: false, reason: `Account health critical (${h.score}/100)` };
  }

  // Compute next delay
  const qm = quietHourMultiplier();
  const wm = h.warmupMode ? 1.8 : 1.0;
  const delayMs = humanDelay(delayConfig) * qm * wm;

  return { allowed: true, delayMs: Math.round(delayMs) };
}

// ─── Health report ────────────────────────────────────────────────────────────

export function getHealthReport(): Record<string, {
  score: number;
  circuitOpen: boolean;
  dailyCount: number;
  floodCount: number;
  peerFloodCount: number;
  warmupMode: boolean;
}> {
  const report: Record<string, any> = {};
  for (const [id, h] of healthStore) {
    const dailyCount = pruneDailyWindow(h);
    report[id] = {
      score: h.score,
      circuitOpen: h.circuitOpen,
      dailyCount,
      floodCount: h.floodWaitCount,
      peerFloodCount: h.peerFloodCount,
      warmupMode: h.warmupMode,
    };
  }
  return report;
}
