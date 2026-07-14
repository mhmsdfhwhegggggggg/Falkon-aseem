/**
 * ADD MEMBERS SERVICE v5.0 — TRUE PARALLEL MAXIMUM POWER
 * ========================================================
 * v4: تسلسلي — حساب واحد يُضيف حتى يُحوَّل عند PeerFlood
 * v5: متوازٍ — N حساب تُضيف في نفس الوقت = N× الإنتاجية
 *
 * مع 10 حسابات: 2000 إضافة/يوم (بدلاً من 200)
 * كل حساب يعالج chunk مستقل بشكل كامل
 */

import { Api } from "telegram";
import { getClient, getClientFromSession } from "./client-manager.js";
import { updateJob, type Job, type MemberRecord } from "./jobs.js";
import { loadMembersFile } from "./members-files.js";
import { loadAccounts, resetDailyCountsIfNeeded } from "./session-store.js";
import { isKnownInvalid, markInvalid, resolveEntity } from "./entity-cache.js";
import {
  sleep, parseFloodWait, isPeerFlood, isPrivacyError,
  isAlreadyMember, isNotFound, handleFloodWait,
  recordAction, recordError, resetCircuit, canAct,
} from "./anti-ban.js";
import { logger } from "../lib/logger.js";

function errMsg(e: unknown): string { return e instanceof Error ? e.message : String(e); }

function isSkippable(err: unknown): { skip: boolean; reason: string } {
  const m = errMsg(err).toUpperCase();
  const patterns: [string[], string][] = [
    [["USER_NOT_MUTUAL_CONTACT"],                  "لا تواصل متبادل"],
    [["USER_CHANNELS_TOO_MUCH"],                   "في عدد كافٍ من القنوات"],
    [["INPUT_USER_DEACTIVATED","USER_DEACTIVATED"],"حساب محذوف"],
    [["USER_BOT"],                                 "حساب بوت"],
    [["USER_KICKED"],                              "مطرود"],
    [["USER_BANNED_IN_CHANNEL"],                   "محظور في القناة"],
    [["USER_BLOCKED"],                             "حجب الحساب"],
    [["PEER_ID_INVALID","PEER_ID_NOT_SUPPORTED"],  "مستخدم غير صالح"],
    [["USER_PRIVACY","PRIVACY_KEY_INVALID"],       "إعدادات الخصوصية"],
    [["CHAT_WRITE_FORBIDDEN"],                     "لا صلاحية كتابة"],
    [["USER_RESTRICTED"],                          "مقيّد"],
    [["BOTS_TOO_MUCH"],                            "عدد بوتات كافٍ"],
    [["PARTICIPANT_VERSION_OUTDATED"],             "إصدار قديم"],
  ];
  for (const [pats, reason] of patterns) {
    if (pats.some((p) => m.includes(p))) return { skip: true, reason };
  }
  return { skip: false, reason: "" };
}

function isFatal(err: unknown): string | null {
  const m = errMsg(err).toUpperCase();
  if (m.includes("USERS_TOO_MUCH"))      return "المجموعة ممتلئة";
  if (m.includes("CHAT_ADMIN_REQUIRED")) return "يتطلب صلاحيات أدمن";
  if (m.includes("CHANNEL_PRIVATE"))     return "القناة خاصة";
  return null;
}

type Client = Awaited<ReturnType<typeof getClient>>;

async function connectAndResolve(acc: { id: string; sessionString?: string }, targetGroup: string): Promise<{ client: Client; targetEntity: any }> {
  const client = acc.sessionString
    ? await getClientFromSession(acc.sessionString, acc.id)
    : await getClient(acc.id);
  const targetEntity = await resolveEntity(client, targetGroup);
  return { client, targetEntity };
}

async function tryImportContact(client: Client, phone: string): Promise<Api.InputUser | null> {
  try {
    const res = await client.invoke(new Api.contacts.ImportContacts({
      contacts: [new Api.InputPhoneContact({
        clientId: BigInt(Math.floor(Math.random() * 1e10)) as any,
        phone, firstName: "u", lastName: "",
      })],
    })) as any;
    const u = res.users?.[0];
    if (u?.id && u?.accessHash)
      return new Api.InputUser({ userId: u.id, accessHash: u.accessHash });
  } catch { /* ignore */ }
  return null;
}

function buildInputUser(m: MemberRecord): Api.InputUser | null {
  if (m.userId && m.accessHash) {
    try { return new Api.InputUser({ userId: BigInt(m.userId) as any, accessHash: BigInt(m.accessHash) as any }); }
    catch { return null; }
  }
  return null;
}

