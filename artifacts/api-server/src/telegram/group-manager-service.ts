/**
 * GROUP MANAGER SERVICE
 * =====================
 * Multi-purpose group management:
 *  1. joinGroups   — join a list of groups/channels
 *  2. leaveGroups  — leave all or specified groups
 *  3. sendToJoined — send a message to all joined groups
 *  4. listJoined   — list all dialogs the account is in
 *  5. extractAdmins — extract admins from a group
 *  6. updateProfile — change name/bio/username for the account
 */

import { Api } from "telegram";
import { getClientFromSession } from "./client-manager.js";
import { updateJob, type Job, type MemberRecord } from "./jobs.js";
import { sleep, parseFloodWait, handleFloodWait, recordError, humanDelay } from "./anti-ban.js";
import { resolveEntity } from "./entity-cache.js";
import { logger } from "../lib/logger.js";

// ─── 1. Join groups ────────────────────────────────────────────────────────────

export async function runJoinGroups(job: Job) {
  const config = job.config as {
    groups: string[];          // list of @username, t.me/link, or invite links
    delaySeconds?: number;
    sessionString: string;
  };
  const { groups, delaySeconds = 3, sessionString } = config;
  const accountId = job.accountId!;

  logger.info({ jobId: job.id, total: groups.length }, "Join groups starting");
  updateJob(job.id, { status: "running", startedAt: new Date().toISOString(), progress: 0, total: groups.length });

  try {
    const client = await getClientFromSession(sessionString, accountId);
    let joined = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i].trim();
      if (!g) continue;
      try {
        if (g.includes("joinchat/") || g.includes("+")) {
          // Private invite link
          const hash = g.split(/joinchat\/|\+/).pop()!;
          await client.invoke(new Api.messages.ImportChatInvite({ hash }));
        } else {
          const entity = await resolveEntity(client, g);
          await client.invoke(new Api.channels.JoinChannel({ channel: entity as any }));
        }
        joined++;
      } catch (err: unknown) {
        const flood = parseFloodWait(err);
        if (flood !== null) {
          recordError(accountId, "flood");
          await handleFloodWait(accountId, flood);
          i--; continue; // retry
        }
        failed++;
        errors.push(`${g}: ${err instanceof Error ? err.message : String(err)}`);
      }
      updateJob(job.id, { progress: i + 1, total: groups.length });
      if (i < groups.length - 1) await sleep(delaySeconds * 1000 + Math.random() * 1000);
    }

    updateJob(job.id, {
      status: "completed", completedAt: new Date().toISOString(),
      result: { added: joined, failed, errors },
    });
    return { joined, failed };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    updateJob(job.id, { status: "failed", completedAt: new Date().toISOString(), error: msg });
    throw err;
  }
}

// ─── 2. Leave groups ──────────────────────────────────────────────────────────

export async function runLeaveGroups(job: Job) {
  const config = job.config as {
    groups?: string[];         // if empty → leave ALL
    sessionString: string;
  };
  const { groups, sessionString } = config;
  const accountId = job.accountId!;

  logger.info({ jobId: job.id }, "Leave groups starting");
  updateJob(job.id, { status: "running", startedAt: new Date().toISOString() });

  try {
    const client = await getClientFromSession(sessionString, accountId);
    let targets: any[] = [];

    if (!groups || groups.length === 0) {
      // Leave all groups & channels
      const dialogs = await client.getDialogs({ limit: 500 });
      targets = dialogs
        .filter((d: any) => d.isGroup || d.isChannel)
        .map((d: any) => d.entity);
    } else {
      for (const g of groups) {
        try { targets.push(await resolveEntity(client, g)); } catch { /* skip */ }
      }
    }

    updateJob(job.id, { total: targets.length });
    let left = 0;

    for (let i = 0; i < targets.length; i++) {
      try {
        await client.invoke(new Api.channels.LeaveChannel({ channel: targets[i] }));
        left++;
      } catch { /* some groups can't be left (you're creator, etc) */ }
      updateJob(job.id, { progress: i + 1 });
      await sleep(humanDelay({ base: 1000, jitter: 0.5, min: 500, max: 2000 }));
    }

    updateJob(job.id, {
      status: "completed", completedAt: new Date().toISOString(),
      result: { added: left, failed: targets.length - left },
    });
    return { left };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    updateJob(job.id, { status: "failed", completedAt: new Date().toISOString(), error: msg });
    throw err;
  }
}

