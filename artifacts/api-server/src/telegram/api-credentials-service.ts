/**
 * API CREDENTIALS SERVICE — Auto-Extract from my.telegram.org
 * =============================================================
 * يستخرج API_ID و API_HASH تلقائياً من my.telegram.org عند إضافة حساب جديد
 *
 * الخطوات:
 * 1. المستخدم يُدخل رقم الهاتف → نرسله إلى my.telegram.org
 * 2. يصل OTP إلى تطبيق Telegram الخاص بالمستخدم
 * 3. المستخدم يُدخل OTP → نحصل على session cookie
 * 4. نسحب صفحة /apps ونستخرج api_id و api_hash
 * 5. إذا لم يكن لديه app، ننشئ واحداً تلقائياً
 */

import { logger } from "../lib/logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApiCredentials {
  apiId:   number;
  apiHash: string;
}

interface PendingSession {
  phone:      string;
  randomHash: string;
  cookies:    string;
  expiresAt:  number; // timestamp ms
}

// ─── In-memory session store ───────────────────────────────────────────────────
// Sessions expire after 10 minutes (OTP validity window)

const pendingSessions = new Map<string, PendingSession>();

// Cleanup expired sessions every minute
setInterval(() => {
  const now = Date.now();
  for (const [id, sess] of pendingSessions) {
    if (now > sess.expiresAt) pendingSessions.delete(id);
  }
}, 60_000);

// ─── HTTP helper ──────────────────────────────────────────────────────────────

const BASE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21C62",
  "Accept": "application/json, text/html, */*",
  "Accept-Language": "ar,en-US;q=0.9",
  "X-Requested-With": "XMLHttpRequest",
  "Origin": "https://my.telegram.org",
  "Referer": "https://my.telegram.org/auth",
};

