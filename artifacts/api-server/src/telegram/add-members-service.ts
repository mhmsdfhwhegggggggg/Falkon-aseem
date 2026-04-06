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
  resetCircuit,
  type DelayConfig,
} from "./anti-ban.js";
import { logger } from "../lib/logger.js";

// ─── Session Warming — محاكاة السلوك البشري عند فتح التطبيق ─────────────────
/**
 * Before starting adds, simulate a real user opening Telegram:
 * - Check notifications (GetNotifySettings)
 * - Load contact list (GetContacts)
 * - Browse dialogs (GetDialogs)
 * This "warms up" the session so Telegram sees human-like traffic before adds.
 */
async function warmupSession(client: any, accountId: string): Promise<void> {
  logger.info({ accountId }, "Warming up session before adds...");
  try {
    // 1. Check notify settings (every app open does this)
    await client.invoke(new Api.account.GetNotifySettings({ peer: new Api.InputNotifyAll() }));
    await sleep(700 + Math.floor(Math.random() * 1300));

    // 2. Load contacts (human checks their contact list)
    await client.invoke(new Api.contacts.GetContacts({ hash: BigInt(0) }));
    await sleep(800 + Math.floor(Math.random() * 1200));

    // 3. Browse recent dialogs (core user behavior)
    await client.invoke(new Api.messages.GetDialogs({
      offsetDate: 0,
      offsetId: 0,
      offsetPeer: new Api.InputPeerEmpty(),
      limit: 15,
      hash: BigInt(0),
    }));
    await sleep(1200 + Math.floor(Math.random() * 1800));

    logger.info({ accountId }, "Session warmed up ✓");
  } catch (err) {
    // Non-fatal — warming is best-effort
    logger.warn({ accountId, err: err instanceof Error ? err.message : String(err) }, "Session warmup partial (non-fatal)");
  }
}

// ─── Contact Import — تقليل PeerFlood بربط الحساب مع الهدف أولاً ────────────
/**
 * Technique: Import target user as contact before InviteToChannel.
 * Having a "contact relationship" lowers Telegram's spam score for this add.
 * Works for members extracted with phone numbers.
 */
async function tryImportContact(client: any, member: any, accountId: string): Promise<void> {
  if (!member.phone) return;
  try {
    await client.invoke(new Api.contacts.ImportContacts({
      contacts: [new Api.InputPhoneContact({
        clientId: BigInt(Math.floor(Math.random() * 9_000_000) + 1_000_000),
        phone: member.phone,
        firstName: member.firstName || "User",
        lastName: member.lastName || "",
      })],
    }));
    await sleep(600 + Math.floor(Math.random() * 900));
    logger.debug({ accountId, phone: member.phone }, "Contact imported before add");
  } catch (_) {
    // Non-fatal — some phones don't allow contact import
  }
}

// ─── Pre-Add Entity Warmup — تأسيس علاقة وهمية مع الهدف ────────────────────
/**
 * Technique: Before adding a user, "view" their profile (GetFullUser).
 * This creates a minimal interaction trace — real users look at profiles
 * before adding them. Reduces the "cold invite" signal Telegram flags.
 */
