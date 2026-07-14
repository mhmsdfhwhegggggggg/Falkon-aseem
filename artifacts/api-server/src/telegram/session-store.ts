/**
 * SESSION STORE v5.0 — PostgreSQL Backed
 * =========================================
 * استبدال sessions.json بـ PostgreSQL
 * الجلسات تُحفظ للأبد، آمن للـ multi-instance، يدعم مئات الآلاف من الحسابات
 *
 * ENV: DATABASE_URL
 * DEPS: pnpm --filter @workspace/api-server add pg
 *       pnpm --filter @workspace/api-server add -D @types/pg
 */

import pg from "pg";
import { logger } from "../lib/logger.js";
import { decryptSensitive, encryptSensitive, isEncryptedSensitive } from "../auth/data-crypto.js";

const { Pool } = pg;

export const dbPool = new Pool({
  connectionString: process.env["DATABASE_URL"]!,
  ssl: process.env["NODE_ENV"] === "production" ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

dbPool.on("error", (err) => logger.error({ err: err.message }, "[session-store] Pool error"));

const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS falkon_accounts (
    id           TEXT PRIMARY KEY,
    phone        TEXT    NOT NULL DEFAULT '',
    first_name   TEXT    NOT NULL DEFAULT '',
    last_name    TEXT    NOT NULL DEFAULT '',
    username     TEXT    NOT NULL DEFAULT '',
    user_id      TEXT    NOT NULL DEFAULT '',
    session_str  TEXT    NOT NULL DEFAULT '',
    added_at     TEXT    NOT NULL DEFAULT NOW()::TEXT,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    daily_added  INTEGER NOT NULL DEFAULT 0,
    last_reset   TEXT    NOT NULL DEFAULT '',
    owner_hwid   TEXT    NOT NULL DEFAULT 'default',
    api_id       INTEGER,
    api_hash     TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_falkon_accounts_owner ON falkon_accounts(owner_hwid);
  CREATE INDEX IF NOT EXISTS idx_falkon_accounts_active ON falkon_accounts(is_active);
`;

let initialized = false;
async function ensureSchema() {
  if (initialized) return;
  await dbPool.query(INIT_SQL);
  initialized = true;
  logger.info("session-store: PostgreSQL schema ready");
}

export interface StoredAccount {
  id:           string;
  phone:        string;
  firstName:    string;
  lastName:     string;
  username:     string;
  userId:       string;
  sessionString: string;
  addedAt:      string;
  isActive:     boolean;
  dailyAdded:   number;
  lastReset:    string;
  ownerHwid?:   string;
  // Auto-extracted from my.telegram.org
  apiId?:       number;
  apiHash?:     string;
}

function rowToAccount(row: any): StoredAccount {
  return {
    id: row.id, phone: row.phone, firstName: row.first_name, lastName: row.last_name,
    username: row.username, userId: row.user_id, sessionString: decryptSensitive(row.session_str),
    addedAt: row.added_at, isActive: row.is_active,
    dailyAdded: row.daily_added, lastReset: row.last_reset, ownerHwid: row.owner_hwid,
    apiId: row.api_id ?? undefined,
    apiHash: row.api_hash ? decryptSensitive(row.api_hash) : undefined,
  };
}

const accountsMap = new Map<string, StoredAccount>();
let cacheReady = false;

async function bootLoad() {
  await ensureSchema();
  try {
    const res = await dbPool.query("SELECT * FROM falkon_accounts ORDER BY added_at ASC");
    let migratedSecrets = 0;
    for (const row of res.rows) {
      try {
        const encryptedSession = encryptSensitive(row.session_str);
        const encryptedApiHash = row.api_hash ? encryptSensitive(row.api_hash) : null;
        const needsMigration =
          (!isEncryptedSensitive(row.session_str) && encryptedSession !== row.session_str) ||
          (row.api_hash && !isEncryptedSensitive(row.api_hash) && encryptedApiHash !== row.api_hash);
        if (needsMigration) {
          await dbPool.query(
            "UPDATE falkon_accounts SET session_str = $2, api_hash = $3 WHERE id = $1",
            [row.id, encryptedSession, encryptedApiHash]
          );
          migratedSecrets += 1;
        }
        accountsMap.set(row.id, rowToAccount({
          ...row,
          session_str: encryptedSession,
          api_hash: encryptedApiHash,
        }));
      } catch (err) {
        logger.error({ accountId: row.id, err: String(err) }, "session-store: unable to load encrypted account");
      }
    }
    cacheReady = true;
    logger.info({ count: accountsMap.size, migratedSecrets }, "session-store: loaded from PostgreSQL");
  } catch (err) {
    logger.error({ err: String(err) }, "session-store: boot load failed");
    cacheReady = true;
  }
}

bootLoad().catch((err) => logger.error({ err: String(err) }, "session-store: boot failed"));

export function loadAccounts(ownerHwid?: string): StoredAccount[] {
  const all = [...accountsMap.values()];
  if (!ownerHwid) return all;
  return all.filter((a) => !a.ownerHwid || a.ownerHwid === ownerHwid || a.ownerHwid === "default");
}

export function getAccount(id: string): StoredAccount | undefined {
  return accountsMap.get(id);
}

export async function upsertAccount(account: StoredAccount): Promise<void> {
  await ensureSchema();
  await dbPool.query(
    `INSERT INTO falkon_accounts
       (id, phone, first_name, last_name, username, user_id, session_str, added_at, is_active, daily_added, last_reset, owner_hwid, api_id, api_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (id) DO UPDATE SET
       phone=$2, first_name=$3, last_name=$4, username=$5, user_id=$6, session_str=$7,
       is_active=$9, daily_added=$10, last_reset=$11, owner_hwid=$12,
       api_id=$13, api_hash=$14`,
    [account.id, account.phone, account.firstName, account.lastName, account.username,
     account.userId, encryptSensitive(account.sessionString), account.addedAt, account.isActive,
     account.dailyAdded, account.lastReset, account.ownerHwid ?? "default",
     account.apiId ?? null, account.apiHash ? encryptSensitive(account.apiHash) : null]
  );
  accountsMap.set(account.id, account);
}

export async function removeAccount(id: string): Promise<void> {
  await ensureSchema();
  await dbPool.query("DELETE FROM falkon_accounts WHERE id = $1", [id]);
  accountsMap.delete(id);
}

export async function resetDailyCountsIfNeeded(account: StoredAccount): Promise<StoredAccount> {
  const today = new Date().toISOString().split("T")[0]!;
  if (account.lastReset !== today) {
    const updated = { ...account, dailyAdded: 0, lastReset: today };
    await upsertAccount(updated);
    return updated;
  }
  return account;
}
