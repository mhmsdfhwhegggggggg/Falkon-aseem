/**
 * EXTRACTION SERVICE v5.0 — MAXIMUM EXTRACTION + SMART ANTI-BAN
 * ===============================================================
 *
 * فلسفة مضاد الحظر للقراءة:
 *   - العمليات القراءة أقل خطراً من الكتابة — تأخيرات أقل بكثير
 *   - FloodWait قصير (<30s) → ننتظر.  طويل (>30s) → ننتقل للمرحلة التالية
 *   - نجمع من كل المصادر الممكنة لضمان أقصى تغطية
 *
 * المراحل (بالترتيب):
 *   Phase 0 — GetFullChat         : للمجموعات الأساسية (Chat) — يجيب بالكل دفعة واحدة
 *   Phase 1 — Search q=""         : يجيب بأعضاء غير مفهرسين (أسماء مخفية/خاصة)
 *   Phase 2 — ChannelParticipantsRecent : الأعضاء الأحدث
 *   Phase 3 — GetHistory senders  : من نشر رسائل → يصطاد الأعضاء الأكثر نشاطاً
 *   Phase 4 — Alphabet technique  : حرف بحرف — يصل لـ 100,000+ عضو
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

const BATCH_SIZE = 200;          // Max per GetParticipants
const HISTORY_BATCH = 100;       // Messages per GetHistory call
const MAX_HISTORY_PAGES = 50;    // Max pages of history to scan (5,000 messages)
const FLOOD_ROTATE_THRESHOLD = 30; // If FloodWait > 30s on a read op → skip prefix, continue

// ─── Search character sets ────────────────────────────────────────────────────

const ALL_SEARCH_CHARS = [
  ...'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'.split(''),
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  ...'0123456789'.split(''),
  '_',
];

// ─── Filter types ─────────────────────────────────────────────────────────────

type DataFilter = 'all' | 'with-username' | 'without-username' | 'with-phone';

interface ExtractionFilters {
  excludeBots:  boolean;
  lastSeenDays: number;
  dataFilter:   DataFilter;
  onlineOnly?:  boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysSinceLastSeen(user: Api.User): number | null {
  const s = user.status;
  if (s instanceof Api.UserStatusOnline)    return 0;
  if (s instanceof Api.UserStatusRecently)  return 1;
  if (s instanceof Api.UserStatusLastWeek)  return 5;
  if (s instanceof Api.UserStatusLastMonth) return 20;
  if (s instanceof Api.UserStatusOffline) {
    const was = (s as any).wasOnline as number;
    if (was) return Math.floor((Date.now() / 1000 - was) / 86400);
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

/**
 * Add a user to members list.
 * Returns true if the limit has been reached.
 */
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
  // Never store "0" as accessHash — it's invalid and causes InviteToChannel failures
  const rawHash = user.accessHash?.toString();
  members.push({
    userId:     uid,
    accessHash: (rawHash && rawHash !== "0") ? rawHash : undefined,
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

// ─── Phase 0: Basic group (Chat) via GetFullChat ──────────────────────────────

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
    logger.info({ jobId, totalInChat: users.length }, "Phase 0 (basic group GetFullChat)");
    for (const user of users) {
      if (pushUser(user, seen, members, filters, limit)) return;
    }
  } catch (err) {
    logger.warn({ jobId, err: String(err) }, "Phase 0 failed — not a basic group");
  }
}