function parseCookies(setCookieHeaders: string[]): string {
  return setCookieHeaders
    .map(c => c.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

// ─── Step 1: Request OTP ──────────────────────────────────────────────────────

export async function requestApiOtp(phone: string): Promise<{ sessionId: string }> {
  logger.info({ phone }, "API credentials: requesting OTP from my.telegram.org");

  const resp = await fetch("https://my.telegram.org/auth/send_password", {
    method: "POST",
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ phone }).toString(),
  });

  if (!resp.ok) {
    throw new Error(`my.telegram.org returned ${resp.status}: ${await resp.text()}`);
  }

  const data = await resp.json() as { random_hash?: string; error?: string };

  if (data.error) throw new Error(`Telegram error: ${data.error}`);
  if (!data.random_hash) throw new Error("No random_hash in response");

  // Extract cookies for session continuation
  const setCookies = resp.headers.getSetCookie?.() ?? [];
  const cookies = parseCookies(Array.isArray(setCookies) ? setCookies : [setCookies as string]);

  const sessionId = `apiotp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  pendingSessions.set(sessionId, {
    phone,
    randomHash: data.random_hash,
    cookies,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 min
  });

  logger.info({ sessionId, phone }, "API credentials: OTP sent, session created");
  return { sessionId };
}

// ─── Step 2: Confirm OTP and get credentials ───────────────────────────────────

export async function confirmApiOtpAndGetCredentials(
  sessionId: string,
  otp: string,
): Promise<ApiCredentials> {
  const sess = pendingSessions.get(sessionId);
  if (!sess) throw new Error("Session not found or expired — request new OTP");
  if (Date.now() > sess.expiresAt) {
    pendingSessions.delete(sessionId);
    throw new Error("OTP expired — request new OTP");
  }

  logger.info({ sessionId, phone: sess.phone }, "API credentials: confirming OTP");

  // ── Login to my.telegram.org ──────────────────────────────────────────────
  const loginResp = await fetch("https://my.telegram.org/auth/login", {
    method: "POST",
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": sess.cookies,
    },
    body: new URLSearchParams({
      phone:       sess.phone,
      random_hash: sess.randomHash,
      password:    otp.trim(),
    }).toString(),
  });

  if (!loginResp.ok) {
    throw new Error(`Login failed: ${await loginResp.text()}`);
  }

  const loginText = await loginResp.text();
  if (loginText.includes("error") || loginText.includes("false")) {
    throw new Error(`Invalid OTP: ${loginText}`);
  }

  // Merge cookies from login response
  const newCookies = loginResp.headers.getSetCookie?.() ?? [];
  const mergedCookies = sess.cookies + "; " + parseCookies(
    Array.isArray(newCookies) ? newCookies : [newCookies as string]
  );

  // ── Fetch /apps page ──────────────────────────────────────────────────────
  const appsResp = await fetch("https://my.telegram.org/apps", {
    headers: { ...BASE_HEADERS, "Cookie": mergedCookies },
  });

  if (!appsResp.ok) {
    throw new Error(`Failed to load apps page: ${appsResp.status}`);
  }

  const html = await appsResp.text();

  // ── Parse existing credentials ────────────────────────────────────────────
  let creds = parseCredentialsFromHtml(html);

  if (creds) {
    logger.info({ phone: sess.phone, apiId: creds.apiId }, "API credentials: found existing app");
    pendingSessions.delete(sessionId);
    return creds;
  }

  // ── No app exists — create one automatically ──────────────────────────────
  logger.info({ phone: sess.phone }, "No existing app — creating automatically");

  // Extract CSRF hash for form submission
  const hashMatch = html.match(/name="hash"\s+value="([^"]+)"/);
  const formHash  = hashMatch?.[1] ?? "";

  const createResp = await fetch("https://my.telegram.org/apps/create", {
    method: "POST",
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": mergedCookies,
    },
    body: new URLSearchParams({
      hash:          formHash,
      app_title:     "FalkonPro",
      app_shortname: "falkonpro",
      app_url:       "",
      app_platform:  "android",
      app_desc:      "Falkon Pro Automation",
    }).toString(),
  });

  if (!createResp.ok) {
    throw new Error(`App creation failed: ${await createResp.text()}`);
  }

  // Fetch apps page again after creation
  const appsResp2 = await fetch("https://my.telegram.org/apps", {
    headers: { ...BASE_HEADERS, "Cookie": mergedCookies },
  });
  const html2 = await appsResp2.text();
  creds = parseCredentialsFromHtml(html2);

  if (!creds) {
    throw new Error("Could not extract API credentials after app creation");
  }

  logger.info({ phone: sess.phone, apiId: creds.apiId }, "API credentials: app created successfully");
  pendingSessions.delete(sessionId);
  return creds;
}

// ─── HTML Parser ──────────────────────────────────────────────────────────────

function parseCredentialsFromHtml(html: string): ApiCredentials | null {
  // Pattern 1: Input fields with values
  const apiIdInput  = html.match(/app_id["'\s]+value=["'](\d+)/i)
    ?? html.match(/Api Id[^<]*<[^>]+>(\d{4,9})/i)
    ?? html.match(/"app_id"\s*:\s*(\d+)/i)
    ?? html.match(/>\s*(\d{4,9})\s*<[/](?:span|td|div)/i);

  const apiHashInput = html.match(/app_hash["'\s]+value=["']([a-f0-9]{32})/i)
    ?? html.match(/Api Hash[^<]*<[^>]+>([a-f0-9]{32})/i)
    ?? html.match(/"app_hash"\s*:\s*"([a-f0-9]{32})"/i)
    ?? html.match(/>\s*([a-f0-9]{32})\s*</i);

  if (apiIdInput && apiHashInput) {
    const apiId   = parseInt(apiIdInput[1]!);
    const apiHash = apiHashInput[1]!;
    if (apiId > 1000 && apiHash.length === 32) {
      return { apiId, apiHash };
    }
  }
  return null;
}
