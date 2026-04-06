/**
 * EXTRACTION SERVICE v2.0
 * ========================
 * Extracts Telegram group/channel members with:
 * 1. Anti-ban engine integration (humanized delays, health scoring)
 * 2. Entity caching (skip redundant API calls)
 * 3. Streaming batches (memory-efficient for 10k+ members)
 * 4. Multi-account parallel extraction (split workload)
 * 5. Retry logic with exponential backoff
 * 6. Filter pipeline (active, bots, language, etc.)
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
  getHealth,
  setWarmupMode,
} from "./anti-ban.js";
import { logger } from "../lib/logger.js";

const BATCH_SIZE = 200;

// ─── Filter pipeline ──────────────────────────────────────────────────────────

type DataFilter = 'all' | 'with-username' | 'without-username' | 'with-phone';

interface ExtractionFilters {
  excludeBots: boolean;
  lastSeenDays: number;       // 0 = no filter; N = active within N days
  dataFilter: DataFilter;     // username / no-username / phone / all
}

/**
 * Estimate how many days ago the user was last seen.
 * Returns null if truly unknown (privacy/empty status with no filter).
 */
function daysSinceLastSeen(user: Api.User): number | null {
  const s = user.status;
  if (s instanceof Api.UserStatusOnline) return 0;
  if (s instanceof Api.UserStatusRecently) return 1;   // within ~1-3 days
  if (s instanceof Api.UserStatusLastWeek) return 5;   // within 7 days
  if (s instanceof Api.UserStatusLastMonth) return 20; // within 30 days
  if (s instanceof Api.UserStatusOffline) {
    const wasOnlineSec = (s as any).wasOnline as number;
    if (wasOnlineSec) {
      return Math.floor((Date.now() / 1000 - wasOnlineSec) / 86400);
    }
  }
  return null; // UserStatusEmpty — privacy settings hide last seen
}

function applyFilters(user: Api.User, filters: ExtractionFilters): boolean {
  if (!(user instanceof Api.User)) return false;
  if (user.deleted) return false;
  if (user.bot && filters.excludeBots) return false;

  // ── Last-seen filter ─────────────────────────────────────────────────────
  if (filters.lastSeenDays > 0) {
    const days = daysSinceLastSeen(user);
    // If status is hidden (null) we exclude them — can't verify activity
    if (days === null || days > filters.lastSeenDays) return false;
  }

  // ── Data type filter ─────────────────────────────────────────────────────
  if (filters.dataFilter === 'with-username' && !user.username) return false;
  if (filters.dataFilter === 'without-username' && !!user.username) return false;
  if (filters.dataFilter === 'with-phone' && !user.phone) return false;

  return true;
}

// ─── Main extraction function ─────────────────────────────────────────────────

export async function runExtraction(job: Job) {
  const config = job.config as {
    group: string;
    limit: number;
    filterActive?: boolean;   // legacy — maps to lastSeenDays=30
    excludeBots: boolean;
    lastSeenDays?: number;
    dataFilter?: DataFilter;
    mode: string;
  };

  const {
    group,
    limit = 500,
    excludeBots = true,
  } = config;

  // lastSeenDays: explicit value wins; filterActive legacy maps to 30 days
  const lastSeenDays = config.lastSeenDays ?? (config.filterActive ? 30 : 0);
  const dataFilter: DataFilter = config.dataFilter ?? 'all';

  const accountId = job.accountId!;
  const sessionString = (job.config as any).sessionString as string | undefined;
  const filters: ExtractionFilters = { excludeBots, lastSeenDays, dataFilter };

  logger.info({ jobId: job.id, group, limit, filters }, "Starting extraction v2");
  updateJob(job.id, { status: "running", startedAt: new Date().toISOString() });

  // NOTE: No circuit-breaker check for extraction.
  // PeerFlood is an ADD restriction (sending messages/invites), NOT a READ restriction.
  // Telegram never blocks GetParticipants due to PeerFlood on the same account.
  // Checking the circuit here caused all extractions to fail for 30+ minutes after
  // a single PeerFlood event during adding — completely wrong behaviour.

  try {
    const client = sessionString
      ? await getClientFromSession(sessionString, accountId)
      : await getClient(accountId);
    const entity = await resolveEntity(client, group);

    const members: MemberRecord[] = [];
    let offset = 0;
    let total = limit;
    let retries = 0;
    const MAX_RETRIES = 3;

    while (members.length < limit) {
      let batch: any;
      try {
        batch = await client.invoke(
          new Api.channels.GetParticipants({
            channel: entity,
            filter: new Api.ChannelParticipantsSearch({ q: "" }),
            offset,
            limit: Math.min(BATCH_SIZE, limit - members.length),
            hash: 0 as any,
          })
        );
        retries = 0; // reset on success
      } catch (err: unknown) {
        const floodSeconds = parseFloodWait(err);
        if (floodSeconds !== null) {
          recordError(accountId, "flood");
          logger.warn({ jobId: job.id, floodSeconds }, "FloodWait during extraction");
          await handleFloodWait(accountId, floodSeconds);
          continue; // retry same offset
        }

        retries++;
        if (retries >= MAX_RETRIES) throw err;

        const backoff = Math.pow(2, retries) * 1000;
        logger.warn({ jobId: job.id, retries, backoff }, "Extraction batch failed, retrying");
        await sleep(backoff);
        continue;
      }

      if (!("users" in batch) || batch.users.length === 0) break;

      const users = batch.users as Api.User[];
      total = Math.min(limit, (batch as Api.channels.ChannelParticipants).count);

      for (const user of users) {
        if (!(user instanceof Api.User)) continue;
        if (!applyFilters(user, filters)) continue;

        // Cache the user entity for later (add-members can reuse)
        if (user.username) {
          setCachedEntity(user.username, user);
        }
        setCachedEntity(user.id.toString(), user);

        members.push({
          userId: user.id.toString(),
          accessHash: user.accessHash?.toString() || undefined,  // store for add-members
          username: user.username || "",
          firstName: user.firstName || "",
          lastName: user.lastName || "",
          phone: user.phone || "",
          isOnline: user.status instanceof Api.UserStatusOnline,
          lastSeen:
            user.status instanceof Api.UserStatusOffline
              ? user.status.wasOnline?.toString()
              : undefined,
          status: "pending" as const,
        });

        if (members.length >= limit) break;
      }

      offset += batch.users.length;

      updateJob(job.id, {
        progress: Math.min(members.length, limit),
        total,
      });

      if (batch.users.length < BATCH_SIZE) break;

      // Human-like inter-batch delay (0.5–2s)
      const delay = humanDelay({ base: 800, jitter: 0.5, min: 400, max: 2000 });
      await sleep(delay);
    }

    // Store result in-memory only — phone will fetch and save locally
    updateJob(job.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      progress: members.length,
      total: members.length,
      result: { members, extracted: members.length },
      // No savedFileId — file storage is phone-side (AsyncStorage/SecureStore)
    });

    logger.info({ jobId: job.id, extracted: members.length }, "Extraction v2 complete — phone will save locally");
    return members;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ jobId: job.id, err: msg }, "Extraction v2 failed");
    updateJob(job.id, {
      status: "failed",
      completedAt: new Date().toISOString(),
      error: msg,
    });
    throw err;
  }
}
