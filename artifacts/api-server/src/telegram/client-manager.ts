/**
 * CLIENT MANAGER v4.0 — Production-Grade Stateless Session Support
 * =================================================================
 * Critical fixes for 500+ concurrent users:
 *
 * 1. Race-condition-safe: Promise deduplication prevents multiple
 *    simultaneous connections for the same accountId.
 * 2. Staggered pings: keeps-alive are spread over time to avoid
 *    100+ simultaneous Telegram API calls.
 * 3. Connection pool eviction: idle clients freed after 30min.
 * 4. Metrics: per-account health tracking.
 */

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { logger } from "../lib/logger.js";

export const API_ID = parseInt(process.env["TELEGRAM_API_ID"] || "0");
export const API_HASH = process.env["TELEGRAM_API_HASH"] || "";

if (!API_ID || !API_HASH) {
  throw new Error("TELEGRAM_API_ID and TELEGRAM_API_HASH must be set");
}

interface ManagedClient {
  client: TelegramClient;
  accountId: string;
  connectedAt: number;
  lastUsed: number;
  requestCount: number;
  errors: number;
  pingHandle?: ReturnType<typeof setInterval>;
}

// Active clients in pool
const pool = new Map<string, ManagedClient>();

// ── Race-condition guard ─────────────────────────────────────────────────────
// If two requests arrive for the same accountId simultaneously before the
// client is in pool, we share the same Promise instead of creating two clients.
const connecting = new Map<string, Promise<TelegramClient>>();

const CONNECTION_OPTIONS = {
  connectionRetries: 5,
  requestRetries: 3,
  retryDelay: 1000,
  autoReconnect: true,
  floodSleepThreshold: 60,
  deviceModel: "Desktop",
  systemVersion: "Windows 10",
  appVersion: "4.9.4",
  langCode: "en",
  systemLangCode: "en",
};

// ─── Staggered ping (keep-alive) ─────────────────────────────────────────────
// Instead of one interval per client (N×5min calls simultaneously),
// all clients share a single interval that processes them one-by-one.

const PING_INTERVAL_MS = 4 * 60 * 1000; // 4 min
let pingRoundRobinIndex = 0;

setInterval(async () => {
  const entries = [...pool.values()];
  if (entries.length === 0) return;

  // Pick ONE client per tick (round-robin), not all at once
  const managed = entries[pingRoundRobinIndex % entries.length]!;
  pingRoundRobinIndex++;

  try {
    if (!managed.client.connected) {
      logger.warn({ accountId: managed.accountId }, "Client disconnected, reconnecting...");
      await managed.client.connect();
    }
    managed.lastUsed = Date.now();
  } catch (err: unknown) {
    managed.errors++;
    logger.warn(
      { accountId: managed.accountId, err: err instanceof Error ? err.message : String(err) },
      "Ping failed"
    );
  }
}, PING_INTERVAL_MS);

// ─── Evict idle clients every 10 min ─────────────────────────────────────────

setInterval(() => {
  const now = Date.now();
  const idleThreshold = 30 * 60 * 1000;
  for (const [id, managed] of pool) {
    if (now - managed.lastUsed > idleThreshold) {
      logger.info({ accountId: id }, "Evicting idle client");
      managed.client.disconnect().catch(() => {});
      pool.delete(id);
      connecting.delete(id);
    }
  }
}, 10 * 60 * 1000);

// ─── Internal: create, connect, pool ─────────────────────────────────────────

async function createAndPoolClient(accountId: string, sessionString: string): Promise<TelegramClient> {
  const session = new StringSession(sessionString);
  const client = new TelegramClient(session, API_ID, API_HASH, CONNECTION_OPTIONS);

  await client.connect();

  const managed: ManagedClient = {
    client,
    accountId,
    connectedAt: Date.now(),
    lastUsed: Date.now(),
    requestCount: 1,
    errors: 0,
  };

  pool.set(accountId, managed);
  connecting.delete(accountId); // remove dedup guard

  logger.info({ accountId, poolSize: pool.size }, "New Telegram client connected");
  return client;
}

// ─── Get or create client from pool (legacy: server-stored session) ──────────

export async function getClient(accountId: string): Promise<TelegramClient> {
  const existing = pool.get(accountId);
  if (existing) {
    if (existing.client.connected) {
      existing.lastUsed = Date.now();
      existing.requestCount++;
      return existing.client;
    }
    try {
      await existing.client.connect();
      existing.lastUsed = Date.now();
      existing.requestCount++;
      return existing.client;
    } catch {
      pool.delete(accountId);
    }
  }

  // Dedup: if already connecting, share the promise
  const inFlight = connecting.get(accountId);
  if (inFlight) return inFlight;

  const { getAccount } = await import("./session-store.js");
  const account = getAccount(accountId);
  if (!account) throw new Error(`Account ${accountId} not found`);

  const promise = createAndPoolClient(accountId, account.sessionString);
  connecting.set(accountId, promise);
  return promise;
}

// ─── NEW: Get client from session string (stateless / phone-stored) ───────────

export async function getClientFromSession(
  sessionString: string,
  accountId: string,
): Promise<TelegramClient> {
  const existing = pool.get(accountId);
  if (existing) {
    if (existing.client.connected) {
      existing.lastUsed = Date.now();
      existing.requestCount++;
      return existing.client;
    }
    try {
      await existing.client.connect();
      existing.lastUsed = Date.now();
      existing.requestCount++;
      return existing.client;
    } catch {
      pool.delete(accountId);
    }
  }

  // Dedup: if already connecting, share the promise
  const inFlight = connecting.get(accountId);
  if (inFlight) return inFlight;

  const promise = createAndPoolClient(accountId, sessionString);
  connecting.set(accountId, promise);
  return promise;
}

// ─── Create fresh (unauthenticated) client for auth flow ─────────────────────

export function createFreshClient(): TelegramClient {
  const session = new StringSession("");
  return new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 5,
    deviceModel: "Desktop",
    systemVersion: "Windows 10",
    appVersion: "4.9.4",
    langCode: "en",
  });
}

// ─── Disconnect ───────────────────────────────────────────────────────────────

export async function disconnectClient(accountId: string): Promise<void> {
  const managed = pool.get(accountId);
  if (managed) {
    await managed.client.disconnect();
    pool.delete(accountId);
    connecting.delete(accountId);
    logger.info({ accountId }, "Client disconnected");
  }
}

export async function disconnectAll(): Promise<void> {
  for (const [id, managed] of pool) {
    await managed.client.disconnect();
    pool.delete(id);
  }
  connecting.clear();
  logger.info("All clients disconnected");
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export function getPoolMetrics() {
  const metrics: Record<string, {
    connected: boolean;
    connectedAt: number;
    lastUsed: number;
    requestCount: number;
    errors: number;
  }> = {};

  for (const [id, m] of pool) {
    metrics[id] = {
      connected: !!m.client.connected,
      connectedAt: m.connectedAt,
      lastUsed: m.lastUsed,
      requestCount: m.requestCount,
      errors: m.errors,
    };
  }

  return {
    poolSize: pool.size,
    connectingCount: connecting.size,
    accounts: metrics,
  };
}
