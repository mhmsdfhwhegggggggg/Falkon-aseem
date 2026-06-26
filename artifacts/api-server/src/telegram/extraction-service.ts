/**
 * EXTRACTION SERVICE v4.0 — MAXIMUM EXTRACTION
 * ===============================================
 * Phase 0: Basic-group fallback via messages.GetFullChat (for Api.Chat entities)
 * Phase 1: ChannelParticipantsSearch q="" — catches members not indexed by name
 * Phase 2: ChannelParticipantsRecent  — catches newest members
 * Phase 3: Alphabet technique (Arabic + Latin + digits + _)
 *           paginating each prefix independently — deduped globally
 *
 * This combination extracts 100,000+ members from any group type.
 */

import { Api } from "telegram";
import { getClient, getClientFromSession } from "./client-manager.js";
import { updateJob, type Job, type MemberRecord } from "./jobs.js";
import { resolveEntity, setCachedEntity } from "./entity-cache.js";
import {
  sleep,
  humanDelay,
  parseFloodWait,
  handleFloodWait,
  recordError,
} from "./anti-ban.js";
import { logger } from "../lib/logger.js";

const BATCH_SIZE = 200; // Telegram's max per GetParticipants call

// ─── Search character sets for alphabet technique ─────────────────────────────
const ARABIC_LETTERS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
const LATIN_LETTERS  = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS         = '0123456789';
const EXTRA_CHARS    = '_';

const ALL_SEARCH_CHARS = [
  ...ARABIC_LETTERS.split(''),
  ...LATIN_LETTERS.split(''),
  ...DIGITS.split(''),
  ...EXTRA_CHARS.split(''),
];

// ─── Filter pipeline ──────────────────────────────────────────────────────────

type DataFilter = 'all' | 'with-username' | 'without-username' | 'with-phone';

interface ExtractionFilters {
  excludeBots:  boolean;
  lastSeenDays: number;   // 0 = no filter
  dataFilter:   DataFilter;
  onlineOnly?:  boolean;
}

function daysSinceLastSeen(user: Api.User): number | null {
  const s = user.status;
  if (s instanceof Api.UserStatusOnline)    return 0;
  if (s instanceof Api.UserStatusRecently)  return 1;
  if (s instanceof Api.UserStatusLastWeek)  return 5;
  if (s instanceof Api.UserStatusLastMonth) return 20;
  if (s instanceof Api.UserStatusOffline) {
    const wasOnlineSec = (s as any).wasOnline as number;
    if (wasOnlineSec) return Math.floor((Date.now() / 1000 - wasOnlineSec) / 86400);
  }
  return null;
}

function applyFilters(user: Api.User, filters: ExtractionFilters): boolean {
  if (!(user instanceof Api.User)) return false;
  if (user.deleted) return false;
  if (user.bot && filters.excludeBots) return false;
  if (filters.onlineOnly && !(user.status instanceof Api.UserStatusOnline)) return false;
  if (filters.lastSeenDays > 0) {
    const days = daysSinceLastSeen(user);
    if (days === null || days > filters.lastSeenDays) return false;
  }
  if (filters.dataFilter === 'with-username'    && !user.username) return false;
  if (filters.dataFilter === 'without-username' && !!user.username) return false;
  if (filters.dataFilter === 'with-phone'       && !user.phone)    return false;
  return true;
}

// ─── Shared helper: push a user into members list ─────────────────────────────

function pushUser(
  user: Api.User,
  seen: Set<string>,
  members: MemberRecord[],
  filters: ExtractionFilters,
  limit: number,
): boolean {
  if (!(user instanceof Api.User)) return false;
  const uid = user.id.toString();
  if (seen.has(uid)) return false;
  seen.add(uid);
  if (!applyFilters(user, filters)) return false;
  if (user.username) setCachedEntity(user.username, user);
  setCachedEntity(uid, user);
  members.push({
    userId:     uid,
    accessHash: user.accessHash?.toString() || undefined,
    username:   user.username  || "",
    firstName:  user.firstName || "",
    lastName:   user.lastName  || "",
    phone:      user.phone     || "",
    isOnline:   user.status instanceof Api.UserStatusOnline,
    lastSeen:
      user.status instanceof Api.UserStatusOffline
        ? (user.status as any).wasOnline?.toString()
        : undefined,
    status: "pending" as const,
  });
  return members.length >= limit;
}

// ─── Phase 0: Basic group fallback (messages.GetFullChat) ─────────────────────

