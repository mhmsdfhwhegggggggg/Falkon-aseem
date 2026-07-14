/**
 * BULK MESSAGE SERVICE v1.0
 * ==========================
 * إرسال رسائل جماعية (DM / مجموعات / قنوات) مع حماية كاملة من الحظر:
 *
 * 1. Anti-Ban Engine مُدمج:
 *    - تأخيرات Gaussian عشوائية (لا يمكن التنبؤ بها)
 *    - معالج FloodWait تلقائي
 *    - معالج PeerFlood مع استعادة تلقائية
 *    - تدوير الحسابات عند PeerFlood
 *    - وضع التدفئة للحسابات الجديدة
 * 2. ثلاثة أوضاع:
 *    - DM: رسائل مباشرة لأفراد
 *    - group: نشر في مجموعات
 *    - channel: بث في قنوات
 * 3. دعم HTML + Markdown في الرسائل
 */

import { Api } from "telegram";
import bigInt from "big-integer";
import { getClient, getClientFromSession } from "./client-manager.js";
import { updateJob, type Job } from "./jobs.js";
import { resolveEntity, getCachedEntity, isKnownInvalid, markInvalid } from "./entity-cache.js";
import {
  sleep,
  humanDelay,
  canAct,
  recordAction,
  recordError,
  handleFloodWait,
  parseFloodWait,
  isPeerFlood,
  isNotFound,
  maybeInterleavePause,
  quietHourMultiplier,
  getHealth,
  setWarmupMode,
  resetCircuit,
  type DelayConfig,
} from "./anti-ban.js";
import { logger } from "../lib/logger.js";

// ─── Session warming ──────────────────────────────────────────────────────────