async function buildList(cfg: any): Promise<MemberRecord[]> {
  const { mode, fileId, usernames, userIds, members: inline } = cfg;
  if (inline?.length) return inline.filter((m: MemberRecord) => m.status === "pending");
  if (mode === "from-file" && fileId) {
    const f = loadMembersFile(fileId);
    return f ? f.members.filter((m) => m.status === "pending") : [];
  }
  if (mode === "by-username" && usernames)
    return (usernames as string[]).map((u: string) => u.trim().replace(/^@/, "")).filter(Boolean)
      .map((u: string) => ({ userId: "", username: u, firstName: "", lastName: "", isOnline: false, status: "pending" as const }));
  if (mode === "by-id" && userIds)
    return (userIds as string[]).filter(Boolean)
      .map((id: string) => ({ userId: id, username: "", firstName: "", lastName: "", isOnline: false, status: "pending" as const }));
  return [];
}

function splitIntoChunks<T>(arr: T[], n: number): T[][] {
  const chunks: T[][] = Array.from({ length: n }, () => []);
  arr.forEach((item, i) => chunks[i % n]!.push(item));
  return chunks;
}

interface GlobalStats { added: number; failed: number; skipped: number; errors: string[]; }

async function runAccountWorker(
  acc: { id: string; sessionString?: string },
  chunk: MemberRecord[],
  targetGroup: string,
  delaySeconds: number,
  maxPerDay: number,
  stats: GlobalStats,
  jobId: string,
  updateJobFn: () => void,
): Promise<void> {
  const accountId = acc.id;
  let client: Client;
  let targetEntity: any;

  try {
    ({ client, targetEntity } = await connectAndResolve(acc, targetGroup));
    logger.info({ accountId, chunkSize: chunk.length }, "Worker connected");
  } catch (err) {
    logger.warn({ accountId, err: errMsg(err) }, "Worker connect failed — skipping");
    for (const m of chunk) { m.status = "failed"; m.error = "فشل اتصال الحساب"; stats.failed++; }
    updateJobFn();
    return;
  }

  let peerFloodCount = 0;
  const MAX_PEER_FLOODS = 2;

  for (let i = 0; i < chunk.length; i++) {
    const m = chunk[i]!;
    const id = m.username || m.userId;

    if (!canAct(accountId, maxPerDay)) {
      logger.info({ accountId }, "Daily cap reached");
      for (let j = i; j < chunk.length; j++) { chunk[j]!.status = "pending"; stats.skipped++; }
      updateJobFn(); return;
    }

    if (id && isKnownInvalid(id)) {
      m.status = "failed"; m.error = "غير صالح (ذاكرة)"; stats.failed++; stats.skipped++;
      updateJobFn(); continue;
    }

    let userEntity: any = buildInputUser(m);

    if (!userEntity && m.username) {
      try { userEntity = await resolveEntity(client, m.username); }
      catch (err) {
        const fw = parseFloodWait(err);
        if (fw !== null) { recordError(accountId, "flood"); await handleFloodWait(accountId, fw); i--; continue; }
        if (isNotFound(err)) { if (id) markInvalid(id, "Not found"); m.status = "failed"; m.error = "غير موجود"; stats.failed++; stats.skipped++; updateJobFn(); continue; }
        m.status = "failed"; m.error = `فشل الحل: ${errMsg(err).slice(0,60)}`; stats.failed++; updateJobFn(); continue;
      }
    }

    if (!userEntity && m.userId) { try { userEntity = await resolveEntity(client, m.userId); } catch { /* */ } }
    if (!userEntity && (m as any).phone) { userEntity = await tryImportContact(client, (m as any).phone); }

    if (!userEntity) { m.status = "failed"; m.error = "لا يمكن حل المستخدم"; stats.failed++; stats.skipped++; updateJobFn(); continue; }

    try {
      try {
        await client.invoke(new Api.channels.InviteToChannel({ channel: targetEntity, users: [userEntity] }));
      } catch (inner) {
        const im = errMsg(inner).toUpperCase();
        if (im.includes("CHAT_ID_INVALID") || im.includes("NOT_MODIFIED")) {
          await client.invoke(new Api.messages.AddChatUser({
            chatId: (targetEntity as any).chatId ?? (targetEntity as any).id, userId: userEntity, fwdLimit: 50,
          }));
        } else throw inner;
      }
      m.status = "added"; stats.added++;
      recordAction(accountId);
      logger.info({ accountId, user: id, totalAdded: stats.added }, "✓ Added");
      updateJobFn();
      if (i < chunk.length - 1) await sleep(Math.round(delaySeconds * 1000 * (0.8 + Math.random() * 0.4)));

    } catch (err) {
      const fatalMsg = isFatal(err);
      if (fatalMsg) {
        logger.error({ accountId, fatal: fatalMsg }, "Fatal — stopping worker");
        for (let j = i; j < chunk.length; j++) { chunk[j]!.status = "failed"; chunk[j]!.error = fatalMsg; stats.failed++; }
        updateJobFn(); return;
      }
      if (isAlreadyMember(err)) { m.status = "already_member"; stats.skipped++; updateJobFn(); continue; }
      const { skip, reason } = isSkippable(err);
      if (skip || isPrivacyError(err)) {
        m.status = "privacy"; m.error = reason || "خصوصية"; if (id) markInvalid(id, reason || "Privacy");
        stats.skipped++; updateJobFn(); continue;
      }
      if (isPeerFlood(err)) {
        recordError(accountId, "peer_flood"); peerFloodCount++;
        logger.warn({ accountId, peerFloodCount }, "PeerFlood");
        if (peerFloodCount >= MAX_PEER_FLOODS) {
          logger.error({ accountId }, "Worker PeerFlood limit — retiring");
          for (let j = i; j < chunk.length; j++) { chunk[j]!.status = "pending"; stats.skipped++; }
          updateJobFn(); return;
        }
        await sleep(5 * 60 * 1000 * peerFloodCount);
        resetCircuit(accountId);
        try { ({ client, targetEntity } = await connectAndResolve(acc, targetGroup)); } catch { /* keep old */ }
        m.status = "pending"; i--; continue;
      }
      const fw = parseFloodWait(err);
      if (fw !== null) {
        recordError(accountId, "flood"); m.status = "flood"; m.error = `FloodWait ${fw}s`;
        await handleFloodWait(accountId, fw); m.status = "pending"; i--; continue;
      }
      m.status = "failed"; m.error = errMsg(err).slice(0, 80);
      stats.failed++; stats.errors.push(`${id}: ${m.error}`);
      logger.warn({ accountId, err: m.error, user: id }, "Unknown add error"); updateJobFn();
    }
  }
  logger.info({ accountId }, "Worker chunk finished");
}