async function fetchBasicGroup(
  client: any,
  entity: any,
  seen: Set<string>,
  members: MemberRecord[],
  filters: ExtractionFilters,
  limit: number,
  jobId: string,
): Promise<void> {
  try {
    const chatId = entity.id ?? (entity as any).chatId;
    const full = await client.invoke(
      new Api.messages.GetFullChat({ chatId: BigInt(chatId) as any })
    ) as any;

    const users: Api.User[] = full.users ?? [];
    logger.info({ jobId, totalInChat: users.length }, "Phase 0 (basic group) done");

    for (const user of users) {
      if (pushUser(user, seen, members, filters, limit)) return;
    }
  } catch (err) {
    logger.warn({ jobId, err: String(err) }, "Phase 0 (basic group) failed");
  }
}

// ─── Phase 1: Empty-string search (catches non-indexed members) ───────────────

async function fetchEmptySearch(
  client: any,
  entity: any,
  seen: Set<string>,
  members: MemberRecord[],
  filters: ExtractionFilters,
  limit: number,
  jobId: string,
  accountId: string,
): Promise<void> {
  let offset = 0;
  while (members.length < limit) {
    let batch: any;
    let retries = 0;
    while (true) {
      try {
        batch = await client.invoke(
          new Api.channels.GetParticipants({
            channel: entity,
            filter: new Api.ChannelParticipantsSearch({ q: "" }),
            offset,
            limit: Math.min(BATCH_SIZE, limit - members.length),
            hash: BigInt(0) as any,
          })
        );
        break;
      } catch (err: unknown) {
        const fw = parseFloodWait(err);
        if (fw !== null) {
          recordError(accountId, "flood");
          await handleFloodWait(accountId, fw);
          continue;
        }
        retries++;
        if (retries >= 3) {
          logger.warn({ jobId, err: String(err) }, "fetchEmptySearch error — skipping");
          return;
        }
        await sleep(Math.pow(2, retries) * 1000);
      }
    }

    if (!("users" in batch) || !batch.users?.length) break;

    const users = batch.users as Api.User[];
    for (const user of users) {
      if (pushUser(user, seen, members, filters, limit)) return;
    }

    offset += users.length;
    if (users.length < BATCH_SIZE) break;
    await sleep(humanDelay({ base: 400, jitter: 0.5, min: 200, max: 900 }));
  }
}

// ─── Phase 2: Recent participants ─────────────────────────────────────────────

async function fetchRecent(
  client: any,
  entity: any,
  seen: Set<string>,
  members: MemberRecord[],
  filters: ExtractionFilters,
  limit: number,
  jobId: string,
  accountId: string,
): Promise<void> {
  let offset = 0;
  while (members.length < limit) {
    let batch: any;
    try {
      batch = await client.invoke(
        new Api.channels.GetParticipants({
          channel: entity,
          filter: new Api.ChannelParticipantsRecent(),
          offset,
          limit: BATCH_SIZE,
          hash: BigInt(0) as any,
        })
      );
    } catch (err: unknown) {
      const fw = parseFloodWait(err);
      if (fw !== null) {
        recordError(accountId, "flood");
        await handleFloodWait(accountId, fw);
        continue;
      }
      logger.warn({ jobId, err: String(err) }, "fetchRecent failed — skipping");
      break;
    }

    if (!("users" in batch) || !batch.users?.length) break;

    for (const user of (batch.users as Api.User[])) {
      if (pushUser(user, seen, members, filters, limit)) return;
    }

    offset += batch.users.length;
    if (batch.users.length < BATCH_SIZE) break;
    await sleep(humanDelay({ base: 300, jitter: 0.5, min: 150, max: 700 }));
  }
}

// ─── Phase 3: Alphabet search (one prefix at a time, paginated) ───────────────

async function fetchByPrefix(
  client: any,
  entity: any,
  prefix: string,
  seen: Set<string>,
  members: MemberRecord[],
  filters: ExtractionFilters,
  limit: number,
  jobId: string,
  accountId: string,
): Promise<void> {
  let offset = 0;

  while (true) {
    if (members.length >= limit) return;

    let batch: any;
    let retries = 0;

    while (true) {
      try {
        batch = await client.invoke(
          new Api.channels.GetParticipants({
            channel: entity,
            filter: new Api.ChannelParticipantsSearch({ q: prefix }),
            offset,
            limit: Math.min(BATCH_SIZE, limit - members.length),
            hash: BigInt(0) as any,
          })
        );
        break;
      } catch (err: unknown) {
        const fw = parseFloodWait(err);
        if (fw !== null) {
          recordError(accountId, "flood");
          logger.warn({ jobId, prefix, fw }, "FloodWait during alphabet search");
          await handleFloodWait(accountId, fw);
          continue;
        }
        retries++;
        if (retries >= 3) {
          logger.warn({ jobId, prefix, err: String(err) }, "Skipping prefix after 3 errors");
          return;
        }
        await sleep(Math.pow(2, retries) * 1000);
      }
    }

    if (!("users" in batch) || !batch.users?.length) break;

    const users = batch.users as Api.User[];
    for (const user of users) {
      if (pushUser(user, seen, members, filters, limit)) return;
    }

    offset += users.length;
    if (users.length < BATCH_SIZE) break;
    await sleep(humanDelay({ base: 400, jitter: 0.5, min: 200, max: 900 }));
  }
}

