/**
 * EXTRACTION SERVICE v3.0 — UNLIMITED EXTRACTION
 * ================================================
 * Telegram limits GetParticipants(q:"") to ~10,000 results.
 * Professional tools (Dragon, etc.) bypass this via the ALPHABET TECHNIQUE:
 *   - Search by every character (Arabic + Latin + digits) independently
 *   - Paginate each search prefix until exhausted
 *   - Deduplicate by userId across all queries
 *   - Additionally run ChannelParticipantsRecent to catch non-searchable members
 *
 * This allows extracting 100,000+ members with no hard limit.
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
// We search every unique character so every member is discoverable.
// Arabic letters cover Arabic-speaking groups; Latin + digits cover the rest.

const ARABIC_LETTERS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
const LATIN_LETTERS  = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS         = '0123456789';
const EXTRA_CHARS    = '_'; // Telegram usernames can start with underscore

const ALL_SEARCH_CHARS = [
  ...ARABIC_LETTERS.split(''),
  ...LATIN_LETTERS.split(''),
  ...DIGITS.split(''),
  ...EXTRA_CHARS.split(''),
];

// ─── Filter pipeline ──────────────────────────────────────────────────────────

type DataFilter = 'all' | 'with-username' | 'without-username' | 'with-phone';

interface ExtractionFilters {
  excludeBots: boolean;
  lastSeenDays: number;
  dataFilter: DataFilter;
}

function daysSinceLastSeen(user: Api.User): number | null {
  const s = user.status;
  if (s instanceof Api.UserStatusOnline)     return 0;
  if (s instanceof Api.UserStatusRecently)   return 1;
  if (s instanceof Api.UserStatusLastWeek)   return 5;
  if (s instanceof Api.UserStatusLastMonth)  return 20;
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
  if (filters.lastSeenDays > 0) {
    const days = daysSinceLastSeen(user);
    if (days === null || days > filters.lastSeenDays) return false;
  }
  if (filters.dataFilter === 'with-username'    && !user.username) return false;
  if (filters.dataFilter === 'without-username' && !!user.username) return false;
  if (filters.dataFilter === 'with-phone'       && !user.phone)    return false;
  return true;
}

// ─── Single paginated search for one prefix ────────────────────────────────────

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
            hash: 0 as any,
          })
        );
        break; // success
      } catch (err: unknown) {
        const floodSeconds = parseFloodWait(err);
        if (floodSeconds !== null) {
          recordError(accountId, "flood");
          logger.warn({ jobId, prefix, floodSeconds }, "FloodWait during alphabet search");
          await handleFloodWait(accountId, floodSeconds);
          continue; // retry same offset
        }
        retries++;
        if (retries >= 3) {
          logger.warn({ jobId, prefix, err: String(err) }, "Skipping prefix after 3 errors");
          return;
        }
        await sleep(Math.pow(2, retries) * 1000);
      }
    }

    if (!("users" in batch) || !batch.users || batch.users.length === 0) break;

    const users = batch.users as Api.User[];

    for (const user of users) {
      if (!(user instanceof Api.User)) continue;
      const uid = user.id.toString();
      if (seen.has(uid)) continue; // deduplicate
      seen.add(uid);

      if (!applyFilters(user, filters)) continue;

      if (user.username)       setCachedEntity(user.username, user);
      setCachedEntity(uid, user);

      members.push({
        userId:     uid,
        accessHash: user.accessHash?.toString() || undefined,
        username:   user.username    || "",
        firstName:  user.firstName   || "",
        lastName:   user.lastName    || "",
        phone:      user.phone       || "",
        isOnline:   user.status instanceof Api.UserStatusOnline,
        lastSeen:
          user.status instanceof Api.UserStatusOffline
            ? (user.status as any).wasOnline?.toString()
            : undefined,
        status: "pending" as const,
      });

      if (members.length >= limit) return;
    }

    offset += users.length;

    // If Telegram returned fewer than BATCH_SIZE, there are no more pages for this prefix
    if (users.length < BATCH_SIZE) break;

    // Human-like inter-page delay
    await sleep(humanDelay({ base: 400, jitter: 0.5, min: 200, max: 900 }));
  }
}

// ─── Phase 1: Recent participants (catches newest members not in search index) ─

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
          hash: 0 as any,
        })
      );
    } catch (err: unknown) {
      const floodSeconds = parseFloodWait(err);
      if (floodSeconds !== null) {
        recordError(accountId, "flood");
        await handleFloodWait(accountId, floodSeconds);
        continue;
      }
      logger.warn({ jobId, err: String(err) }, "fetchRecent failed — skipping");
      break;
    }

    if (!("users" in batch) || !batch.users || batch.users.length === 0) break;

    for (const user of (batch.users as Api.User[])) {
      if (!(user instanceof Api.User)) continue;
      const uid = user.id.toString();
      if (seen.has(uid)) continue;
      seen.add(uid);
      if (!applyFilters(user, filters)) continue;
      if (user.username) setCachedEntity(user.username, user);
      setCachedEntity(uid, user);
      members.push({
        userId: uid,
        accessHash: user.accessHash?.toString() || undefined,
        username:  user.username  || "",
        firstName: user.firstName || "",
        lastName:  user.lastName  || "",
        phone:     user.phone     || "",
        isOnline:  user.status instanceof Api.UserStatusOnline,
        lastSeen:
          user.status instanceof Api.UserStatusOffline
            ? (user.status as any).wasOnline?.toString()
            : undefined,
        status: "pending" as const,
      });
      if (members.length >= limit) return;
    }

    offset += batch.users.length;
    if (batch.users.length < BATCH_SIZE) break;
    await sleep(humanDelay({ base: 300, jitter: 0.5, min: 150, max: 700 }));
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
    mode: string;
  };

  const { group, limit = 500, excludeBots = true } = config;
  const lastSeenDays = config.lastSeenDays ?? (config.filterActive ? 30 : 0);
  const dataFilter: DataFilter = config.dataFilter ?? 'all';

  const accountId  = job.accountId!;
  const sessionString = (job.config as any).sessionString as string | undefined;
  const filters: ExtractionFilters = { excludeBots, lastSeenDays, dataFilter };

  const isUnlimited = limit >= 100000;

  logger.info({ jobId: job.id, group, limit, isUnlimited, filters }, "Extraction v3 starting");
  updateJob(job.id, { status: "running", startedAt: new Date().toISOString() });

  try {
    const client = sessionString
      ? await getClientFromSession(sessionString, accountId)
      : await getClient(accountId);

    const entity = await resolveEntity(client, group);

    // Global deduplication set
    const seen    = new Set<string>();
    const members: MemberRecord[] = [];

    // ── Phase 1: Recent members (fast, catches newest) ────────────────────────
    updateJob(job.id, { progress: 0, total: limit });
    await fetchRecent(client, entity, seen, members, filters, limit, job.id, accountId);
    logger.info({ jobId: job.id, afterRecent: members.length }, "Phase 1 (recent) done");

    // ── Phase 2: Alphabet search — covers all members ──────────────────────────
    if (members.length < limit) {
      updateJob(job.id, { progress: members.length, total: limit });

      for (let i = 0; i < ALL_SEARCH_CHARS.length; i++) {
        if (members.length >= limit) break;

        const char = ALL_SEARCH_CHARS[i];
        await fetchByPrefix(client, entity, char, seen, members, filters, limit, job.id, accountId);

        // Update progress after each character
        updateJob(job.id, { progress: members.length, total: limit });
        logger.info({ jobId: job.id, char, charIdx: i, total: members.length }, "Alphabet search progress");

        // Small inter-character delay to look human
        if (i < ALL_SEARCH_CHARS.length - 1 && members.length < limit) {
          await sleep(humanDelay({ base: 200, jitter: 0.6, min: 100, max: 600 }));
        }
      }
    }

    logger.info({ jobId: job.id, extracted: members.length }, "Extraction v3 complete");

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
    logger.error({ jobId: job.id, err: msg }, "Extraction v3 failed");
    updateJob(job.id, {
      status: "failed",
      completedAt: new Date().toISOString(),
      error: msg,
    });
    throw err;
  }
}
