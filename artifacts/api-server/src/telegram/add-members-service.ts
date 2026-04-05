import { Api } from "telegram";
import { getClient } from "./client-manager.js";
import { updateJob, type Job, type MemberRecord } from "./jobs.js";
import { loadMembersFile, saveMembersFile } from "./members-files.js";
import { loadAccounts, upsertAccount, resetDailyCountsIfNeeded } from "./session-store.js";
import { logger } from "../lib/logger.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function resolveTarget(client: InstanceType<typeof import("telegram").TelegramClient>, target: string) {
  let t = target.trim();
  if (t.startsWith("https://t.me/")) t = t.replace("https://t.me/", "@");
  if (t.startsWith("t.me/")) t = t.replace("t.me/", "@");
  if (!t.startsWith("@") && !t.match(/^\d+$/)) t = "@" + t;
  return await client.getEntity(t);
}

export async function runAddMembers(job: Job) {
  const {
    targetGroup,
    mode,
    fileId,
    usernames,
    userIds,
    delaySeconds = 30,
    maxPerDay = 40,
  } = job.config as {
    targetGroup: string;
    mode: "from-file" | "by-username" | "by-id";
    fileId?: string;
    usernames?: string[];
    userIds?: string[];
    delaySeconds: number;
    maxPerDay: number;
  };

  const accountId = job.accountId!;
  logger.info({ jobId: job.id, mode, targetGroup }, "Starting add-members");

  updateJob(job.id, { status: "running", startedAt: new Date().toISOString() });

  let accountData = loadAccounts().find((a) => a.id === accountId);
  if (!accountData) throw new Error("Account not found");
  accountData = resetDailyCountsIfNeeded(accountData);

  const remainingToday = Math.max(0, maxPerDay - accountData.dailyAdded);
  if (remainingToday === 0) {
    updateJob(job.id, {
      status: "failed",
      error: `Daily limit reached (${maxPerDay} per day)`,
      completedAt: new Date().toISOString(),
    });
    return;
  }

  let membersToAdd: MemberRecord[] = [];

  if (mode === "from-file" && fileId) {
    const file = loadMembersFile(fileId);
    if (!file) throw new Error(`Members file ${fileId} not found`);
    membersToAdd = file.members.filter((m) => m.status === "pending");
  } else if (mode === "by-username" && usernames) {
    membersToAdd = usernames.map((u) => ({
      userId: "",
      username: u.replace(/^@/, ""),
      firstName: "",
      lastName: "",
      isOnline: false,
      status: "pending" as const,
    }));
  } else if (mode === "by-id" && userIds) {
    membersToAdd = userIds.map((id) => ({
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

  updateJob(job.id, { total: membersToAdd.length });

  try {
    const client = await getClient(accountId);
    const targetEntity = await resolveTarget(client, targetGroup);

    let added = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < membersToAdd.length; i++) {
      const member = membersToAdd[i]!;
      try {
        let userEntity;
        if (member.username) {
          userEntity = await client.getEntity(`@${member.username}`);
        } else if (member.userId) {
          userEntity = await client.getEntity(BigInt(member.userId));
        } else {
          member.status = "failed";
          member.error = "No username or ID";
          failed++;
          continue;
        }

        await client.invoke(
          new Api.channels.InviteToChannel({
            channel: targetEntity,
            users: [userEntity],
          })
        );

        member.status = "added";
        added++;
        accountData!.dailyAdded++;
        upsertAccount(accountData!);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("FLOOD_WAIT")) {
          const wait = parseInt(msg.match(/FLOOD_WAIT_(\d+)/)?.[1] || "60");
          member.status = "flood";
          member.error = `Flood wait ${wait}s`;
          errors.push(`Flood wait: ${wait}s`);
          logger.warn({ wait }, "Flood wait hit, pausing");
          await sleep(wait * 1000);
        } else if (msg.includes("USER_ALREADY_PARTICIPANT")) {
          member.status = "already_member";
        } else if (msg.includes("PRIVACY")) {
          member.status = "privacy";
          member.error = "Privacy settings prevent adding";
        } else {
          member.status = "failed";
          member.error = msg;
          failed++;
          errors.push(`${member.username || member.userId}: ${msg}`);
        }
      }

      updateJob(job.id, {
        progress: i + 1,
        result: { added, failed, errors, members: membersToAdd },
      });

      if (i < membersToAdd.length - 1) {
        await sleep(delaySeconds * 1000);
      }
    }

    if (mode === "from-file" && fileId) {
      const file = loadMembersFile(fileId);
      if (file) {
        const updatedMembers = file.members.map((m) => {
          const updated = membersToAdd.find((mu) => mu.userId === m.userId || mu.username === m.username);
          return updated || m;
        });
        saveMembersFile({ ...file, members: updatedMembers, addedCount: file.addedCount + added });
      }
    }

    updateJob(job.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      result: { added, failed, errors, members: membersToAdd },
    });

    logger.info({ jobId: job.id, added, failed }, "Add-members complete");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ jobId: job.id, err: msg }, "Add-members failed");
    updateJob(job.id, {
      status: "failed",
      completedAt: new Date().toISOString(),
      error: msg,
    });
    throw err;
  }
}
