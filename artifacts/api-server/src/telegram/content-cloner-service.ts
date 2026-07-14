/**
 * CONTENT CLONER SERVICE v1.0
 * ============================
 * نسخ ومتابعة المحتوى بين القنوات والمجموعات:
 *
 * 1. جلب الرسائل من المصدر (GetHistory)
 * 2. إعادة توجيه الرسائل للوجهة (ForwardMessages)
 * 3. تأخيرات بشرية بين كل رسالة
 * 4. معالجة FloodWait تلقائياً
 * 5. خيارات: نسخ الميديا، الاستطلاعات، الترتيب الزمني
 */

import { Api } from "telegram";
import bigInt from "big-integer";
import { getClient, getClientFromSession } from "./client-manager.js";
import { updateJob, type Job } from "./jobs.js";
import { resolveEntity } from "./entity-cache.js";
import {
  sleep,
  humanDelay,
  recordError,
  handleFloodWait,
  parseFloodWait,
  isPeerFlood,
  resetCircuit,
  getHealth,
  type DelayConfig,
} from "./anti-ban.js";
import { logger } from "../lib/logger.js";

// ─── Main function ────────────────────────────────────────────────────────────

export async function runContentCloner(job: Job) {
  const config = job.config as {
    sourceGroup: string;
    destGroup: string;
    cloneMedia: boolean;
    clonePolls: boolean;
    delaySeconds: number;
    limit: number;
    skipForwards: boolean;   // skip already-forwarded messages
    reverseOrder: boolean;   // forward oldest first
    sessionString?: string;
    allAccounts?: Array<{ id: string; sessionString?: string }>;
  };

  const {
    sourceGroup,
    destGroup,
    cloneMedia = true,
    clonePolls = false,
    delaySeconds = 5,
    limit = 100,
    skipForwards = true,
    reverseOrder = true,
  } = config;

  const accountId = job.accountId!;
  const allAccounts: Array<{ id: string; sessionString?: string }> =
    config.allAccounts ?? [{ id: accountId, sessionString: config.sessionString }];

  logger.info({ jobId: job.id, sourceGroup, destGroup, limit, cloneMedia, clonePolls }, "Starting content cloner");
  updateJob(job.id, { status: "running", startedAt: new Date().toISOString() });

  const connectAccount = async (idx: number) => {
    const acc = allAccounts[idx]!;
    return acc.sessionString
      ? await getClientFromSession(acc.sessionString, acc.id)
      : await getClient(acc.id);
  };

  let client: any;
  let sourceEntity: any;
  let destEntity: any;

  try {
    client = await connectAccount(0);
    updateJob(job.id, { status: "running", error: "🔍 تحليل المصدر والوجهة..." });

    [sourceEntity, destEntity] = await Promise.all([
      resolveEntity(client, sourceGroup),
      resolveEntity(client, destGroup),
    ]);
    updateJob(job.id, { status: "running", error: undefined });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    updateJob(job.id, { status: "failed", error: `فشل التحليل: ${msg}`, completedAt: new Date().toISOString() });
    return;
  }

  // ── Fetch messages from source ────────────────────────────────────────────
  updateJob(job.id, { status: "running", error: `📥 جلب آخر ${limit} رسالة من المصدر...` });
  let messages: any[] = [];
  try {
    const history = await client.invoke(new Api.messages.GetHistory({
      peer: sourceEntity,
      offsetId: 0,
      offsetDate: 0,
      addOffset: 0,
      limit,
      maxId: 0,
      minId: 0,
      hash: bigInt.zero,
    }));
    messages = (history as any).messages || [];
    if (reverseOrder) messages = [...messages].reverse();

    // Filter: skip polls if clonePolls=false, skip forwards if skipForwards
    messages = messages.filter((m: any) => {
      if (m.media instanceof Api.MessageMediaPoll && !clonePolls) return false;
      if (m.fwdFrom && skipForwards) return false;
      return true;
    });

    updateJob(job.id, { total: messages.length, status: "running", error: undefined });
    logger.info({ jobId: job.id, total: messages.length }, "Fetched messages to clone");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    updateJob(job.id, { status: "failed", error: `فشل جلب الرسائل: ${msg}`, completedAt: new Date().toISOString() });
    return;
  }

  // ── Forward messages ──────────────────────────────────────────────────────
  const delayConfig: DelayConfig = {
    base: delaySeconds * 1000,
    jitter: 0.4,
    min: Math.max(2000, delaySeconds * 500),
    max: delaySeconds * 2500,
  };

  let forwarded = 0;
  let failed = 0;
  const errors: string[] = [];
  let peerFloodRecoveries = 0;
  const MAX_PEER_FLOOD_RECOVERIES = 3;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;

    // ── Forward message ────────────────────────────────────────────────────
    try {
      if (!cloneMedia && msg.media && !(msg.media instanceof Api.MessageMediaWebPage)) {
        // Skip media-only messages when cloneMedia=false, but keep text
        if (!msg.message) { i++; continue; }
      }

      // Use ForwardMessages to preserve formatting + media
      await client.invoke(new Api.messages.ForwardMessages({
        fromPeer: sourceEntity,
        id: [msg.id],
        toPeer: destEntity,
        randomId: [bigInt(Math.floor(Math.random() * 1e15))],
        dropAuthor: false,
        dropMediaCaptions: false,
        noforwards: false,
      }));

      forwarded++;
      logger.info({ jobId: job.id, msgId: msg.id, forwarded, total: messages.length }, "✓ Message forwarded");

    } catch (err: unknown) {
      if (isPeerFlood(err)) {
        recordError(accountId, "peer_flood");
        if (peerFloodRecoveries >= MAX_PEER_FLOOD_RECOVERIES) {
          updateJob(job.id, {
            status: "completed",
            error: `⚠️ PeerFlood — تم نسخ ${forwarded} رسالة`,
            completedAt: new Date().toISOString(),
            result: { added: forwarded, failed, errors },
          });
          return;
        }
        peerFloodRecoveries++;
        const hNow = getHealth(accountId);
        const waitMs = Math.max(0, hNow.circuitOpenUntil - Date.now()) + 20_000;
        const waitMins = Math.ceil(waitMs / 60_000);
        updateJob(job.id, {
          status: "running",
          error: `⏳ PeerFlood — انتظار ${waitMins} دقيقة (نُسخ ${forwarded}) · محاولة ${peerFloodRecoveries}/${MAX_PEER_FLOOD_RECOVERIES}`,
          result: { added: forwarded, failed, errors },
        });
        await sleep(waitMs);
        resetCircuit(accountId);
        try { client = await connectAccount(0); } catch (_) {}
        updateJob(job.id, { status: "running", error: undefined });
        i--; continue;

      } else {
        const floodSecs = parseFloodWait(err);
        if (floodSecs !== null) {
          recordError(accountId, "flood");
          updateJob(job.id, { status: "running", error: `⏳ FloodWait ${floodSecs}s...` });
          await handleFloodWait(accountId, floodSecs);
          updateJob(job.id, { status: "running", error: undefined });
          i--; continue;
        }
        const errMsg = err instanceof Error ? err.message : String(err);
        errors.push(`msg#${msg.id}: ${errMsg}`);
        failed++;
        logger.warn({ jobId: job.id, msgId: msg.id, err: errMsg }, "Forward failed");
      }
    }

    updateJob(job.id, { progress: i + 1, result: { added: forwarded, failed, errors } });

    // ── Delay between forwards ─────────────────────────────────────────────
    if (i < messages.length - 1) {
      const delayMs = humanDelay(delayConfig);
      await sleep(delayMs);
    }
  }

  updateJob(job.id, {
    status: "completed",
    completedAt: new Date().toISOString(),
    result: { added: forwarded, failed, errors },
  });
  logger.info({ jobId: job.id, forwarded, failed }, "Content cloner complete");
}
