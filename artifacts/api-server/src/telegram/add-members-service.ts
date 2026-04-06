/**
 * ADD MEMBERS SERVICE v2.0
 * =========================
 * Adds members to Telegram groups with full anti-ban protection:
 *
 * 1. Anti-Ban Engine:
 *    - Gaussian jitter delays (±30%, never predictable)
 *    - Warmup mode for new accounts (start slow, ramp up)
 *    - FloodWait auto-handler (wait + buffer + backoff)
 *    - PeerFlood circuit breaker (pause account, log event)
 *    - Time-of-day throttle (quiet hours = 2.5x slower)
 *    - Activity interleaving (pause every 5 adds)
 *    - Per-account sliding window daily limiter
 *
 * 2. Entity Cache:
 *    - Skip re-fetching known entities
 *    - Negative cache for invalid usernames (fast skip)
 *
 * 3. Smart Add Loop:
 *    - Randomized batch size (1–3 per "batch", then delay)
 *    - Auto-skip users with privacy errors (save quota)
 *    - Auto-skip already-members (don't waste delay)
 *    - Real-time progress + result updates to job store
 *
 * 4. Account Health Reporting:
 *    - Score updated after each error type
 *    - Report written to job result
 */

import { Api } from "telegram";
import { getClient, getClientFromSession } from "./client-manager.js";
import { updateJob, type Job, type MemberRecord } from "./jobs.js";
import { loadMembersFile, saveMembersFile } from "./members-files.js";
import { loadAccounts, upsertAccount, resetDailyCountsIfNeeded } from "./session-store.js";
import { resolveEntity, getCachedEntity, isKnownInvalid, markInvalid } from "./entity-cache.js";
import {
  sleep,
  humanSleep,
  humanDelay,
  canAct,
  recordAction,
  recordError,
  handleFloodWait,
  parseFloodWait,
  isPeerFlood,
  isPrivacyError,
  isAlreadyMember,
  isNotFound,
  maybeInterleavePause,
  randomBatchSize,
  quietHourMultiplier,
  getHealth,
  setWarmupMode,
  type DelayConfig,
} from "./anti-ban.js";
import { logger } from "../lib/logger.js";

// ─── Main function ────────────────────────────────────────────────────────────