async function warmupForMessaging(client: any, accountId: string): Promise<void> {
  logger.info({ accountId }, "Warming session for messaging...");
  try {
    await client.invoke(new Api.messages.GetDialogs({
      offsetDate: 0, offsetId: 0,
      offsetPeer: new Api.InputPeerEmpty(), limit: 10, hash: bigInt.zero,
    }));
    await sleep(1000 + Math.floor(Math.random() * 1500));
    logger.info({ accountId }, "Messaging session warmed ✓");
  } catch (_) {}
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function runBulkMessage(job: Job) {
  const config = job.config as {
    mode: "dm" | "group" | "channel";
    message: string;
    targets: string[];
    delaySeconds: number;
    maxPerDay: number;
    warmup?: boolean;
    parseMode?: "html" | "markdown" | "none";
    allAccounts?: Array<{ id: string; sessionString?: string }>;
    sessionString?: string;
  };

  const {
    mode = "dm",
    message,
    targets = [],
    delaySeconds = 45,
    maxPerDay = 30,
    warmup = false,
    parseMode = "none",
  } = config;

  const accountId = job.accountId!;
  const allAccounts: Array<{ id: string; sessionString?: string }> =
    config.allAccounts ?? [{ id: accountId, sessionString: config.sessionString }];

  logger.info({ jobId: job.id, mode, targetCount: targets.length, delaySeconds, accountCount: allAccounts.length }, "Starting bulk-message");
  updateJob(job.id, { status: "running", total: targets.length, startedAt: new Date().toISOString() });

  // ── Account rotation state ─────────────────────────────────────────────────
  let currentAccIdx = 0;
  let currentAccId = allAccounts[0]!.id;
  let peerFloodRecoveries = 0;
  const MAX_PEER_FLOOD_RECOVERIES = 5;
  let adaptiveDelayMultiplier = 1.0;

  const connectAccount = async (idx: number) => {
    const acc = allAccounts[idx]!;
    return acc.sessionString
      ? await getClientFromSession(acc.sessionString, acc.id)
      : await getClient(acc.id);
  };

  let client: any;
  try {
    client = await connectAccount(0);
    if (warmup) {
      setWarmupMode(currentAccId, targets.length);
    }
    updateJob(job.id, { status: "running", error: "🔥 تدفئة الجلسة..." });
    await warmupForMessaging(client, currentAccId);
    updateJob(job.id, { status: "running", error: undefined });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    updateJob(job.id, { status: "failed", error: `فشل الاتصال: ${msg}`, completedAt: new Date().toISOString() });
    return;
  }

  // ── Delay config ───────────────────────────────────────────────────────────
  const effectiveDelay = allAccounts.length > 1
    ? Math.max(10, Math.round(delaySeconds / Math.min(allAccounts.length, 4)))
    : delaySeconds;

  const delayConfig: DelayConfig = {
    base: effectiveDelay * 1000,
    jitter: 0.4,
    min: Math.max(8000, effectiveDelay * 600),
    max: effectiveDelay * 2200,
  };

  // ── Results tracking ──────────────────────────────────────────────────────
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  const results: Array<{ target: string; status: "sent" | "failed" | "flood" | "not_found"; error?: string }> =
    targets.map((t) => ({ target: t, status: "failed" as const }));

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]!;
    const result = results[i]!;

    // ── Circuit check ────────────────────────────────────────────────────────
    if (!canAct(currentAccId, maxPerDay)) {
      const h = getHealth(currentAccId);
      const isCircuitOpen = h.circuitOpen && Date.now() < h.circuitOpenUntil;
      if (isCircuitOpen && peerFloodRecoveries < MAX_PEER_FLOOD_RECOVERIES) {
        peerFloodRecoveries++;
        const waitMs = Math.max(0, h.circuitOpenUntil - Date.now()) + 20_000;
        const waitMins = Math.ceil(waitMs / 60_000);
        updateJob(job.id, {
          status: "running",
          error: `⏳ PeerFlood — انتظار ${waitMins} دقيقة ثم الاستئناف (أُرسل ${sent} · محاولة ${peerFloodRecoveries}/${MAX_PEER_FLOOD_RECOVERIES})`,
          result: { added: sent, failed, errors },
        });
        await sleep(waitMs);
        for (const acc of allAccounts) resetCircuit(acc.id);
        currentAccIdx = 0; currentAccId = allAccounts[0]!.id;
        try { client = await connectAccount(0); await warmupForMessaging(client, currentAccId); } catch (_) {}
        updateJob(job.id, { status: "running", error: undefined });
        i--;
        continue;
      }
      updateJob(job.id, {
        status: "completed",
        error: isCircuitOpen ? `⚠️ PeerFlood: الحساب محظور مؤقتاً` : `⚠️ تم الوصول للحد اليومي (${maxPerDay}/يوم)`,
        completedAt: new Date().toISOString(),
        result: { added: sent, failed, errors },
      });
      return;
    }

    // ── Negative cache check ─────────────────────────────────────────────────
    if (isKnownInvalid(target)) {
      result.status = "not_found";
      result.error = "مستخدم غير صالح (ذاكرة سلبية)";
      failed++;
      updateJob(job.id, { progress: i + 1, result: { added: sent, failed, errors } });
      continue;
    }

    // ── Delay ────────────────────────────────────────────────────────────────
    const h = getHealth(currentAccId);
    const qm = quietHourMultiplier();
    const wm = h.warmupMode ? 1.8 : 1.0;
    const delayMs = Math.round(humanDelay(delayConfig) * qm * wm * adaptiveDelayMultiplier);

    // ── Resolve entity ───────────────────────────────────────────────────────
    let targetEntity: any;
    try {
      targetEntity = getCachedEntity(target) ?? await resolveEntity(client, target);
    } catch (err: unknown) {
      if (isNotFound(err)) {
        markInvalid(target, "Not found");
        result.status = "not_found";
        result.error = "مستخدم غير موجود";
        failed++;
      } else {
        const floodSecs = parseFloodWait(err);
        if (floodSecs !== null) {
          recordError(currentAccId, "flood");
          await handleFloodWait(currentAccId, floodSecs);
          i--; continue;
        }
        result.status = "failed";
        result.error = err instanceof Error ? err.message : String(err);
        failed++;
      }
      updateJob(job.id, { progress: i + 1, result: { added: sent, failed, errors } });
      continue;
    }

    // ── Personalize message (replace {اسم} {username} {رقم}) ────────────────
    let personalizedMessage = message;
    try {
      if (targetEntity instanceof Api.User) {
        const fn = targetEntity.firstName || "";
        const ln = targetEntity.lastName  || "";
        const un = targetEntity.username  || "";
        const ph = targetEntity.phone     || "";
        personalizedMessage = message
          .replace(/\{اسم\}/g, (fn + " " + ln).trim() || un || ph)
          .replace(/\{username\}/g, un ? `@${un}` : fn || ph)
          .replace(/\{رقم\}/g, ph);
      }
    } catch { /* keep original message if entity info unavailable */ }

    // ── Send Message ─────────────────────────────────────────────────────────
    try {
      const msgArgs: any = {
        peer: targetEntity,
        message: personalizedMessage,
        randomId: bigInt(Math.floor(Math.random() * 1e15)),
        noWebpage: true,
      };

      if (parseMode === "html") msgArgs.parseMode = "html";
      else if (parseMode === "markdown") msgArgs.parseMode = "md";

      await client.invoke(new Api.messages.SendMessage(msgArgs));

      result.status = "sent";
      sent++;
      recordAction(currentAccId);
      logger.info({ accountId: currentAccId, target, sent, total: targets.length }, "✓ Message sent");

    } catch (err: unknown) {
      if (isPeerFlood(err)) {
        recordError(currentAccId, "peer_flood");
        const nextIdx = currentAccIdx + 1;
        if (nextIdx >= allAccounts.length) {
          if (peerFloodRecoveries >= MAX_PEER_FLOOD_RECOVERIES) {
            updateJob(job.id, {
              status: "completed",
              error: `⚠️ PeerFlood متكرر — أُرسل ${sent} رسالة`,
              completedAt: new Date().toISOString(),
              result: { added: sent, failed, errors },
            });
            return;
          }
          peerFloodRecoveries++;
          adaptiveDelayMultiplier = Math.min(4.0, adaptiveDelayMultiplier * 1.5);
          const hNow = getHealth(currentAccId);
          const waitMs = Math.max(0, hNow.circuitOpenUntil - Date.now()) + 20_000;
          const waitMins = Math.ceil(waitMs / 60_000);
          updateJob(job.id, {
            status: "running",
            error: `⏳ PeerFlood — انتظار ${waitMins} دقيقة (أُرسل ${sent} · محاولة ${peerFloodRecoveries}/${MAX_PEER_FLOOD_RECOVERIES})`,
            result: { added: sent, failed, errors },
          });
          await sleep(waitMs);
          for (const acc of allAccounts) resetCircuit(acc.id);
          currentAccIdx = 0; currentAccId = allAccounts[0]!.id;
          try { client = await connectAccount(0); await warmupForMessaging(client, currentAccId); } catch (_) {}
          updateJob(job.id, { status: "running", error: undefined });
          result.status = "flood"; i--; continue;
        }
        // Switch account
        currentAccIdx = nextIdx;
        currentAccId = allAccounts[nextIdx]!.id;
        try { client = await connectAccount(currentAccIdx); await warmupForMessaging(client, currentAccId); } catch (_) {}
        updateJob(job.id, { status: "running", error: `🔄 PeerFlood → الحساب ${currentAccIdx + 1}/${allAccounts.length}` });
        result.status = "flood"; i--; continue;

      } else {
        const floodSecs = parseFloodWait(err);
        if (floodSecs !== null) {
          recordError(currentAccId, "flood");
          updateJob(job.id, { status: "running", error: `⏳ FloodWait ${floodSecs}s...` });
          await handleFloodWait(currentAccId, floodSecs);
          updateJob(job.id, { status: "running", error: undefined });
          i--; continue;
        }
        result.status = "failed";
        result.error = err instanceof Error ? err.message : String(err);
        errors.push(`${target}: ${result.error}`);
        failed++;
        recordError(currentAccId, "generic");
      }
    }

    updateJob(job.id, { progress: i + 1, result: { added: sent, failed, errors } });
    await maybeInterleavePause(i);
    if (i < targets.length - 1) await sleep(delayMs);
  }

  updateJob(job.id, {
    status: "completed",
    completedAt: new Date().toISOString(),
    result: { added: sent, failed, errors, members: results as any },
  });
  logger.info({ jobId: job.id, sent, failed }, "Bulk message complete");
}