// ─── Phase 1: Empty-string search ─────────────────────────────────────────────

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
        batch = await client.invoke(new Api.channels.GetParticipants({
          channel: entity,
          filter: new Api.ChannelParticipantsSearch({ q: "" }),
          offset,
          limit: Math.min(BATCH_SIZE, limit - members.length),
          hash: BigInt(0) as any,
        }));
        break;
      } catch (err: unknown) {
        const fw = parseFloodWait(err);
        if (fw !== null) {
          recordError(accountId, "flood");
          if (fw > FLOOD_ROTATE_THRESHOLD) {
            logger.warn({ jobId, fw }, "Phase 1 FloodWait too long — skipping to next phase");
            return; // Don't block — continue to next phase
          }
          await handleFloodWait(accountId, fw);
          continue;
        }
        if (++retries >= 3) return;
        await sleep(Math.pow(2, retries) * 500);
      }
    }
    if (!("users" in batch) || !batch.users?.length) break;
    const users = batch.users as Api.User[];
    for (const u of users) {
      if (pushUser(u, seen, members, filters, limit)) return;
    }
    offset += users.length;
    if (users.length < BATCH_SIZE) break;
    await sleep(humanDelay({ base: 300, jitter: 0.4, min: 150, max: 600 }));
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
      batch = await client.invoke(new Api.channels.GetParticipants({
        channel: entity,
        filter: new Api.ChannelParticipantsRecent(),
        offset, limit: BATCH_SIZE,
        hash: BigInt(0) as any,
      }));
    } catch (err: unknown) {
      const fw = parseFloodWait(err);
      if (fw !== null) {
        recordError(accountId, "flood");
        if (fw > FLOOD_ROTATE_THRESHOLD) return; // skip, don't block
        await handleFloodWait(accountId, fw);
        continue;
      }
      logger.warn({ jobId, err: String(err) }, "Phase 2 failed");
      break;
    }
    if (!("users" in batch) || !batch.users?.length) break;
    for (const u of (batch.users as Api.User[])) {
      if (pushUser(u, seen, members, filters, limit)) return;
    }
    offset += batch.users.length;
    if (batch.users.length < BATCH_SIZE) break;
    await sleep(humanDelay({ base: 200, jitter: 0.4, min: 100, max: 500 }));
  }
}

// ─── Phase 3: Message history — extract active senders ────────────────────────
// يصطاد كل من كتب رسالة بغض النظر عن إعدادات الخصوصية

async function fetchHistorySenders(
  client: any,
  entity: any,
  seen: Set<string>,
  members: MemberRecord[],
  filters: ExtractionFilters,
  limit: number,
  jobId: string,
  accountId: string,
): Promise<void> {
  let offsetId = 0;
  let pages = 0;

  while (members.length < limit && pages < MAX_HISTORY_PAGES) {
    let res: any;
    try {
      res = await client.invoke(new Api.messages.GetHistory({
        peer: entity,
        offsetId,
        offsetDate: 0,
        addOffset: 0,
        limit: HISTORY_BATCH,
        maxId: 0,
        minId: 0,
        hash: BigInt(0) as any,
      }));
    } catch (err: unknown) {
      const fw = parseFloodWait(err);
      if (fw !== null) {
        recordError(accountId, "flood");
        if (fw > FLOOD_ROTATE_THRESHOLD) {
          logger.warn({ jobId, fw }, "Phase 3 FloodWait too long — stopping history scan");
          return;
        }
        await handleFloodWait(accountId, fw);
        continue;
      }
      logger.warn({ jobId, err: String(err) }, "Phase 3 (history) failed");
      return;
    }

    const msgs: any[] = res.messages ?? [];
    const users: Api.User[] = res.users ?? [];

    // Index users from this batch
    for (const u of users) {
      if (u instanceof Api.User) {
        pushUser(u, seen, members, filters, limit);
        if (members.length >= limit) return;
      }
    }

    if (msgs.length === 0) break;

    // Use the last message ID as next offset
    offsetId = msgs[msgs.length - 1].id;
    pages++;

    if (msgs.length < HISTORY_BATCH) break;
    await sleep(humanDelay({ base: 250, jitter: 0.4, min: 120, max: 500 }));
  }

  logger.info({ jobId, pages, fromHistory: members.length }, "Phase 3 (history senders) done");
}

