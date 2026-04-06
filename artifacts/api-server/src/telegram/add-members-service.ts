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
    delaySeconds = 30,
    maxPerDay = 40,
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
  logger.info({ jobId: job.id, mode, targetGroup, delaySeconds, maxPerDay }, "Starting add-members v2");
  updateJob(job.id, { status: "running", startedAt: new Date().toISOString() });

  // ── Account setup (supports both server-stored and phone-stored sessions) ───

  let dailyAdded = 0;
  let accountData = loadAccounts().find((a) => a.id === accountId);
  if (accountData) {
    accountData = resetDailyCountsIfNeeded(accountData);
    dailyAdded = accountData.dailyAdded;
  }
  // If not found in server store, use 0 daily (phone manages its own tracking)

  const remainingToday = Math.max(0, maxPerDay - dailyAdded);
  if (remainingToday === 0) {
    updateJob(job.id, {
      status: "failed",
      error: `Daily limit reached (${maxPerDay} per day). Resets at midnight.`,
      completedAt: new Date().toISOString(),
    });
    return;
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

  const cap = Math.min(membersToAdd.length, remainingToday);
  membersToAdd = membersToAdd.slice(0, cap);

  if (membersToAdd.length === 0) {
    updateJob(job.id, { status: "completed", completedAt: new Date().toISOString(), result: { added: 0, failed: 0, errors: [] } });
    return;
  }

  updateJob(job.id, { total: membersToAdd.length });

  // ── Warmup mode ────────────────────────────────────────────────────────────

  if (warmup) {
    setWarmupMode(accountId, membersToAdd.length);
    logger.info({ accountId, total: membersToAdd.length }, "Warmup mode enabled");
  }

  // ── Delay config ───────────────────────────────────────────────────────────

  const delayConfig: DelayConfig = {
    base: delaySeconds * 1000,
    jitter: 0.3,
    min: Math.max(8000, delaySeconds * 700),
    max: delaySeconds * 2000,
  };

  // ── Connect & resolve target ───────────────────────────────────────────────

  let client: Awaited<ReturnType<typeof getClient>>;
  let targetEntity: any;

  try {
    client = sessionString
      ? await getClientFromSession(sessionString, accountId)
      : await getClient(accountId);
    targetEntity = await resolveEntity(client, targetGroup);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    updateJob(job.id, { status: "failed", error: `Cannot resolve target: ${msg}`, completedAt: new Date().toISOString() });
    return;
  }

  // ── Main add loop ──────────────────────────────────────────────────────────
  // Professional strategy:
  //   FloodWait  → wait the exact seconds Telegram says, then retry same member
  //   PeerFlood  → wait PEER_FLOOD_BACKOFF_MS, then retry (up to MAX_PEER_FLOOD_RETRIES)
  //   3rd PeerFlood → stop job (account truly restricted today)
  //   Privacy/NotFound → skip (don't waste quota)
  //   AlreadyMember   → skip (silent)
  // ──────────────────────────────────────────────────────────────────────────

  const PEER_FLOOD_WAIT_MS = [
    15 * 60 * 1000, // 1st PeerFlood: wait 15 min then retry
    30 * 60 * 1000, // 2nd PeerFlood: wait 30 min then retry
    60 * 60 * 1000, // 3rd PeerFlood: wait 60 min then retry
  ];
  const MAX_PEER_FLOOD_PER_JOB = 3; // stop after 3 consecutive PeerFloods

  let added = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];
  let consecutivePeerFloods = 0; // resets after each successful add

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

      // Track in account daily counter
      if (accountData) {
        accountData.dailyAdded++;
        upsertAccount(accountData);
      }
      recordAction(accountId);

      logger.info({ accountId, username: member.username, userId: member.userId, added, total: membersToAdd.length }, "✓ Member added");

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
        // ── PROFESSIONAL PeerFlood handling: wait & retry, don't stop ──────────
        consecutivePeerFloods++;
        const waitMs = PEER_FLOOD_WAIT_MS[Math.min(consecutivePeerFloods - 1, PEER_FLOOD_WAIT_MS.length - 1)]!;
        const waitMins = Math.round(waitMs / 60000);

        logger.warn({
          accountId, jobId: job.id,
          attempt: consecutivePeerFloods,
          waitMins,
          added,
        }, `PeerFlood #${consecutivePeerFloods} — waiting ${waitMins} min then continuing`);

        if (consecutivePeerFloods > MAX_PEER_FLOOD_PER_JOB) {
          // Too many PeerFloods — genuinely restricted today
          recordError(accountId, "peer_flood");
          errors.push(`PeerFlood ×${consecutivePeerFloods} — الحساب محدود اليوم، توقف الآن`);
          updateJob(job.id, {
            status: "failed",
            error: `PeerFlood ×${consecutivePeerFloods}: الحساب محظور مؤقتاً من Telegram. أُضيف ${added} عضو.`,
            completedAt: new Date().toISOString(),
            result: { added, failed, skipped, errors, members: membersToAdd },
          });
          return;
        }

        // Mark this member as flood (will retry)
        member.status = "flood";
        member.error = `PeerFlood #${consecutivePeerFloods} — انتظار ${waitMins} دقيقة`;

        // Update job: show waiting status (not failed!)
        updateJob(job.id, {
          status: "running",
          error: `⏳ PeerFlood #${consecutivePeerFloods} — انتظار ${waitMins} دقيقة ثم تكمل تلقائياً (أُضيف ${added} حتى الآن)`,
          result: { added, failed, skipped, errors, members: membersToAdd },
        });

        await sleep(waitMs);

        // Reset the error message and retry the same member
        updateJob(job.id, { status: "running", error: undefined });
        i--; // retry current member
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
