import { Api } from "telegram";
import { getClient } from "./client-manager.js";
import { updateJob, type Job, type MemberRecord } from "./jobs.js";
import { createMembersFile } from "./members-files.js";
import { logger } from "../lib/logger.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function resolveEntity(client: InstanceType<typeof import("telegram").TelegramClient>, group: string) {
  let target = group.trim();
  if (target.startsWith("https://t.me/")) target = target.replace("https://t.me/", "@");
  if (target.startsWith("t.me/")) target = target.replace("t.me/", "@");
  if (!target.startsWith("@") && !target.match(/^\d+$/)) target = "@" + target;
  return await client.getEntity(target);
}

export async function runExtraction(job: Job) {
  const { group, limit = 500, filterActive = false, excludeBots = true } = job.config as {
    group: string;
    limit: number;
    filterActive: boolean;
    excludeBots: boolean;
    mode: string;
  };

  const accountId = job.accountId!;
  logger.info({ jobId: job.id, group, limit }, "Starting extraction");

  updateJob(job.id, { status: "running", startedAt: new Date().toISOString() });

  try {
    const client = await getClient(accountId);
    const entity = await resolveEntity(client, group);

    const participants: Api.User[] = [];
    let offset = 0;
    const batchSize = 200;
    let total = limit;

    while (participants.length < limit) {
      const batch = await client.invoke(
        new Api.channels.GetParticipants({
          channel: entity,
          filter: new Api.ChannelParticipantsSearch({ q: "" }),
          offset,
          limit: Math.min(batchSize, limit - participants.length),
          hash: BigInt(0),
        })
      );

      if (!("users" in batch) || batch.users.length === 0) break;

      const users = batch.users as Api.User[];
      total = Math.min(limit, (batch as Api.channels.ChannelParticipants).count);

      for (const user of users) {
        if (!(user instanceof Api.User)) continue;
        if (user.bot && excludeBots) continue;
        if (user.deleted) continue;
        participants.push(user);
        if (participants.length >= limit) break;
      }

      offset += batch.users.length;

      updateJob(job.id, {
        progress: Math.min(participants.length, limit),
        total,
      });

      if (batch.users.length < batchSize) break;
      await sleep(500);
    }

    const members: MemberRecord[] = participants.map((user) => ({
      userId: user.id.toString(),
      username: user.username || "",
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      isOnline: user.status instanceof Api.UserStatusOnline,
      status: "pending" as const,
    }));

    const groupName = group.replace(/^@/, "").replace(/https?:\/\/t\.me\//, "");
    const fileName = `${groupName}_${new Date().toISOString().split("T")[0]}`;
    const savedFile = createMembersFile(fileName, group, members);

    updateJob(job.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      progress: members.length,
      total: members.length,
      result: { members, extracted: members.length },
      savedFileId: savedFile.id,
    });

    logger.info({ jobId: job.id, extracted: members.length, fileId: savedFile.id }, "Extraction complete");
    return savedFile;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ jobId: job.id, err: msg }, "Extraction failed");
    updateJob(job.id, {
      status: "failed",
      completedAt: new Date().toISOString(),
      error: msg,
    });
    throw err;
  }
}