async function preAddEntityWarmup(client: any, userEntity: any, accountId: string): Promise<void> {
  try {
    await client.invoke(new Api.users.GetFullUser({ id: userEntity }));
    await sleep(400 + Math.floor(Math.random() * 600));
  } catch (_) {
    // Non-fatal
  }
}

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
    // ── Warm up session BEFORE first add ────────────────────────────────────
    // Simulate human app-open behavior: browse dialogs, check contacts, etc.
    // This makes the account look active before we start adding members.
    updateJob(job.id, {
      status: "running",
      error: "🔥 تدفئة الجلسة — محاكاة السلوك البشري قبل البدء...",
      result: { added: 0, failed: 0, skipped: 0, errors: [], members: membersToAdd },
    });
    await warmupSession(client, currentAccId);
    updateJob(job.id, { status: "running", error: undefined });
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
  let peerFloodRecoveries = 0;
  const MAX_PEER_FLOOD_RECOVERIES = 5;
  // Adaptive delay: multiplied by 1.5x after each PeerFlood — backs off naturally
  let adaptiveDelayMultiplier = 1.0;

  for (let i = 0; i < membersToAdd.length; i++) {
    const member = membersToAdd[i]!;

    // ── Daily limit / circuit check (use currentAccId after rotation) ───────────
    if (!canAct(currentAccId, maxPerDay)) {
      const h = getHealth(currentAccId);
      const isCircuitOpen = h.circuitOpen && Date.now() < h.circuitOpenUntil;

      if (isCircuitOpen && peerFloodRecoveries < MAX_PEER_FLOOD_RECOVERIES) {
        // Circuit is open at loop start — wait for it to expire, then continue
        peerFloodRecoveries++;
        const waitMs = Math.max(0, h.circuitOpenUntil - Date.now()) + 20_000;
        const waitMins = Math.ceil(waitMs / 60_000);
        logger.warn({ accountId: currentAccId, jobId: job.id, waitMins }, "Circuit open at loop top — waiting for recovery");
        updateJob(job.id, {
          status: "running",
          error: `⏳ PeerFlood — انتظار ${waitMins} دقيقة ثم الاستئناف (أُضيف ${added} · محاولة ${peerFloodRecoveries}/${MAX_PEER_FLOOD_RECOVERIES})`,
          result: { added, failed, skipped, errors, members: membersToAdd },
        });
        await sleep(waitMs);
        for (const acc of allAccounts) resetCircuit(acc.id);
        currentAccIdx = 0;
        currentAccId = allAccounts[0]!.id;
        try { client = await connectAccount(0); } catch (_) {}
        updateJob(job.id, { status: "running", error: undefined });
        i--; // retry same member
        continue;
      }

      const cooldownMins = isCircuitOpen ? Math.ceil((h.circuitOpenUntil - Date.now()) / 60000) : 0;
      const stopReason = isCircuitOpen
        ? `⚠️ PeerFlood: الحساب محظور مؤقتاً (${cooldownMins} دقيقة متبقية). أضف حسابات إضافية أو انتظر.`
        : `⚠️ تم الوصول للحد اليومي (${maxPerDay} إضافة/يوم) — يُعاد تعيينه خلال 24 ساعة`;
      logger.warn({ accountId: currentAccId, jobId: job.id, isCircuitOpen, cooldownMins, maxPerDay }, "Stopping job: limit exhausted");
      updateJob(job.id, {
        status: "completed",
        error: stopReason,
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
    const h = getHealth(currentAccId);
    const qm = quietHourMultiplier ? quietHourMultiplier() : 1.0;
    const wm = h.warmupMode ? 1.8 : 1.0;
    // adaptiveDelayMultiplier grows after each PeerFlood recovery (1.0 → 1.5 → 2.25...)
    const delayMs = Math.round(humanDelay(delayConfig) * qm * wm * adaptiveDelayMultiplier);

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

    // ── Pre-add techniques: establish relationship before inviting ─────────────
    // 1. Import as contact if phone available (lowers PeerFlood probability)
    await tryImportContact(client, member, currentAccId);
    // 2. View profile first (looks human, not a bot mass-inviter)
    await preAddEntityWarmup(client, userEntity, currentAccId);

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
          // All accounts exhausted — check if we can recover by waiting
          if (peerFloodRecoveries >= MAX_PEER_FLOOD_RECOVERIES) {
            // Exhausted all recovery attempts — stop gracefully
            const msg = `⚠️ PeerFlood متكرر بعد ${MAX_PEER_FLOOD_RECOVERIES} محاولات انتظار. أُضيف ${added} عضو. أضف حسابات إضافية للتدوير.`;
            errors.push(msg);
            updateJob(job.id, {
              status: "completed",
              error: msg,
              completedAt: new Date().toISOString(),
              result: { added, failed, skipped, errors, members: membersToAdd },
            });
            return;
          }

          // ── PEER FLOOD RECOVERY: Wait for circuit cooldown, then retry ──────
          peerFloodRecoveries++;
          const hNow = getHealth(currentAccId);
          const baseWait = Math.max(0, hNow.circuitOpenUntil - Date.now());
          const waitMs = baseWait + 20_000; // +20s buffer after circuit resets
          const waitMins = Math.ceil(waitMs / 60_000);

          logger.warn({
            accountId: currentAccId,
            jobId: job.id,
            waitMins,
            recovery: `${peerFloodRecoveries}/${MAX_PEER_FLOOD_RECOVERIES}`,
            addedSoFar: added,
          }, "PeerFlood recovery: waiting for cooldown then resuming");

          updateJob(job.id, {
            status: "running",
            error: `⏳ PeerFlood — انتظار ${waitMins} دقيقة ثم الاستئناف تلقائياً (أُضيف ${added} حتى الآن · محاولة ${peerFloodRecoveries}/${MAX_PEER_FLOOD_RECOVERIES})`,
            result: { added, failed, skipped, errors, members: membersToAdd },
          });

          await sleep(waitMs);

          // Reset all account circuits after cooldown
          for (const acc of allAccounts) resetCircuit(acc.id);
          consecutivePeerFloods = 0;
          // Adaptive backoff: each recovery increases base delay (1.0 → 1.5 → 2.25...)
          adaptiveDelayMultiplier = Math.min(4.0, adaptiveDelayMultiplier * 1.5);
          logger.info({ adaptiveDelayMultiplier }, "Adaptive delay multiplier increased after PeerFlood");

          // Reconnect with first account
          currentAccIdx = 0;
          currentAccId = allAccounts[0]!.id;
          try {
            client = await connectAccount(0);
            logger.info({ accountId: currentAccId, added }, "PeerFlood recovery: reconnected, resuming adds");
            // Re-warm session after long wait — account needs to look active again
            await warmupSession(client, currentAccId);
          } catch (connErr) {
            logger.error({ accountId: currentAccId, connErr }, "Failed to reconnect after PeerFlood cooldown");
            errors.push(`فشل إعادة الاتصال بعد الانتظار`);
          }

          updateJob(job.id, { status: "running", error: undefined });
          member.status = "flood";
          member.error = `PeerFlood (استُؤنف بعد ${waitMins} دقيقة)`;
          i--; // retry this member with refreshed account
          continue;
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
          // Warm new account session before resuming adds
          await warmupSession(client, currentAccId);
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
