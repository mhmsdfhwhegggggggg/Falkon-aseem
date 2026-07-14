/**
 * EXTRACTION SERVICE v5.0 — PARALLEL MAXIMUM EXTRACTION
 * =======================================================
 * Phase 0: Basic-group fallback via messages.GetFullChat
 * Phase 1: ChannelParticipantsSearch q="" — non-indexed members
 * Phase 2: ChannelParticipantsRecent  — newest members
 * Phase 3: Alphabet technique PARALLELIZED across N accounts
 *           Arabic + Latin + digits + _ distributed across accounts
 *           5-10x speedup: 8 accounts = 15 min for 50K members (was 2+ hrs)
 */

import { Api } from "telegram";
import { getClient, getClientFromSession } from "./client-manager.js";
import { updateJob, type Job, type MemberRecord } from "./jobs.js";
import { resolveEntity, setCachedEntity } from "./entity-cache.js";
import {
  sleep, humanDelay, parseFloodWait, handleFloodWait, recordError,
} from "./anti-ban.js";
import { logger } from "../lib/logger.js";

const BATCH_SIZE = 200;

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

type DataFilter = 'all' | 'with-username' | 'without-username' | 'with-phone';

interface ExtractionFilters {
  excludeBots:  boolean;
  lastSeenDays: number;
  dataFilter:   DataFilter;
  onlineOnly?:  boolean;
}