// ─── 3. Send message to all joined groups ─────────────────────────────────────

export async function runSendToJoined(job: Job) {
  const config = job.config as {
    message: string;
    delaySeconds?: number;
    sessionString: string;
  };
  const { message, delaySeconds = 5, sessionString } = config;
  const accountId = job.accountId!;

  logger.info({ jobId: job.id }, "Send-to-joined starting");
  updateJob(job.id, { status: "running", startedAt: new Date().toISOString() });

  try {
    const client = await getClientFromSession(sessionString, accountId);
    const dialogs = await client.getDialogs({ limit: 500 });
    const groups = dialogs.filter((d: any) => d.isGroup || d.isChannel);

    updateJob(job.id, { total: groups.length });
    let sent = 0; let failed = 0;

    for (let i = 0; i < groups.length; i++) {
      const dialog = groups[i] as any;
      try {
        await client.sendMessage(dialog.entity, { message });
        sent++;
      } catch (err: unknown) {
        const flood = parseFloodWait(err);
        if (flood !== null) {
          recordError(accountId, "flood");
          await handleFloodWait(accountId, flood);
          i--; continue;
        }
        failed++;
      }
      updateJob(job.id, { progress: i + 1 });
      if (i < groups.length - 1) await sleep(delaySeconds * 1000 + Math.random() * 2000);
    }

    updateJob(job.id, {
      status: "completed", completedAt: new Date().toISOString(),
      result: { added: sent, failed },
    });
    return { sent, failed };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    updateJob(job.id, { status: "failed", completedAt: new Date().toISOString(), error: msg });
    throw err;
  }
}

// ─── 4. List joined dialogs ───────────────────────────────────────────────────

export async function listJoinedGroups(sessionString: string, accountId: string) {
  const client = await getClientFromSession(sessionString, accountId);
  const dialogs = await client.getDialogs({ limit: 500 });
  return dialogs
    .filter((d: any) => d.isGroup || d.isChannel)
    .map((d: any) => ({
      id:    d.id?.toString() ?? "",
      title: d.title ?? "",
      type:  d.isChannel ? "channel" : "group",
      membersCount: (d.entity as any)?.participantsCount ?? 0,
    }));
}

// ─── 5. Extract admins ────────────────────────────────────────────────────────

export async function runExtractAdmins(job: Job) {
  const config = job.config as {
    group: string;
    sessionString: string;
  };
  const { group, sessionString } = config;
  const accountId = job.accountId!;

  logger.info({ jobId: job.id, group }, "Extract admins starting");
  updateJob(job.id, { status: "running", startedAt: new Date().toISOString() });

  try {
    const client = await getClientFromSession(sessionString, accountId);
    const entity = await resolveEntity(client, group);

    const result = await client.invoke(
      new Api.channels.GetParticipants({
        channel: entity as any,
        filter: new Api.ChannelParticipantsAdmins(),
        offset: 0,
        limit: 200,
        hash: 0 as any,
      })
    );

    const users = (result as any).users as Api.User[];
    const admins: MemberRecord[] = users
      .filter((u): u is Api.User => u instanceof Api.User && !u.deleted)
      .map((u) => ({
        userId:     u.id.toString(),
        accessHash: u.accessHash?.toString() || undefined,
        username:   u.username   || "",
        firstName:  u.firstName  || "",
        lastName:   u.lastName   || "",
        phone:      u.phone      || "",
        isOnline:   u.status instanceof Api.UserStatusOnline,
        status:     "pending" as const,
      }));

    updateJob(job.id, {
      status: "completed", completedAt: new Date().toISOString(),
      progress: admins.length, total: admins.length,
      result: { members: admins, extracted: admins.length },
    });
    return admins;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    updateJob(job.id, { status: "failed", completedAt: new Date().toISOString(), error: msg });
    throw err;
  }
}

// ─── 6. Update account profile ───────────────────────────────────────────────

export async function updateAccountProfile(
  sessionString: string,
  accountId: string,
  opts: { firstName?: string; lastName?: string; bio?: string }
) {
  const client = await getClientFromSession(sessionString, accountId);
  await client.invoke(
    new Api.account.UpdateProfile({
      firstName: opts.firstName,
      lastName:  opts.lastName,
      about:     opts.bio,
    })
  );
  return { ok: true };
}
