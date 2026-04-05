/**
 * CLIENT MANAGER v3.0 — Stateless Session Support
 * =================================================
 * Manages Telegram client connections with:
 * 1. Stateless mode: accept session string per-request (phone-stored sessions)
 * 2. Auto-reconnect on disconnect (with backoff)
 * 3. Connection health pinging (keep-alive)
 * 4. Per-account connection metrics
 * 5. Graceful shutdown support
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

const pool = new Map<string, ManagedClient>();

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

// ─── Keep-alive ping ──────────────────────────────────────────────────────────

function startPing(managed: ManagedClient): void {
  if (managed.pingHandle) clearInterval(managed.pingHandle);
  managed.pingHandle = setInterval(async () => {
    try {
      if (!managed.client.connected) {
        logger.warn({ accountId: managed.accountId }, "Client disconnected, reconnecting...");
        await managed.client.connect();
      }
      await managed.client.getMe();
      managed.lastUsed = Date.now();
    } catch (err: unknown) {
      managed.errors++;
      logger.warn({ accountId: managed.accountId, err: err instanceof Error ? err.message : String(err) }, "Ping failed");
    }
  }, 5 * 60 * 1000);
}

function stopPing(managed: ManagedClient): void {
  if (managed.pingHandle) {
    clearInterval(managed.pingHandle);
    managed.pingHandle = undefined;
  }
}

// ─── Get or create client from pool (legacy: looks up stored session) ─────────

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
      stopPing(existing);
      pool.delete(accountId);
    }
  }

  // Try to load from session-store (legacy path)
  const { getAccount } = await import("./session-store.js");
  const account = getAccount(accountId);
  if (!account) throw new Error(`Account ${accountId} not found`);

  return createAndPoolClient(accountId, account.sessionString);
}

// ─── NEW: Get client from session string (stateless / phone-stored sessions) ──

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
      stopPing(existing);
      pool.delete(accountId);
    }
  }

  return createAndPoolClient(accountId, sessionString);
}

// ─── Internal: create, connect, pool ──────────────────────────────────────────

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

  startPing(managed);
  pool.set(accountId, managed);

  logger.info({ accountId }, "New Telegram client connected");
  return client;
}

// ─── Create fresh (unauthenticated) client for auth flow ──────────────────────

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
    stopPing(managed);
    await managed.client.disconnect();
    pool.delete(accountId);
    logger.info({ accountId }, "Client disconnected");
  }
}

export async function disconnectAll(): Promise<void> {
  for (const [id, managed] of pool) {
    stopPing(managed);
    await managed.client.disconnect();
    pool.delete(id);
  }
  logger.info("All clients disconnected");
}

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

  return { poolSize: pool.size, accounts: metrics };
}

// Evict idle clients after 30min
setInterval(() => {
  const now = Date.now();
  const idleThreshold = 30 * 60 * 1000;
  for (const [id, managed] of pool) {
    if (now - managed.lastUsed > idleThreshold) {
      logger.info({ accountId: id }, "Evicting idle client");
      stopPing(managed);
      managed.client.disconnect().catch(() => {});
      pool.delete(id);
    }
  }
}, 10 * 60 * 1000);
