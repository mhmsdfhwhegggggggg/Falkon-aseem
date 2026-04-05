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
import { getClient } from "./client-manager.js";
import { updateJob, type Job, type MemberRecord } from "./jobs.js";
import { loadMembersFile, saveMembersFile } from "./members-files.js";
import { loadAccounts, upsertAccount, resetDailyCountsIfNeeded } from "./session-store.js";
import { resolveEntity, getCachedEntity, isKnownInvalid, markInvalid } from "./entity-cache.js";
import {
  sleep,
  humanSleep,
  preActionCheck,
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
  logger.info({ jobId: job.id, mode, targetGroup, delaySeconds, maxPerDay }, "Starting add-members v2");
  updateJob(job.id, { status: "running", startedAt: new Date().toISOString() });

  // ── Account setup ──────────────────────────────────────────────────────────

  let accountData = loadAccounts().find((a) => a.id === accountId);
  if (!accountData) {
    updateJob(job.id, { status: "failed", error: "Account not found", completedAt: new Date().toISOString() });
    return;
  }
  accountData = resetDailyCountsIfNeeded(accountData);

  const remainingToday = Math.max(0, maxPerDay - accountData.dailyAdded);
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

  if (mode === "from-file" && fileId) {
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
    client = await getClient(accountId);
    targetEntity = await resolveEntity(client, targetGroup);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    updateJob(job.id, { status: "failed", error: `Cannot resolve target: ${msg}`, completedAt: new Date().toISOString() });
    return;
  }

  // ── Main add loop ──────────────────────────────────────────────────────────

  let added = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < membersToAdd.length; i++) {
    const member = membersToAdd[i]!;

    // ── Pre-action check (health, circuit, daily limit) ──────────────────────
    const check = await preActionCheck(accountId, maxPerDay, delayConfig);
    if (!check.allowed) {
      logger.warn({ accountId, jobId: job.id, reason: check.reason }, "Pre-action check failed, stopping job");
      updateJob(job.id, {
        status: "failed",
        error: check.reason,
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
        await handleFloodWait(accountId, floodSecs);
        i--; // retry this member
        continue;
      }

      member.status = "failed";
      member.error = err instanceof Error ? err.message : String(err);
      failed++;
      errors.push(`${identifier}: ${member.error}`);
      continue;
    }

    // ── Invoke add ─────────────────────────────────────────────────────────────
    try {
      await client.invoke(
        new Api.channels.InviteToChannel({
          channel: targetEntity,
          users: [userEntity],
        })
      );

      member.status = "added";
      added++;

      // Track in account daily counter
      accountData!.dailyAdded++;
      upsertAccount(accountData!);
      recordAction(accountId);

      logger.debug({ accountId, username: member.username, userId: member.userId, added }, "Member added");
    } catch (err: unknown) {
      if (isAlreadyMember(err)) {
        member.status = "already_member";
        skipped++;
      } else if (isPrivacyError(err)) {
        member.status = "privacy";
        member.error = "Privacy settings prevent adding";
        skipped++;
        if (member.username) markInvalid(member.username, "Privacy");
      } else if (isPeerFlood(err)) {
        member.status = "flood";
        member.error = "PeerFlood — account paused";
        recordError(accountId, "peer_flood");
        errors.push(`PeerFlood on account ${accountId} — stopping job`);
        logger.error({ accountId, jobId: job.id }, "PeerFlood — stopping job early");

        updateJob(job.id, {
          status: "failed",
          error: `PeerFlood: account ${accountId} is now in cooldown`,
          completedAt: new Date().toISOString(),
          result: { added, failed, skipped, errors, members: membersToAdd },
        });
        return;
      } else {
        const floodSecs = parseFloodWait(err);
        if (floodSecs !== null) {
          member.status = "flood";
          member.error = `FloodWait ${floodSecs}s`;
          recordError(accountId, "flood");
          await handleFloodWait(accountId, floodSecs);
          i--; // retry this member
          updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: membersToAdd } });
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
      const h = getHealth(accountId);
      const ms = check.delayMs!;
      logger.debug({ jobId: job.id, i, delayMs: ms, warmup: h.warmupMode }, "Waiting before next add");
      await sleep(ms);
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