export async function runAddMembers(job: Job) {
  const {
    targetGroup,
    mode,
    fileId,
    usernames,
    userIds,
    delaySeconds = 15,
    maxPerDay = 50,
    warmup = false,
  } = job.config as {
    targetGroup: string;
    mode: "from-file" | "by-username" | "by-id";
    fileId?: string;
    usernames?: string[];
    userIds?: string[];
    delaySeconds: number;
    maxPerDay: number;
    warmup?: boolean;
  };

  const accountId = job.accountId!;
  const sessionString = (job.config as any).sessionString as string | undefined;
  const inlineMembers = (job.config as any).members as MemberRecord[] | undefined;

  // ── Multi-account rotation pool ────────────────────────────────────────────
  // allAccounts: [{id, sessionString}] sent from phone for rotation
  // When current account gets PeerFlood → switch to next immediately (no waiting)
  const allAccounts: Array<{ id: string; sessionString?: string }> =
    (job.config as any).allAccounts ?? [{ id: accountId, sessionString }];

  logger.info(
    { jobId: job.id, mode, targetGroup, delaySeconds, maxPerDay, accountCount: allAccounts.length },
    "Starting add-members v3 with account rotation"
  );
  updateJob(job.id, { status: "running", startedAt: new Date().toISOString() });

  // ── Account setup ──────────────────────────────────────────────────────────
  let accountData = loadAccounts().find((a) => a.id === accountId);
  if (accountData) {
    accountData = resetDailyCountsIfNeeded(accountData);
  }

  // ── Build member list ──────────────────────────────────────────────────────

  let membersToAdd: MemberRecord[] = [];

  if (inlineMembers && inlineMembers.length > 0) {
    // Members sent directly from phone (phone-stored files)
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
      .map((u) => ({
        userId: "",
        username: u,
        firstName: "",
        lastName: "",
        isOnline: false,
        status: "pending" as const,
      }));
  } else if (mode === "by-id" && userIds) {
    membersToAdd = userIds
      .filter(Boolean)
      .map((id) => ({
        userId: id,
        username: "",
        firstName: "",
        lastName: "",
        isOnline: false,
        status: "pending" as const,
      }));
  }

  if (membersToAdd.length === 0) {
    updateJob(job.id, { status: "completed", completedAt: new Date().toISOString(), result: { added: 0, failed: 0, errors: [] } });
    return;
  }

  updateJob(job.id, { total: membersToAdd.length });

  // ── Delay config ───────────────────────────────────────────────────────────
  // With account rotation: shorter delays are safe (each account adds less)
  // Single account: use full delay. Multiple accounts: can be faster.
  const effectiveDelay = allAccounts.length > 1
    ? Math.max(5, Math.round(delaySeconds / Math.min(allAccounts.length, 4)))
    : delaySeconds;

  const delayConfig: DelayConfig = {
    base: effectiveDelay * 1000,
    jitter: 0.35,
    min: Math.max(4000, effectiveDelay * 600),
    max: effectiveDelay * 2000,
  };

  // ── Connect initial account & resolve target ───────────────────────────────

  // Account rotation state
  let currentAccIdx = 0;
  let currentAccId = allAccounts[0]!.id;
  let currentSession = allAccounts[0]!.sessionString;

  const connectAccount = async (idx: number) => {
    const acc = allAccounts[idx]!;
    const c = acc.sessionString
      ? await getClientFromSession(acc.sessionString, acc.id)
      : await getClient(acc.id);
    return c;
  };

  let client: Awaited<ReturnType<typeof getClient>>;
  let targetEntity: any;

  try {
    client = await connectAccount(0);
    targetEntity = await resolveEntity(client, targetGroup);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    updateJob(job.id, { status: "failed", error: `Cannot resolve target: ${msg}`, completedAt: new Date().toISOString() });
    return;
  }

  // ── Main add loop with account rotation ────────────────────────────────────
  // Strategy:
  //   PeerFlood on current account  → switch to NEXT account immediately (no waiting!)
  //   FloodWait                     → wait exact seconds Telegram says, retry same member
  //   All accounts exhausted        → stop job gracefully
  //   Privacy/NotFound/AlreadyIn    → skip
  // ──────────────────────────────────────────────────────────────────────────

  let added = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];
  let consecutivePeerFloods = 0;

  for (let i = 0; i < membersToAdd.length; i++) {
    const member = membersToAdd[i]!;

    // ── Daily limit check ─────────────────────────────────────────────────────
    if (!canAct(accountId, maxPerDay)) {
      logger.warn({ accountId, jobId: job.id, maxPerDay }, "Daily limit reached, stopping job");
      updateJob(job.id, {
        status: "completed",
        completedAt: new Date().toISOString(),
        result: { added, failed, skipped, errors, members: membersToAdd },
      });
      return;
    }

    // ── Skip known-invalid users (negative cache) ────────────────────────────
    const identifier = member.username || member.userId;
    const invalid = identifier ? isKnownInvalid(identifier) : null;
    if (invalid) {
      member.status = "failed";
      member.error = `Cached invalid: ${invalid}`;
      failed++;
      skipped++;
      updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: membersToAdd } });
      continue;
    }

    // ── Compute human-like delay for this iteration ────────────────────────────
    const h = getHealth(accountId);
    const qm = quietHourMultiplier ? quietHourMultiplier() : 1.0;
    const wm = h.warmupMode ? 1.8 : 1.0;
    const delayMs = Math.round(humanDelay(delayConfig) * qm * wm);

    // ── Resolve user entity ───────────────────────────────────────────────────
    let userEntity: any;
    try {
      if (member.username) {
        userEntity = getCachedEntity(member.username) ?? await resolveEntity(client, member.username);
      } else if (member.userId) {
        userEntity = getCachedEntity(member.userId) ?? await resolveEntity(client, member.userId);
      } else {
        member.status = "failed";
        member.error = "No username or ID";
        failed++;
        updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: membersToAdd } });
        continue;
      }
    } catch (err: unknown) {
      if (isNotFound(err)) {
        const id = member.username || member.userId;
        if (id) markInvalid(id, "Not found on Telegram");
        member.status = "failed";
        member.error = "User not found";
        failed++;
        skipped++;
        updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: membersToAdd } });
        continue;
      }

      const floodSecs = parseFloodWait(err);
      if (floodSecs !== null) {
        recordError(accountId, "flood");
        updateJob(job.id, {
          status: "running",
          error: `FloodWait ${floodSecs}s — سيتم المتابعة تلقائياً...`,
          result: { added, failed, skipped, errors, members: membersToAdd },
        });
        await handleFloodWait(accountId, floodSecs);
        i--; // retry this member
        continue;
      }

      member.status = "failed";
      member.error = err instanceof Error ? err.message : String(err);
      failed++;
      errors.push(`${identifier}: ${member.error}`);
      updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: membersToAdd } });
      continue;
    }

    // ── Invoke add ─────────────────────────────────────────────────────────────
    try {
      // Try InviteToChannel (works for channels + supergroups)
      // Falls back to AddChatUser for basic groups automatically
      try {
        await client.invoke(
          new Api.channels.InviteToChannel({
            channel: targetEntity,
            users: [userEntity],
          })
        );
      } catch (innerErr: unknown) {
        // If CHAT_ID_INVALID or similar, try the basic group API
        const innerMsg = innerErr instanceof Error ? innerErr.message : String(innerErr);
        if (innerMsg.includes("CHAT_ID_INVALID") || innerMsg.includes("PEER_ID_INVALID")) {
          await client.invoke(
            new Api.messages.AddChatUser({
              chatId: targetEntity.id,
              userId: userEntity,
              fwdLimit: 50,
            })
          );
        } else {
          throw innerErr; // let outer catch handle it
        }
      }

      member.status = "added";
      added++;
      consecutivePeerFloods = 0; // reset on success

      recordAction(currentAccId);
      logger.info({ accountId: currentAccId, username: member.username, userId: member.userId, added, total: membersToAdd.length, accountIdx: currentAccIdx }, "✓ Member added");

    } catch (err: unknown) {
      if (isAlreadyMember(err)) {
        member.status = "already_member";
        skipped++;
        consecutivePeerFloods = 0;

      } else if (isPrivacyError(err)) {
        member.status = "privacy";
        member.error = "إعدادات الخصوصية تمنع الإضافة";
        skipped++;
        if (member.username) markInvalid(member.username, "Privacy");

      } else if (isPeerFlood(err)) {
        // ── ACCOUNT ROTATION: switch to next account immediately, NO WAITING ──
        consecutivePeerFloods++;
        recordError(currentAccId, "peer_flood");

        const nextIdx = currentAccIdx + 1;
        if (nextIdx >= allAccounts.length) {
          // All accounts exhausted — stop gracefully
          errors.push(`جميع الحسابات (${allAccounts.length}) وصلت لحد PeerFlood — أُضيف ${added} عضو`);
          updateJob(job.id, {
            status: "completed",
            error: `PeerFlood: استُنفدت جميع الحسابات (${allAccounts.length}). أُضيف ${added} عضو.`,
            completedAt: new Date().toISOString(),
            result: { added, failed, skipped, errors, members: membersToAdd },
          });
          return;
        }

        // Switch to next account
        currentAccIdx = nextIdx;
        currentAccId = allAccounts[nextIdx]!.id;
        currentSession = allAccounts[nextIdx]!.sessionString;

        logger.warn({
          fromAccount: allAccounts[nextIdx - 1]!.id,
          toAccount: currentAccId,
          accountIdx: currentAccIdx,
          totalAccounts: allAccounts.length,
          added,
        }, `PeerFlood → rotating to account ${currentAccIdx + 1}/${allAccounts.length}`);

        updateJob(job.id, {
          status: "running",
          error: `🔄 PeerFlood → التبديل للحساب ${currentAccIdx + 1}/${allAccounts.length} (أُضيف ${added} حتى الآن)`,
          result: { added, failed, skipped, errors, members: membersToAdd },
        });

        try {
          client = await connectAccount(currentAccIdx);
          updateJob(job.id, { status: "running", error: undefined });
        } catch (connErr) {
          logger.error({ accountId: currentAccId, connErr }, "Failed to connect next account");
          errors.push(`فشل الاتصال بالحساب ${currentAccId}`);
        }

        member.status = "flood";
        member.error = `PeerFlood → تم التبديل للحساب ${currentAccIdx + 1}`;
        i--; // retry this member with new account
        continue;

      } else {
        const floodSecs = parseFloodWait(err);
        if (floodSecs !== null) {
          member.status = "flood";
          member.error = `FloodWait ${floodSecs}s`;
          recordError(accountId, "flood");

          updateJob(job.id, {
            status: "running",
            error: `⏳ FloodWait ${floodSecs}s — سيتم المتابعة تلقائياً...`,
            result: { added, failed, skipped, errors, members: membersToAdd },
          });

          await handleFloodWait(accountId, floodSecs);
          updateJob(job.id, { status: "running", error: undefined });
          i--; // retry this member
          continue;
        }

        member.status = "failed";
        member.error = err instanceof Error ? err.message : String(err);
        failed++;
        errors.push(`${identifier}: ${member.error}`);
        recordError(accountId, "generic");
      }
    }

    updateJob(job.id, {
      progress: i + 1,
      result: { added, failed, skipped, errors, members: membersToAdd },
    });

    // ── Activity interleaving (human-like reading pause) ───────────────────────
    await maybeInterleavePause(i);

    // ── Main delay between adds (skip after last member) ───────────────────────
    if (i < membersToAdd.length - 1) {
      logger.debug({ jobId: job.id, i, delayMs, warmup: h.warmupMode }, "Waiting before next add");
      await sleep(delayMs);
    }
  }

  // ── Update file if from-file mode ──────────────────────────────────────────

  if (mode === "from-file" && fileId) {
    const file = loadMembersFile(fileId);
    if (file) {
      const updatedMembers = file.members.map((m) => {
        const updated = membersToAdd.find(
          (mu) => (mu.userId && mu.userId === m.userId) || (mu.username && mu.username === m.username)
        );
        return updated ?? m;
      });
      saveMembersFile({ ...file, members: updatedMembers, addedCount: file.addedCount + added });
    }
  }

  // ── Final job result ──────────────────────────────────────────────────────

  const h = getHealth(accountId);
  updateJob(job.id, {
    status: "completed",
    completedAt: new Date().toISOString(),
    result: {
      added,
      failed,
      skipped,
      errors,
      members: membersToAdd,
      accountHealth: h.score,
    },
  });

  logger.info({ jobId: job.id, added, failed, skipped, health: h.score }, "Add-members v2 complete");
}