// ─── Phase 4: Alphabet search (one prefix at a time, paginated) ───────────────

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
        batch = await client.invoke(new Api.channels.GetParticipants({
          channel: entity,
          filter: new Api.ChannelParticipantsSearch({ q: prefix }),
          offset,
          limit: Math.min(BATCH_SIZE, limit - members.length),
          hash: BigInt(0) as any,
        }));
        break;
      } catch (err: unknown) {
        const fw = parseFloodWait(err);
        if (fw !== null) {
          recordError(accountId, "flood");
          if (fw > FLOOD_ROTATE_THRESHOLD) {
            logger.warn({ jobId, prefix, fw }, "Alphabet FloodWait too long — skipping prefix");
            return; // skip this prefix, try next
          }
          logger.warn({ jobId, prefix, fw }, "FloodWait — waiting");
          await handleFloodWait(accountId, fw);
          continue;
        }
        if (++retries >= 3) {
          logger.warn({ jobId, prefix }, "Skipping prefix after 3 errors");
          return;
        }
        await sleep(Math.pow(2, retries) * 500);
      }
    }
    if (!("users" in batch) || !batch.users?.length) break;
    const users = batch.users as Api.User[];
    for (const u of users) {
      if (pushUser(u, seen, members, filters, limit)) return;
    }
    offset += users.length;
    if (users.length < BATCH_SIZE) break;
    await sleep(humanDelay({ base: 300, jitter: 0.4, min: 150, max: 700 }));
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
  const accountId = job.accountId!;
  const sessionString = (job.config as any).sessionString as string | undefined;
  const filters: ExtractionFilters = { excludeBots, lastSeenDays, dataFilter, onlineOnly };
  const isUnlimited = limit >= 100000;

  logger.info({ jobId: job.id, group, limit, isUnlimited, filters }, "Extraction v5 starting");
  updateJob(job.id, { status: "running", startedAt: new Date().toISOString() });

  try {
    const client = sessionString
      ? await getClientFromSession(sessionString, accountId)
      : await getClient(accountId);

    const entity = await resolveEntity(client, group);
    const seen    = new Set<string>();
    const members: MemberRecord[] = [];

    const tick = () => updateJob(job.id, { progress: members.length, total: Math.max(limit, members.length) });

    // ── Phase 0: Basic group (Chat) ──────────────────────────────────────────
    const isBasicGroup = !!(entity as any).megagroup === false &&
      (entity.className === "Chat" || (entity as any).chatId !== undefined);

    if (isBasicGroup) {
      logger.info({ jobId: job.id }, "Basic group detected → GetFullChat");
      await fetchBasicGroup(client, entity, seen, members, filters, limit, job.id);
      tick();
      logger.info({ jobId: job.id, total: members.length }, "Phase 0 done");
      // Basic groups return all members at once — no further phases needed
      if (members.length > 0) {
        logger.info({ jobId: job.id, extracted: members.length }, "Extraction v5 complete (basic group)");
        updateJob(job.id, { status: "completed", completedAt: new Date().toISOString(), progress: members.length, total: members.length, result: { members, extracted: members.length } });
        return members;
      }
    }

    // ── Phase 1: Empty-string search ─────────────────────────────────────────
    await fetchEmptySearch(client, entity, seen, members, filters, limit, job.id, accountId);
    tick();
    logger.info({ jobId: job.id, afterEmpty: members.length }, "Phase 1 (q='') done");

    // ── Phase 2: Recent participants ─────────────────────────────────────────
    if (members.length < limit) {
      await fetchRecent(client, entity, seen, members, filters, limit, job.id, accountId);
      tick();
      logger.info({ jobId: job.id, afterRecent: members.length }, "Phase 2 (recent) done");
    }

    // ── Phase 3: Message history senders (active users regardless of privacy) ─
    if (members.length < limit) {
      await fetchHistorySenders(client, entity, seen, members, filters, limit, job.id, accountId);
      tick();
      logger.info({ jobId: job.id, afterHistory: members.length }, "Phase 3 (history) done");
    }

    // ── Phase 4: Alphabet technique ──────────────────────────────────────────
    if (members.length < limit) {
      for (let i = 0; i < ALL_SEARCH_CHARS.length; i++) {
        if (members.length >= limit) break;
        const char = ALL_SEARCH_CHARS[i]!;
        await fetchByPrefix(client, entity, char, seen, members, filters, limit, job.id, accountId);
        tick();
        logger.info({ jobId: job.id, char, charIdx: i, total: members.length }, "Alphabet progress");
        // Small delay between chars — read op is low-risk, keep it snappy
        if (i < ALL_SEARCH_CHARS.length - 1 && members.length < limit) {
          await sleep(humanDelay({ base: 150, jitter: 0.5, min: 80, max: 400 }));
        }
      }
    }

    logger.info({ jobId: job.id, extracted: members.length }, "Extraction v5 complete");
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
    logger.error({ jobId: job.id, err: msg }, "Extraction v5 failed");
    updateJob(job.id, { status: "failed", completedAt: new Date().toISOString(), error: msg });
    throw err;
  }
}
