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

// ─── Proxy configuration type ─────────────────────────────────────────────────
export interface ProxyConfig {
  host: string;
  port: number;
  type: "socks5" | "http" | "mtproto";
  username?: string;
  password?: string;
  secret?: string;   // MTProto proxy secret
}

// ─── Device fingerprint pool — rotate to avoid bot detection ─────────────────
// Each account gets assigned a unique device profile. Using real device names
// and Telegram app versions used by actual users in the Arab world.

const DEVICE_PROFILES = [
  { deviceModel: "iPhone 15 Pro Max", systemVersion: "iOS 17.2", appVersion: "10.3.4", langCode: "ar", systemLangCode: "ar-SA" },
  { deviceModel: "iPhone 14 Pro",     systemVersion: "iOS 17.1", appVersion: "10.2.9", langCode: "ar", systemLangCode: "ar-SA" },
  { deviceModel: "iPhone 13",         systemVersion: "iOS 16.6", appVersion: "10.2.1", langCode: "ar", systemLangCode: "ar-SA" },
  { deviceModel: "Samsung Galaxy S24 Ultra", systemVersion: "Android 14; One UI 6.1", appVersion: "10.3.2", langCode: "ar", systemLangCode: "ar-SA" },
  { deviceModel: "Samsung Galaxy S23", systemVersion: "Android 14; One UI 6.0",       appVersion: "10.2.8", langCode: "ar", systemLangCode: "ar-SA" },
  { deviceModel: "Xiaomi 14 Ultra",   systemVersion: "Android 14",                    appVersion: "10.2.9", langCode: "ar", systemLangCode: "ar-SA" },
  { deviceModel: "Huawei Mate 60 Pro",systemVersion: "Android 12",                    appVersion: "10.1.4", langCode: "ar", systemLangCode: "ar-SA" },
  { deviceModel: "OnePlus 12",        systemVersion: "Android 14; OxygenOS 14",       appVersion: "10.3.0", langCode: "ar", systemLangCode: "ar-SA" },
  { deviceModel: "iPad Pro 12.9",     systemVersion: "iOS 17.0",                      appVersion: "10.2.3", langCode: "ar", systemLangCode: "ar-SA" },
  { deviceModel: "Oppo Find X7",      systemVersion: "Android 14; ColorOS 14",        appVersion: "10.2.7", langCode: "ar", systemLangCode: "ar-SA" },
];

/**
 * Get a deterministic-but-varied device profile for an accountId.
 * Same account always gets the same profile (consistent fingerprint).
 * Different accounts get different profiles (avoids same-device detection).
 */
function getDeviceProfile(accountId: string) {
  // Use a simple hash of the accountId to pick a profile
  let hash = 0;
  for (let i = 0; i < accountId.length; i++) {
    hash = ((hash << 5) - hash + accountId.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % DEVICE_PROFILES.length;
  return DEVICE_PROFILES[idx]!;
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

const BASE_CONNECTION_OPTIONS = {
  connectionRetries: 5,
  requestRetries: 3,
  retryDelay: 1000,
  autoReconnect: true,
  floodSleepThreshold: 60,
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

// Proxy cache: accountId → ProxyConfig
const proxyCache = new Map<string, ProxyConfig>();

export function setAccountProxy(accountId: string, proxy: ProxyConfig | null) {
  if (proxy) proxyCache.set(accountId, proxy);
  else proxyCache.delete(accountId);
}

function buildProxyOption(proxy: ProxyConfig): Record<string, unknown> {
  if (proxy.type === "mtproto") {
    return { ip: proxy.host, port: proxy.port, MTProxy: true, secret: proxy.secret || "" };
  }
  const socksType = proxy.type === "socks5" ? 5 : 4;
  const opt: Record<string, unknown> = { ip: proxy.host, port: proxy.port, socksType };
  if (proxy.username) opt["username"] = proxy.username;
  if (proxy.password) opt["password"] = proxy.password;
  return opt;
}

// Per-account API credentials cache (populated from my.telegram.org extraction)
const accountApiCredentials = new Map<string, { apiId: number; apiHash: string }>();

export function setAccountApiCredentials(accountId: string, apiId: number, apiHash: string) {
  accountApiCredentials.set(accountId, { apiId, apiHash });
  logger.info({ accountId, apiId }, "Per-account API credentials stored");
}

async function createAndPoolClient(
  accountId: string,
  sessionString: string,
  proxy?: ProxyConfig,
  customApiId?: number,
  customApiHash?: string,
): Promise<TelegramClient> {
  const session = new StringSession(sessionString);
  const device = getDeviceProfile(accountId);
  const connectionOptions: Record<string, unknown> = { ...BASE_CONNECTION_OPTIONS, ...device };

  // Use per-account credentials if available, otherwise fall back to server-wide env vars
  const perAccCreds = accountApiCredentials.get(accountId);
  const effectiveApiId   = customApiId   ?? perAccCreds?.apiId   ?? API_ID;
  const effectiveApiHash = customApiHash ?? perAccCreds?.apiHash ?? API_HASH;

  // Apply proxy if provided or found in cache
  const effectiveProxy = proxy ?? proxyCache.get(accountId);
  if (effectiveProxy) {
    connectionOptions["proxy"] = buildProxyOption(effectiveProxy);
    logger.debug({ accountId, proxy: `${effectiveProxy.type}://${effectiveProxy.host}:${effectiveProxy.port}` }, "Using proxy");
  }

  const usingCustomCreds = effectiveApiId !== API_ID;
  logger.debug({ accountId, device: device.deviceModel, usingCustomCreds, apiId: effectiveApiId }, "Connecting with device profile");
  const client = new TelegramClient(session, effectiveApiId, effectiveApiHash, connectionOptions as any);

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
  proxy?: ProxyConfig,
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

  // Register proxy in cache so reconnects also use it
  if (proxy) setAccountProxy(accountId, proxy);

  const promise = createAndPoolClient(accountId, sessionString, proxy);
  connecting.set(accountId, promise);
  return promise;
}

// ─── Create fresh (unauthenticated) client for auth flow ─────────────────────

export function createFreshClient(): TelegramClient {
  const session = new StringSession("");
  // Fresh clients (auth flow) use a random Arabic mobile device profile
  const randomProfile = DEVICE_PROFILES[Math.floor(Math.random() * DEVICE_PROFILES.length)]!;
  return new TelegramClient(session, API_ID, API_HASH, {
    ...BASE_CONNECTION_OPTIONS,
    ...randomProfile,
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
