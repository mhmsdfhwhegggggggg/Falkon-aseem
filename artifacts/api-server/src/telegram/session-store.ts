/**
 * SESSION STORE — In-Memory with Periodic Persistence
 * =====================================================
 * Same pattern as jobs.ts: in-memory Map = fast, disk = durability.
 * All reads are O(1). Writes debounced to 5s.
 */

import fs from "fs";
import path from "path";

const DATA_DIR = process.env["DATA_DIR"] || path.join(process.cwd(), "../../data");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

export interface StoredAccount {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  username: string;
  userId: string;
  sessionString: string;
  addedAt: string;
  isActive: boolean;
  dailyAdded: number;
  lastReset: string;
}

// ─── In-memory store ─────────────────────────────────────────────────────────

const accountsMap = new Map<string, StoredAccount>();
let flushPending = false;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Boot: load from disk once
function bootLoad() {
  ensureDir();
  if (!fs.existsSync(SESSIONS_FILE)) return;
  try {
    const raw = fs.readFileSync(SESSIONS_FILE, "utf-8");
    const accounts = JSON.parse(raw) as StoredAccount[];
    for (const acc of accounts) accountsMap.set(acc.id, acc);
  } catch {
    // corrupted — start fresh
  }
}

bootLoad();

// ─── Flush (debounced, 5s) ───────────────────────────────────────────────────

function scheduleFlush() {
  if (flushPending) return;
  flushPending = true;
  setTimeout(() => {
    flushPending = false;
    flushToDisk();
  }, 5000);
}

function flushToDisk() {
  try {
    ensureDir();
    const accounts = [...accountsMap.values()];
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(accounts, null, 2));
  } catch (err) {
    console.error("[session-store] flush failed:", err);
  }
}

setInterval(flushToDisk, 30_000);
process.on("SIGTERM", () => { flushToDisk(); });
process.on("SIGINT",  () => { flushToDisk(); });

// ─── Public API ──────────────────────────────────────────────────────────────

export function loadAccounts(): StoredAccount[] {
  return [...accountsMap.values()];
}

export function getAccount(id: string): StoredAccount | undefined {
  return accountsMap.get(id);
}

export function upsertAccount(account: StoredAccount) {
  accountsMap.set(account.id, account);
  scheduleFlush();
}

export function removeAccount(id: string) {
  accountsMap.delete(id);
  scheduleFlush();
}

export function resetDailyCountsIfNeeded(account: StoredAccount): StoredAccount {
  const today = new Date().toISOString().split("T")[0];
  if (account.lastReset !== today) {
    const updated = { ...account, dailyAdded: 0, lastReset: today! };
    accountsMap.set(account.id, updated);
    scheduleFlush();
    return updated;
  }
  return account;
}
