/**
 * CHATTERS SERVICE
 * ================
 * Extracts ACTIVE message-senders from a Telegram group/channel.
 * Unlike member extraction, this finds people who actually TALK in the group —
 * far more valuable for targeting (they are genuinely engaged users).
 *
 * Strategy:
 *  - GetHistory in batches, collect unique senders
 *  - Optionally filter to last N days of messages
 *  - Return MemberRecord[] compatible with add-members pipeline
 */

import { Api } from "telegram";
import { getClientFromSession } from "./client-manager.js";
import { updateJob, type Job, type MemberRecord } from "./jobs.js";
import { resolveEntity } from "./entity-cache.js";
import { sleep, parseFloodWait, handleFloodWait, recordError } from "./anti-ban.js";
import { logger } from "../lib/logger.js";

const HISTORY_BATCH = 100; // messages per GetHistory call

export async function runChatterExtraction(job: Job) {
  const config = job.config as {
    group: string;
    limit: number;
    lastDays?: number;       // only messages within last N days
    excludeBots?: boolean;
    sessionString: string;
  };

  const { group, limit = 500, lastDays = 30, excludeBots = true, sessionString } = config;
  const accountId = job.accountId!;
  const cutoffTs = lastDays > 0 ? Math.floor(Date.now() / 1000) - lastDays * 86400 : 0;

  logger.info({ jobId: job.id, group, limit, lastDays }, "Chatter extraction starting");
  updateJob(job.id, { status: "running", startedAt: new Date().toISOString(), progress: 0, total: limit });

  try {
    const client = await getClientFromSession(sessionString, accountId);
    const entity = await resolveEntity(client, group);

    const seen = new Set<string>();
    const members: MemberRecord[] = [];
    let offsetId = 0;
    let retries = 0;

    while (members.length < limit) {
      let history: any;
      try {
        history = await client.invoke(
          new Api.messages.GetHistory({
            peer: entity,
            limit: HISTORY_BATCH,
            offsetId,
            offsetDate: 0,
            addOffset: 0,
            maxId: 0,
            minId: 0,
            hash: 0 as any,
          })
        );
        retries = 0;
      } catch (err: unknown) {
        const flood = parseFloodWait(err);
        if (flood !== null) {
          recordError(accountId, "flood");
          await handleFloodWait(accountId, flood);
          continue;
        }
        retries++;
        if (retries >= 3) throw err;
        await sleep(Math.pow(2, retries) * 1000);
        continue;
      }

      const messages: Api.Message[] = (history as any).messages ?? [];
      const users: Api.User[] = (history as any).users ?? [];
      if (messages.length === 0) break;

      // Build user map from this page
      const userMap = new Map<string, Api.User>();
      for (const u of users) {
        if (u instanceof Api.User) userMap.set(u.id.toString(), u);
      }

      let oldestInBatch = Infinity;

      for (const msg of messages) {
        if (!(msg instanceof Api.Message)) continue;
        if (!msg.fromId) continue;

        const msgTs = msg.date ?? 0;
        if (msgTs < oldestInBatch) oldestInBatch = msgTs;
        if (cutoffTs > 0 && msgTs < cutoffTs) continue; // too old

        const senderId = (msg.fromId as any).userId?.toString();
        if (!senderId || seen.has(senderId)) continue;
        seen.add(senderId);

        const user = userMap.get(senderId);
        if (!user) continue;
        if (user.deleted) continue;
        if (user.bot && excludeBots) continue;

        members.push({
          userId: senderId,
          accessHash: user.accessHash?.toString() || undefined,
          username:   user.username    || "",
          firstName:  user.firstName   || "",
          lastName:   user.lastName    || "",
          phone:      user.phone       || "",
          isOnline:   user.status instanceof Api.UserStatusOnline,
          status:     "pending" as const,
        });

        if (members.length >= limit) break;
      }

      // If all messages in this batch are older than cutoff, stop
      if (cutoffTs > 0 && oldestInBatch < cutoffTs) break;

      const lastMsg = messages[messages.length - 1];
      offsetId = (lastMsg as any).id ?? 0;
      if (offsetId === 0 || messages.length < HISTORY_BATCH) break;

      updateJob(job.id, { progress: members.length, total: limit });
      await sleep(400 + Math.random() * 400);
    }

    updateJob(job.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      progress: members.length,
      total: members.length,
      result: { members, extracted: members.length },
    });
    logger.info({ jobId: job.id, found: members.length }, "Chatter extraction complete");
    return members;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ jobId: job.id, err: msg }, "Chatter extraction failed");
    updateJob(job.id, { status: "failed", completedAt: new Date().toISOString(), error: msg });
    throw err;
  }
}