export async function runAddMembers(job: Job) {
  const cfg = job.config as {
    targetGroup: string; mode: string; fileId?: string; usernames?: string[]; userIds?: string[];
    delaySeconds: number; maxPerDay: number; sessionString?: string; members?: MemberRecord[];
    allAccounts?: Array<{ id: string; sessionString?: string }>;
  };

  const { targetGroup, delaySeconds = 3, maxPerDay = 200 } = cfg;
  const accountId = job.accountId!;

  const allAccounts: Array<{ id: string; sessionString?: string }> =
    cfg.allAccounts?.length ? cfg.allAccounts : [{ id: accountId, sessionString: cfg.sessionString }];

  const parallelMode = allAccounts.length > 1;
  logger.info({ jobId: job.id, mode: cfg.mode, targetGroup, accounts: allAccounts.length, maxPerDay, parallelMode }, "add-members v5 start");
  updateJob(job.id, { status: "running", startedAt: new Date().toISOString() });

  const accountData = loadAccounts().find((a) => a.id === accountId);
  if (accountData) resetDailyCountsIfNeeded(accountData);

  const list = await buildList(cfg);
  if (list.length === 0) {
    updateJob(job.id, { status: "completed", completedAt: new Date().toISOString(), result: { added: 0, failed: 0, skipped: 0, errors: ["لا يوجد أعضاء للإضافة"] } });
    return;
  }
  updateJob(job.id, { total: list.length });

  const stats: GlobalStats = { added: 0, failed: 0, skipped: 0, errors: [] };
  const updateJobFn = () => updateJob(job.id, {
    progress: stats.added + stats.failed + stats.skipped,
    result: { added: stats.added, failed: stats.failed, skipped: stats.skipped, errors: stats.errors, members: list },
  });

  if (parallelMode) {
    logger.info({ accounts: allAccounts.length, listSize: list.length }, "PARALLEL mode");
    const chunks = splitIntoChunks(list, allAccounts.length);
    await Promise.all(
      allAccounts.map((acc, idx) =>
        runAccountWorker(acc, chunks[idx] ?? [], targetGroup, delaySeconds, maxPerDay, stats, job.id, updateJobFn)
      )
    );
  } else {
    await runAccountWorker(allAccounts[0]!, list, targetGroup, delaySeconds, maxPerDay, stats, job.id, updateJobFn);
  }

  logger.info({ jobId: job.id, ...stats }, "add-members v5 done");
  updateJob(job.id, {
    status: "completed", progress: list.length, completedAt: new Date().toISOString(),
    result: { added: stats.added, failed: stats.failed, skipped: stats.skipped, errors: stats.errors, members: list },
  });
}
