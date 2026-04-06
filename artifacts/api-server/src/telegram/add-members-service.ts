/**
 * ADD MEMBERS SERVICE v3.0 — SPEED FIRST
 * ========================================
 * Adds members as fast as Telegram allows with automatic error recovery.
 *
 * Flow per member:
 *   1. Resolve entity (cached after first lookup)
 *   2. InviteToChannel (or AddChatUser fallback for basic groups)
 *   3. Wait delaySeconds between successful adds
 *
 * Error handling:
 *   - FloodWait   → wait exact seconds Telegram says, then continue
 *   - PeerFlood   → rotate to next account immediately, retry same member
 *   - Already     → skip instantly (no delay)
 *   - Privacy     → skip instantly (no delay)
 *   - NotFound    → skip, cache invalid (no delay)
 */

import { Api } from "telegram";
import { getClient, getClientFromSession } from "./client-manager.js";
import { updateJob, type Job, type MemberRecord } from "./jobs.js";
import { loadMembersFile } from "./members-files.js";
import { loadAccounts, resetDailyCountsIfNeeded } from "./session-store.js";
import { getCachedEntity, isKnownInvalid, markInvalid, resolveEntity } from "./entity-cache.js";
import {
  sleep,
  parseFloodWait,
  isPeerFlood,
  isPrivacyError,
  isAlreadyMember,
  isNotFound,
  handleFloodWait,
  recordAction,
  recordError,
  resetCircuit,
} from "./anti-ban.js";
import { logger } from "../lib/logger.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Small jitter: ±20% of delayMs so adds are never perfectly uniform */
function jitter(ms: number): number {
  const pct = 0.2;
  const delta = ms * pct;
  return Math.round(ms - delta + Math.random() * delta * 2);
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function runAddMembers(job: Job) {
  const cfg = job.config as {
    targetGroup: string;
    mode: "from-file" | "by-username" | "by-id" | "from-phone";
    fileId?: string;
    usernames?: string[];
    userIds?: string[];
    delaySeconds: number;
    maxPerDay: number;
    warmup?: boolean;
    sessionString?: string;
    members?: MemberRecord[];
    allAccounts?: Array<{ id: string; sessionString?: string }>;
  };

  const {
    targetGroup,
    mode,
    fileId,
    usernames,
    userIds,
    delaySeconds = 3,
    maxPerDay = 200,
  } = cfg;

  const accountId = job.accountId!;
  const sessionString = cfg.sessionString;
  const inlineMembers = cfg.members;

  // Multi-account rotation pool
  const allAccounts: Array<{ id: string; sessionString?: string }> =
    cfg.allAccounts?.length ? cfg.allAccounts : [{ id: accountId, sessionString }];

  logger.info(
    { jobId: job.id, mode, targetGroup, delaySeconds, maxPerDay, accounts: allAccounts.length },
    "add-members v3 start"
  );
  updateJob(job.id, { status: "running", startedAt: new Date().toISOString() });

  // Reset daily count if needed
  const accountData = loadAccounts().find((a) => a.id === accountId);
  if (accountData) resetDailyCountsIfNeeded(accountData);

  // ── Build members list ───────────────────────────────────────────────────────

  let membersToAdd: MemberRecord[] = [];

  if (inlineMembers && inlineMembers.length > 0) {
    membersToAdd = inlineMembers.filter((m) => m.status === "pending");
  } else if (mode === "from-file" && fileId) {
    const file = loadMembersFile(fileId);
    if (!file) {
      updateJob(job.id, { status: "failed", error: `File ${fileId} not found`, completedAt: new Date().toISOString() });
      return;
    }
    membersToAdd = file.members.filter((m) => m.status === "pending");
  } else if (mode === "by-username" && usernames) {
    membersToAdd = usernames
      .map((u) => u.trim().replace(/^@/, ""))
      .filter(Boolean)
      .map((u) => ({ userId: "", username: u, firstName: "", lastName: "", isOnline: false, status: "pending" as const }));
  } else if (mode === "by-id" && userIds) {
    membersToAdd = userIds
      .filter(Boolean)
      .map((id) => ({ userId: id, username: "", firstName: "", lastName: "", isOnline: false, status: "pending" as const }));
  }

  if (membersToAdd.length === 0) {
    updateJob(job.id, { status: "completed", completedAt: new Date().toISOString(), result: { added: 0, failed: 0, skipped: 0, errors: [] } });
    return;
  }

  updateJob(job.id, { total: membersToAdd.length });

  // ── Account rotation state ───────────────────────────────────────────────────

  let accIdx = 0;
  let currentAccId = allAccounts[0]!.id;

  const connectAccount = async (idx: number) => {
    const acc = allAccounts[idx]!;
    return acc.sessionString
      ? getClientFromSession(acc.sessionString, acc.id)
      : getClient(acc.id);
  };

  let client: Awaited<ReturnType<typeof getClient>>;
  let targetEntity: any;

  try {
    client = await connectAccount(0);
    targetEntity = await resolveEntity(client, targetGroup);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    updateJob(job.id, { status: "failed", error: `فشل حل الهدف: ${msg}`, completedAt: new Date().toISOString() });
    return;
  }

  // ── Stats ────────────────────────────────────────────────────────────────────

  let added = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];
  let dailyCount = 0;
  const MAX_PEER_FLOOD_ROTATIONS = allAccounts.length * 3; // max total PeerFlood switches
  let peerFloodTotal = 0;

  // ── Main loop ────────────────────────────────────────────────────────────────

  for (let i = 0; i < membersToAdd.length; i++) {
    const member = membersToAdd[i]!;

    // Daily limit check
    if (dailyCount >= maxPerDay) {
      updateJob(job.id, {
        status: "completed",
        error: `✓ تم الوصول للحد اليومي: ${maxPerDay} إضافة`,
        completedAt: new Date().toISOString(),
        result: { added, failed, skipped, errors, members: membersToAdd },
      });
      return;
    }

    // Skip cached-invalid members instantly
    const identifier = member.username || member.userId;
    if (identifier && isKnownInvalid(identifier)) {
      member.status = "failed";
      member.error = "مستخدم غير صالح (مخزن مؤقتاً)";
      failed++;
      skipped++;
      updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: membersToAdd } });
      continue;
    }

    // ── Resolve entity ───────────────────────────────────────────────────────
    // Priority: 1) cached entity  2) InputUser from accessHash  3) username lookup  4) fail

    let userEntity: any;
    try {
      // Check entity cache first (populated by extraction in same session)
      const cached = member.username
        ? getCachedEntity(member.username) ?? (member.userId ? getCachedEntity(member.userId) : null)
        : member.userId ? getCachedEntity(member.userId) : null;

      if (cached) {
        userEntity = cached;
      } else if (member.userId && member.accessHash) {
        // Build InputUser directly from stored userId + accessHash — no API call needed
        userEntity = new Api.InputUser({
          userId: BigInt(member.userId),
          accessHash: BigInt(member.accessHash),
        });
      } else if (member.username) {
        userEntity = await resolveEntity(client, member.username);
      } else if (member.userId) {
        // No username, no accessHash — try resolving by ID (will likely fail for channels)
        userEntity = await resolveEntity(client, member.userId);
      } else {
        member.status = "failed";
        member.error = "لا يوجد username أو ID";
        failed++;
        updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: membersToAdd } });
        continue;
      }
    } catch (err: unknown) {
      if (isNotFound(err)) {
        if (identifier) markInvalid(identifier, "Not found");
        member.status = "failed";
        member.error = "مستخدم غير موجود";
        failed++;
        skipped++;
        updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: membersToAdd } });
        continue;
      }

      const floodSecs = parseFloodWait(err);
      if (floodSecs !== null) {
        recordError(currentAccId, "flood");
        updateJob(job.id, {
          status: "running",
          error: `⏳ FloodWait ${floodSecs}s — جارٍ الانتظار...`,
          result: { added, failed, skipped, errors, members: membersToAdd },
        });
        await handleFloodWait(currentAccId, floodSecs);
        updateJob(job.id, { status: "running", error: undefined });
        i--;
        continue;
      }

      member.status = "failed";
      member.error = err instanceof Error ? err.message : String(err);
      failed++;
      errors.push(`${identifier}: ${member.error}`);
      updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: membersToAdd } });
      continue;
    }

    // ── Invoke add ────────────────────────────────────────────────────────────

    try {
      try {
        await client.invoke(new Api.channels.InviteToChannel({ channel: targetEntity, users: [userEntity] }));
      } catch (innerErr: unknown) {
        const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
        if (msg.includes("CHAT_ID_INVALID") || msg.includes("PEER_ID_INVALID")) {
          await client.invoke(new Api.messages.AddChatUser({ chatId: targetEntity.id, userId: userEntity, fwdLimit: 50 }));
        } else {
          throw innerErr;
        }
      }

      // ── SUCCESS ─────────────────────────────────────────────────────────────
      member.status = "added";
      added++;
      dailyCount++;
      recordAction(currentAccId);

      logger.info({ account: currentAccId, user: member.username || member.userId, added, total: membersToAdd.length }, "✓ added");

      updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: membersToAdd } });

      // Only delay AFTER successful adds — skip/fail moves instantly
      if (i < membersToAdd.length - 1) {
        await sleep(jitter(delaySeconds * 1000));
      }

    } catch (err: unknown) {

      if (isAlreadyMember(err)) {
        member.status = "already_member";
        skipped++;
        updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: membersToAdd } });
        // No delay for already-member (instant skip)

      } else if (isPrivacyError(err)) {
        member.status = "privacy";
        member.error = "إعدادات الخصوصية";
        skipped++;
        if (member.username) markInvalid(member.username, "Privacy");
        updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: membersToAdd } });
        // No delay for privacy errors (instant skip)

      } else if (isPeerFlood(err)) {
        recordError(currentAccId, "peer_flood");
        peerFloodTotal++;

        const nextIdx = accIdx + 1;
        if (nextIdx < allAccounts.length) {
          // Rotate to next account immediately
          accIdx = nextIdx;
          currentAccId = allAccounts[nextIdx]!.id;

          updateJob(job.id, {
            status: "running",
            error: `🔄 PeerFlood → الحساب ${accIdx + 1}/${allAccounts.length}`,
            result: { added, failed, skipped, errors, members: membersToAdd },
          });

          try {
            client = await connectAccount(accIdx);
            updateJob(job.id, { status: "running", error: undefined });
          } catch (connErr) {
            logger.error({ connErr }, "Failed to connect next account");
          }

          member.status = "flood";
          member.error = `PeerFlood → حساب ${accIdx + 1}`;
          i--; // retry same member with new account
          continue;

        } else if (peerFloodTotal >= MAX_PEER_FLOOD_ROTATIONS) {
          // All accounts exhausted — stop
          const msg = `⚠️ جميع الحسابات وصلت لـPeerFlood. أُضيف ${added} عضو.`;
          errors.push(msg);
          updateJob(job.id, {
            status: "completed",
            error: msg,
            completedAt: new Date().toISOString(),
            result: { added, failed, skipped, errors, members: membersToAdd },
          });
          return;

        } else {
          // All accounts PeerFlooded — wait & reset from first account
          accIdx = 0;
          currentAccId = allAccounts[0]!.id;
          const waitMs = 5 * 60 * 1000; // 5 minutes cooldown
          const waitMins = 5;

          updateJob(job.id, {
            status: "running",
            error: `⏳ جميع الحسابات PeerFlood — انتظار ${waitMins} دقيقة ثم الاستئناف`,
            result: { added, failed, skipped, errors, members: membersToAdd },
          });

          await sleep(waitMs);
          for (const acc of allAccounts) resetCircuit(acc.id);

          try {
            client = await connectAccount(0);
            updateJob(job.id, { status: "running", error: undefined });
          } catch (_) {}

          member.status = "flood";
          member.error = `PeerFlood — استُؤنف بعد ${waitMins} دقيقة`;
          i--;
          continue;
        }

      } else {
        const floodSecs = parseFloodWait(err);
        if (floodSecs !== null) {
          member.status = "flood";
          member.error = `FloodWait ${floodSecs}s`;
          recordError(currentAccId, "flood");

          updateJob(job.id, {
            status: "running",
            error: `⏳ FloodWait ${floodSecs}s — جارٍ الانتظار...`,
            result: { added, failed, skipped, errors, members: membersToAdd },
          });

          await handleFloodWait(currentAccId, floodSecs);
          updateJob(job.id, { status: "running", error: undefined });
          i--; // retry same member
          continue;
        }

        // Other error — skip and move on
        member.status = "failed";
        member.error = err instanceof Error ? err.message : String(err);
        failed++;
        errors.push(`${identifier}: ${member.error}`);
        updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: membersToAdd } });
      }
    }
  }

  // ── Done ──────────────────────────────────────────────────────────────────

  logger.info({ jobId: job.id, added, failed, skipped, total: membersToAdd.length }, "add-members v3 done");

  updateJob(job.id, {
    status: "completed",
    progress: membersToAdd.length,
    completedAt: new Date().toISOString(),
    result: { added, failed, skipped, errors, members: membersToAdd },
  });
}