interface SharedState {
  seen:    Set<string>;
  members: MemberRecord[];
  done:    boolean;
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

function pushUser(user: Api.User, shared: SharedState, filters: ExtractionFilters, limit: number): boolean {
  if (!(user instanceof Api.User)) return false;
  const uid = user.id.toString();
  if (shared.seen.has(uid)) return false;
  shared.seen.add(uid);
  if (!applyFilters(user, filters)) return false;
  if (user.username) setCachedEntity(user.username, user);
  setCachedEntity(uid, user);
  shared.members.push({
    userId:     uid,
    accessHash: user.accessHash?.toString() || undefined,
    username:   user.username  || "",
    firstName:  user.firstName || "",
    lastName:   user.lastName  || "",
    phone:      user.phone     || "",
    isOnline:   user.status instanceof Api.UserStatusOnline,
    lastSeen:   user.status instanceof Api.UserStatusOffline
      ? (user.status as any).wasOnline?.toString()
      : undefined,
    status: "pending" as const,
  });
  if (shared.members.length >= limit) shared.done = true;
  return shared.done;
}

async function fetchBasicGroup(client: any, entity: any, shared: SharedState, filters: ExtractionFilters, limit: number, jobId: string): Promise<void> {
  try {
    const chatId = entity.id ?? (entity as any).chatId;
    const full = await client.invoke(new Api.messages.GetFullChat({ chatId: BigInt(chatId) as any })) as any;
    const users: Api.User[] = full.users ?? [];
    logger.info({ jobId, totalInChat: users.length }, "Phase 0 (basic group) done");
    for (const user of users) { if (pushUser(user, shared, filters, limit)) return; }
  } catch (err) {
    logger.warn({ jobId, err: String(err) }, "Phase 0 failed");
  }
}

async function fetchEmptySearch(client: any, entity: any, shared: SharedState, filters: ExtractionFilters, limit: number, jobId: string, accountId: string): Promise<void> {
  let offset = 0;
  while (!shared.done) {
    let batch: any; let retries = 0;
    while (true) {
      try {
        batch = await client.invoke(new Api.channels.GetParticipants({
          channel: entity, filter: new Api.ChannelParticipantsSearch({ q: "" }),
          offset, limit: Math.min(BATCH_SIZE, limit - shared.members.length), hash: BigInt(0) as any,
        })); break;
      } catch (err: unknown) {
        const fw = parseFloodWait(err);
        if (fw !== null) { recordError(accountId, "flood"); await handleFloodWait(accountId, fw); continue; }
        retries++; if (retries >= 3) { logger.warn({ jobId, err: String(err) }, "fetchEmptySearch error"); return; }
        await sleep(Math.pow(2, retries) * 1000);
      }
    }
    if (!("users" in batch) || !batch.users?.length) break;
    for (const user of batch.users as Api.User[]) { if (pushUser(user, shared, filters, limit)) return; }
    offset += batch.users.length;
    if (batch.users.length < BATCH_SIZE) break;
    await sleep(humanDelay({ base: 400, jitter: 0.5, min: 200, max: 900 }));
  }
}

async function fetchRecent(client: any, entity: any, shared: SharedState, filters: ExtractionFilters, limit: number, jobId: string, accountId: string): Promise<void> {
  let offset = 0;
  while (!shared.done) {
    let batch: any;
    try {
      batch = await client.invoke(new Api.channels.GetParticipants({
        channel: entity, filter: new Api.ChannelParticipantsRecent(),
        offset, limit: BATCH_SIZE, hash: BigInt(0) as any,
      }));
    } catch (err: unknown) {
      const fw = parseFloodWait(err);
      if (fw !== null) { recordError(accountId, "flood"); await handleFloodWait(accountId, fw); continue; }
      logger.warn({ jobId, err: String(err) }, "fetchRecent failed"); break;
    }
    if (!("users" in batch) || !batch.users?.length) break;
    for (const user of batch.users as Api.User[]) { if (pushUser(user, shared, filters, limit)) return; }
    offset += batch.users.length;
    if (batch.users.length < BATCH_SIZE) break;
    await sleep(humanDelay({ base: 300, jitter: 0.5, min: 150, max: 700 }));
  }
}

async function fetchByPrefix(client: any, entity: any, prefix: string, shared: SharedState, filters: ExtractionFilters, limit: number, jobId: string, accountId: string): Promise<void> {
  let offset = 0;
  while (true) {
    if (shared.done) return;
    let batch: any; let retries = 0;
    while (true) {
      try {
        batch = await client.invoke(new Api.channels.GetParticipants({
          channel: entity, filter: new Api.ChannelParticipantsSearch({ q: prefix }),
          offset, limit: Math.min(BATCH_SIZE, limit - shared.members.length), hash: BigInt(0) as any,
        })); break;
      } catch (err: unknown) {
        const fw = parseFloodWait(err);
        if (fw !== null) { recordError(accountId, "flood"); logger.warn({ jobId, prefix, fw }, "FloodWait in alphabet"); await handleFloodWait(accountId, fw); continue; }
        retries++; if (retries >= 3) { logger.warn({ jobId, prefix, err: String(err) }, "Skipping prefix"); return; }
        await sleep(Math.pow(2, retries) * 1000);
      }
    }
    if (!("users" in batch) || !batch.users?.length) break;
    for (const user of batch.users as Api.User[]) { if (pushUser(user, shared, filters, limit)) return; }
    offset += batch.users.length;
    if (batch.users.length < BATCH_SIZE) break;
    await sleep(humanDelay({ base: 400, jitter: 0.5, min: 200, max: 900 }));
  }
}

function splitChars(chars: string[], n: number): string[][] {
  const chunks: string[][] = Array.from({ length: n }, () => []);
  chars.forEach((c, i) => chunks[i % n]!.push(c));
  return chunks;
}

async function runParallelAlphabetSearch(
  allAccounts: Array<{ id: string; sessionString?: string }>,
  group: string,
  shared: SharedState,
  filters: ExtractionFilters,
  limit: number,
  jobId: string,
  updateProgress: () => void,
): Promise<void> {
  const n = allAccounts.length;
  const charGroups = splitChars(ALL_SEARCH_CHARS, n);
  logger.info({ jobId, accounts: n, charsPerAccount: charGroups[0]?.length }, "Phase 3 PARALLEL starting");

  await Promise.all(
    allAccounts.map(async (acc, idx) => {
      const myChars = charGroups[idx] ?? [];
      if (myChars.length === 0) return;
      let client: any;
      try {
        client = acc.sessionString
          ? await getClientFromSession(acc.sessionString, acc.id)
          : await getClient(acc.id);
      } catch (err) {
        logger.warn({ accountId: acc.id, err: String(err) }, "Phase 3: connect failed");
        return;
      }
      let entity: any;
      try { entity = await resolveEntity(client, group); }
      catch (err) { logger.warn({ accountId: acc.id, err: String(err) }, "Phase 3: entity resolve failed"); return; }

      logger.info({ accountId: acc.id, charCount: myChars.length }, "Phase 3 worker started");
      for (const char of myChars) {
        if (shared.done) break;
        await fetchByPrefix(client, entity, char, shared, filters, limit, jobId, acc.id);
        updateProgress();
        if (!shared.done) await sleep(humanDelay({ base: 150, jitter: 0.6, min: 80, max: 400 }));
      }
      logger.info({ accountId: acc.id, extracted: shared.members.length }, "Phase 3 worker done");
    })
  );
}

export async function runExtraction(job: Job) {
  const config = job.config as {
    group: string; limit: number; filterActive?: boolean; excludeBots: boolean;
    lastSeenDays?: number; dataFilter?: DataFilter; onlineOnly?: boolean; mode: string;
    allAccounts?: Array<{ id: string; sessionString?: string }>;
  };

  const { group, limit = 500, excludeBots = true } = config;
  const lastSeenDays  = config.lastSeenDays ?? (config.filterActive ? 30 : 0);
  const dataFilter: DataFilter = config.dataFilter ?? 'all';
  const onlineOnly    = config.onlineOnly ?? false;
  const primaryId     = job.accountId!;
  const primarySession = (job.config as any).sessionString as string | undefined;
  const filters: ExtractionFilters = { excludeBots, lastSeenDays, dataFilter, onlineOnly };

  const allAccounts: Array<{ id: string; sessionString?: string }> =
    config.allAccounts?.length
      ? config.allAccounts
      : [{ id: primaryId, sessionString: primarySession }];

  const parallelMode = allAccounts.length > 1;

  logger.info({ jobId: job.id, group, limit, accounts: allAccounts.length, parallelMode }, "Extraction v5 starting");
  updateJob(job.id, { status: "running", startedAt: new Date().toISOString(), total: limit, progress: 0 });

  const shared: SharedState = { seen: new Set(), members: [], done: false };
  const updateProgress = () => updateJob(job.id, { progress: shared.members.length, total: limit });

  try {
    const primaryClient = primarySession
      ? await getClientFromSession(primarySession, primaryId)
      : await getClient(primaryId);

    const entity = await resolveEntity(primaryClient, group);
    const isBasicGroup = entity.className === "Chat" || entity instanceof (Api as any).Chat;

    if (isBasicGroup) {
      logger.info({ jobId: job.id }, "Basic group — Phase 0 only");
      await fetchBasicGroup(primaryClient, entity, shared, filters, limit, job.id);
    } else {
      await fetchEmptySearch(primaryClient, entity, shared, filters, limit, job.id, primaryId);
      updateProgress();
      logger.info({ jobId: job.id, afterPhase1: shared.members.length }, "Phase 1 done");

      if (!shared.done) {
        await fetchRecent(primaryClient, entity, shared, filters, limit, job.id, primaryId);
        updateProgress();
        logger.info({ jobId: job.id, afterPhase2: shared.members.length }, "Phase 2 done");
      }

      if (!shared.done) {
        if (parallelMode) {
          await runParallelAlphabetSearch(allAccounts, group, shared, filters, limit, job.id, updateProgress);
        } else {
          for (const char of ALL_SEARCH_CHARS) {
            if (shared.done) break;
            await fetchByPrefix(primaryClient, entity, char, shared, filters, limit, job.id, primaryId);
            updateProgress();
          }
        }
        logger.info({ jobId: job.id, afterPhase3: shared.members.length }, "Phase 3 done");
      }
    }

    logger.info({ jobId: job.id, extracted: shared.members.length }, "Extraction v5 complete");
    updateJob(job.id, {
      status: "completed", completedAt: new Date().toISOString(),
      progress: shared.members.length, total: shared.members.length,
      result: { members: shared.members, extracted: shared.members.length },
    });
    return shared.members;

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ jobId: job.id, err: msg }, "Extraction v5 failed");
    updateJob(job.id, { status: "failed", completedAt: new Date().toISOString(), error: msg });
    throw err;
  }
}
