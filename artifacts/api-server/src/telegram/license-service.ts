/**
 * LICENSE SERVICE — Falkon Pro Licensing System
 * ===============================================
 * - ترخيص مرتبط برقم الهاتف والجهاز (HWID)
 * - تاريخ انتهاء محدد من الأدمن
 * - لا يعمل على جهاز أو رقم آخر
 * - سجل كامل لكل عملية تحقق
 *
 * ENV: ADMIN_SECRET_KEY — required for admin operations
 */

import { dbPool } from "./session-store.js";
import { logger } from "../lib/logger.js";
import crypto from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LicenseStatus = "pending" | "active" | "expired" | "revoked";
export type LicenseTier   = "basic" | "pro" | "enterprise";

export interface License {
  id:           string;
  licenseKey:   string;
  phone:        string;
  hwid?:        string;
  status:       LicenseStatus;
  tier:         LicenseTier;
  maxAccounts:  number;
  expiresAt:    string; // ISO string
  activatedAt?: string;
  createdAt:    string;
  createdBy:    string;
  notes?:       string;
}

export interface LicenseVerifyResult {
  valid:       boolean;
  license?:    License;
  error?:      string;
  daysLeft?:   number;
  expiringSoon?: boolean; // < 7 days
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS falkon_licenses (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    license_key   TEXT NOT NULL UNIQUE,
    phone         TEXT NOT NULL,
    hwid          TEXT,
    status        TEXT NOT NULL DEFAULT 'pending',
    tier          TEXT NOT NULL DEFAULT 'pro',
    max_accounts  INTEGER NOT NULL DEFAULT 5,
    expires_at    TIMESTAMPTZ NOT NULL,
    activated_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by    TEXT NOT NULL DEFAULT 'admin',
    notes         TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_licenses_key    ON falkon_licenses(license_key);
  CREATE INDEX IF NOT EXISTS idx_licenses_phone  ON falkon_licenses(phone);
  CREATE INDEX IF NOT EXISTS idx_licenses_status ON falkon_licenses(status);

  CREATE TABLE IF NOT EXISTS falkon_license_logs (
    id          SERIAL PRIMARY KEY,
    license_key TEXT NOT NULL,
    event       TEXT NOT NULL,
    hwid        TEXT,
    ip          TEXT,
    success     BOOLEAN NOT NULL DEFAULT TRUE,
    message     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_license_logs_key ON falkon_license_logs(license_key);
  CREATE INDEX IF NOT EXISTS idx_license_logs_at  ON falkon_license_logs(created_at DESC);
`;

let schemaReady = false;
export async function ensureLicenseSchema() {
  if (schemaReady) return;
  await dbPool.query(SCHEMA_SQL);
  schemaReady = true;
  logger.info("license-service: schema ready");
}

ensureLicenseSchema().catch(err => logger.error({ err: String(err) }, "license schema init failed"));

// ─── Key generation ───────────────────────────────────────────────────────────

export function generateLicenseKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars (0,O,I,1)
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `FK-${seg()}-${seg()}-${seg()}-${seg()}`;
}

// ─── Admin: Create license ─────────────────────────────────────────────────────

export async function createLicense(params: {
  phone:       string;
  expiresAt:   Date;
  tier?:       LicenseTier;
  maxAccounts?: number;
  notes?:      string;
  createdBy?:  string;
}): Promise<License> {
  await ensureLicenseSchema();

  const key = generateLicenseKey();

  const res = await dbPool.query(`
    INSERT INTO falkon_licenses
      (license_key, phone, status, tier, max_accounts, expires_at, created_by, notes)
    VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7)
    RETURNING *
  `, [
    key,
    params.phone.trim(),
    params.tier ?? "pro",
    params.maxAccounts ?? 5,
    params.expiresAt.toISOString(),
    params.createdBy ?? "admin",
    params.notes ?? null,
  ]);

  const lic = rowToLicense(res.rows[0]);
  logger.info({ licenseKey: key, phone: params.phone, tier: lic.tier }, "License created");
  return lic;
}

// ─── User: Activate license ───────────────────────────────────────────────────

export async function activateLicense(params: {
  licenseKey: string;
  phone:      string;
  hwid:       string;
  ip?:        string;
}): Promise<LicenseVerifyResult> {
  await ensureLicenseSchema();

  const { licenseKey, phone, hwid, ip } = params;
  const cleanKey   = licenseKey.trim().toUpperCase();
  const cleanPhone = phone.trim();

  const res = await dbPool.query(
    "SELECT * FROM falkon_licenses WHERE license_key = $1",
    [cleanKey]
  );

  const row = res.rows[0];

  // Key doesn't exist
  if (!row) {
    await logEvent(cleanKey, "activate", hwid, ip, false, "مفتاح غير موجود");
    return { valid: false, error: "مفتاح الترخيص غير صحيح" };
  }

  const lic = rowToLicense(row);

  // Revoked
  if (lic.status === "revoked") {
    await logEvent(cleanKey, "activate", hwid, ip, false, "ترخيص مُلغى");
    return { valid: false, error: "هذا الترخيص مُلغى — تواصل مع الأدمن" };
  }

  // Expired
  if (new Date(lic.expiresAt) < new Date()) {
    await dbPool.query("UPDATE falkon_licenses SET status='expired' WHERE license_key=$1", [cleanKey]);
    await logEvent(cleanKey, "activate", hwid, ip, false, "منتهي الصلاحية");
    return { valid: false, error: "انتهت صلاحية الترخيص — تواصل مع الأدمن للتجديد" };
  }

  // Phone mismatch (if already bound)
  if (lic.status === "active" && lic.phone && lic.phone !== cleanPhone) {
    await logEvent(cleanKey, "activate", hwid, ip, false, `رقم هاتف غير مطابق: ${cleanPhone}`);
    return { valid: false, error: "هذا الترخيص مرتبط برقم هاتف مختلف" };
  }

  // HWID mismatch (if already bound to a different device)
  if (lic.status === "active" && lic.hwid && lic.hwid !== hwid) {
    await logEvent(cleanKey, "activate", hwid, ip, false, `HWID غير مطابق`);
    return { valid: false, error: "هذا الترخيص مرتبط بجهاز آخر — تواصل مع الأدمن" };
  }

  // First activation — bind phone + hwid
  await dbPool.query(`
    UPDATE falkon_licenses
    SET status='active', phone=$2, hwid=$3, activated_at=NOW()
    WHERE license_key=$1
  `, [cleanKey, cleanPhone, hwid]);

  const updatedLic = { ...lic, status: "active" as LicenseStatus, phone: cleanPhone, hwid };
  await logEvent(cleanKey, "activate", hwid, ip, true, "تم التفعيل بنجاح");

  const daysLeft = Math.ceil((new Date(lic.expiresAt).getTime() - Date.now()) / 86400000);
  logger.info({ licenseKey: cleanKey, phone: cleanPhone, daysLeft }, "License activated");

  return { valid: true, license: updatedLic, daysLeft, expiringSoon: daysLeft < 7 };
}

// ─── Verify license (called on every request) ─────────────────────────────────

// In-memory cache to avoid DB hit on every request (TTL: 60s)
const verifyCache = new Map<string, { result: LicenseVerifyResult; cachedAt: number }>();
const CACHE_TTL_MS = 60_000;

export async function verifyLicense(params: {
  licenseKey: string;
  hwid:       string;
  ip?:        string;
}): Promise<LicenseVerifyResult> {
  const { licenseKey, hwid, ip } = params;
  const cleanKey = licenseKey.trim().toUpperCase();
  const cacheKey = `${cleanKey}:${hwid}`;

  // Check cache
  const cached = verifyCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.result;
  }

  await ensureLicenseSchema();

  const res = await dbPool.query(
    "SELECT * FROM falkon_licenses WHERE license_key = $1",
    [cleanKey]
  );

  const row = res.rows[0];

  if (!row) {
    const result: LicenseVerifyResult = { valid: false, error: "مفتاح غير موجود" };
    verifyCache.set(cacheKey, { result, cachedAt: Date.now() });
    return result;
  }

  const lic = rowToLicense(row);

  // Check expiry
  if (new Date(lic.expiresAt) < new Date()) {
    if (lic.status !== "expired") {
      await dbPool.query("UPDATE falkon_licenses SET status='expired' WHERE license_key=$1", [cleanKey]);
      lic.status = "expired";
    }
    await logEvent(cleanKey, "verify", hwid, ip, false, "منتهي الصلاحية");
    const result: LicenseVerifyResult = {
      valid: false,
      error: "انتهت صلاحية الترخيص — تواصل مع الأدمن للتجديد",
    };
    verifyCache.set(cacheKey, { result, cachedAt: Date.now() });
    return result;
  }

  // Check status
  if (lic.status === "revoked") {
    const result: LicenseVerifyResult = { valid: false, error: "هذا الترخيص مُلغى" };
    verifyCache.set(cacheKey, { result, cachedAt: Date.now() });
    return result;
  }

  // HWID check
  if (lic.hwid && lic.hwid !== hwid) {
    await logEvent(cleanKey, "verify", hwid, ip, false, "HWID مختلف");
    const result: LicenseVerifyResult = { valid: false, error: "هذا الترخيص مرتبط بجهاز آخر" };
    verifyCache.set(cacheKey, { result, cachedAt: Date.now() });
    return result;
  }

  const daysLeft = Math.ceil((new Date(lic.expiresAt).getTime() - Date.now()) / 86400000);
  const result: LicenseVerifyResult = {
    valid: true,
    license: lic,
    daysLeft,
    expiringSoon: daysLeft < 7,
  };
  verifyCache.set(cacheKey, { result, cachedAt: Date.now() });
  return result;
}

// ─── Admin: List / Revoke / Renew ─────────────────────────────────────────────

export async function listLicenses(filter?: { status?: LicenseStatus; phone?: string }): Promise<License[]> {
  await ensureLicenseSchema();
  let sql = "SELECT * FROM falkon_licenses";
  const params: any[] = [];
  const conditions: string[] = [];

  if (filter?.status) { conditions.push(`status = $${params.length + 1}`); params.push(filter.status); }
  if (filter?.phone)  { conditions.push(`phone = $${params.length + 1}`);  params.push(filter.phone); }

  if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
  sql += " ORDER BY created_at DESC";

  const res = await dbPool.query(sql, params);
  return res.rows.map(rowToLicense);
}

export async function revokeLicense(licenseKey: string, reason?: string): Promise<boolean> {
  await ensureLicenseSchema();
  verifyCache.clear();
  const res = await dbPool.query(
    "UPDATE falkon_licenses SET status='revoked', notes=COALESCE($2, notes) WHERE license_key=$1 RETURNING id",
    [licenseKey.toUpperCase(), reason ?? null]
  );
  if (res.rows.length > 0) {
    await logEvent(licenseKey, "revoke", undefined, undefined, true, reason ?? "إلغاء من الأدمن");
    return true;
  }
  return false;
}

export async function renewLicense(licenseKey: string, newExpiresAt: Date): Promise<License | null> {
  await ensureLicenseSchema();
  verifyCache.clear();
  const res = await dbPool.query(`
    UPDATE falkon_licenses
    SET expires_at=$2, status=CASE WHEN status='expired' THEN 'active' ELSE status END
    WHERE license_key=$1
    RETURNING *
  `, [licenseKey.toUpperCase(), newExpiresAt.toISOString()]);
  if (res.rows.length > 0) {
    await logEvent(licenseKey, "renew", undefined, undefined, true, `تجديد حتى ${newExpiresAt.toDateString()}`);
    return rowToLicense(res.rows[0]);
  }
  return null;
}

export async function getLicenseLogs(licenseKey: string, limit = 50) {
  await ensureLicenseSchema();
  const res = await dbPool.query(
    "SELECT * FROM falkon_license_logs WHERE license_key=$1 ORDER BY created_at DESC LIMIT $2",
    [licenseKey.toUpperCase(), limit]
  );
  return res.rows;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowToLicense(row: any): License {
  return {
    id:           row.id,
    licenseKey:   row.license_key,
    phone:        row.phone,
    hwid:         row.hwid ?? undefined,
    status:       row.status,
    tier:         row.tier,
    maxAccounts:  row.max_accounts,
    expiresAt:    row.expires_at instanceof Date ? row.expires_at.toISOString() : row.expires_at,
    activatedAt:  row.activated_at ? (row.activated_at instanceof Date ? row.activated_at.toISOString() : row.activated_at) : undefined,
    createdAt:    row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    createdBy:    row.created_by,
    notes:        row.notes ?? undefined,
  };
}

async function logEvent(
  licenseKey: string, event: string, hwid?: string, ip?: string, success = true, message?: string
) {
  try {
    await dbPool.query(
      `INSERT INTO falkon_license_logs (license_key, event, hwid, ip, success, message) VALUES ($1,$2,$3,$4,$5,$6)`,
      [licenseKey, event, hwid ?? null, ip ?? null, success, message ?? null]
    );
  } catch { /* never crash on log failure */ }
}
