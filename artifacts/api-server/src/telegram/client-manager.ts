/**
 * CLIENT MANAGER v2.0 — Enhanced Connection Pool
 * ================================================
 * Manages Telegram client connections with:
 * 1. Auto-reconnect on disconnect (with backoff)
 * 2. Connection health pinging (keep-alive)
 * 3. Per-account connection metrics
 * 4. Graceful shutdown support
 * 5. Proxy support per account (future-ready)
 */

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { loadAccounts, getAccount, upsertAccount, type StoredAccount } from "./session-store.js";
import { logger } from "../lib/logger.js";

const API_ID = parseInt(process.env["TELEGRAM_API_ID"] || "0");
const API_HASH = process.env["TELEGRAM_API_HASH"] || "";

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
  floodSleepThreshold: 60, // auto-sleep on flood < 60s
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
      // Lightweight ping — get connection state
      await managed.client.getMe();
      managed.lastUsed = Date.now();
    } catch (err: unknown) {
      managed.errors++;
      logger.warn({ accountId: managed.accountId, err: err instanceof Error ? err.message : String(err) }, "Ping failed");
    }
  }, 5 * 60 * 1000); // every 5 minutes
}

function stopPing(managed: ManagedClient): void {
  if (managed.pingHandle) {
    clearInterval(managed.pingHandle);
    managed.pingHandle = undefined;
  }
}

// ─── Get or create client ─────────────────────────────────────────────────────

export async function getClient(accountId: string): Promise<TelegramClient> {
  const existing = pool.get(accountId);

  if (existing) {
    if (existing.client.connected) {
      existing.lastUsed = Date.now();
      existing.requestCount++;
      return existing.client;
    }
    // Reconnect
    try {
      await existing.client.connect();
      existing.lastUsed = Date.now();
      existing.requestCount++;
      logger.info({ accountId }, "Client reconnected");
      return existing.client;
    } catch (err) {
      logger.error({ accountId }, "Reconnect failed, creating fresh client");
      stopPing(existing);
      pool.delete(accountId);
    }
  }

  const account = getAccount(accountId);
  if (!account) throw new Error(`Account ${accountId} not found`);

  const session = new StringSession(account.sessionString);
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

export { API_ID, API_HASH };