// ─── Main extraction function ─────────────────────────────────────────────────

export async function runExtraction(job: Job) {
  const config = job.config as {
    group: string;
    limit: number;
    filterActive?: boolean;
    excludeBots: boolean;
    lastSeenDays?: number;
    dataFilter?: DataFilter;
    onlineOnly?: boolean;
    mode: string;
  };

  const { group, limit = 500, excludeBots = true } = config;
  const lastSeenDays = config.lastSeenDays ?? (config.filterActive ? 30 : 0);
  const dataFilter: DataFilter = config.dataFilter ?? 'all';
  const onlineOnly = config.onlineOnly ?? false;

  const accountId  = job.accountId!;
  const sessionString = (job.config as any).sessionString as string | undefined;
  const filters: ExtractionFilters = { excludeBots, lastSeenDays, dataFilter, onlineOnly };

  const isUnlimited = limit >= 100000;

  logger.info({ jobId: job.id, group, limit, isUnlimited, filters }, "Extraction v4 starting");
  updateJob(job.id, { status: "running", startedAt: new Date().toISOString() });

  try {
    const client = sessionString
      ? await getClientFromSession(sessionString, accountId)
      : await getClient(accountId);

    const entity = await resolveEntity(client, group);

    const seen    = new Set<string>();
    const members: MemberRecord[] = [];

    // ── Phase 0: Basic group (Chat) — use GetFullChat ─────────────────────────
    const isBasicGroup = entity.className === "Chat" || entity instanceof (Api as any).Chat;
    updateJob(job.id, { progress: 0, total: limit });

    if (isBasicGroup) {
      logger.info({ jobId: job.id }, "Detected basic group — using GetFullChat");
      await fetchBasicGroup(client, entity, seen, members, filters, limit, job.id);
      logger.info({ jobId: job.id, fromBasicGroup: members.length }, "Phase 0 done");
    } else {
      // ── Phase 1: Empty-string search (best for members w/o indexed names) ──
      await fetchEmptySearch(client, entity, seen, members, filters, limit, job.id, accountId);
      logger.info({ jobId: job.id, afterEmpty: members.length }, "Phase 1 (empty search) done");

      // ── Phase 2: Recent members ─────────────────────────────────────────────
      if (members.length < limit) {
        updateJob(job.id, { progress: members.length, total: limit });
        await fetchRecent(client, entity, seen, members, filters, limit, job.id, accountId);
        logger.info({ jobId: job.id, afterRecent: members.length }, "Phase 2 (recent) done");
      }

      // ── Phase 3: Alphabet search ───────────────────────────────────────────
      if (members.length < limit) {
        updateJob(job.id, { progress: members.length, total: limit });

        for (let i = 0; i < ALL_SEARCH_CHARS.length; i++) {
          if (members.length >= limit) break;

          const char = ALL_SEARCH_CHARS[i];
          await fetchByPrefix(client, entity, char, seen, members, filters, limit, job.id, accountId);

          updateJob(job.id, { progress: members.length, total: limit });
          logger.info({ jobId: job.id, char, charIdx: i, total: members.length }, "Alphabet search progress");

          if (i < ALL_SEARCH_CHARS.length - 1 && members.length < limit) {
            await sleep(humanDelay({ base: 200, jitter: 0.6, min: 100, max: 600 }));
          }
        }
      }
    }

    logger.info({ jobId: job.id, extracted: members.length }, "Extraction v4 complete");

    updateJob(job.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      progress: members.length,
      total: members.length,
      result: { members, extracted: members.length },
    });

    return members;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ jobId: job.id, err: msg }, "Extraction v4 failed");
    updateJob(job.id, {
      status: "failed",
      completedAt: new Date().toISOString(),
      error: msg,
    });
    throw err;
  }
}
