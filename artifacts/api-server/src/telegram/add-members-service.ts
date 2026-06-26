/**
 * ADD MEMBERS SERVICE v6.0 — الحل الجذري
 * =========================================
 *
 * المشكلة الجذرية (v5): أعضاء القنوات العامة لديهم accessHash=0 → InputUser غير صالح
 *
 * الحل الحقيقي (v6):
 *   إذا accessHash غير صالح → channels.GetParticipant(sourceGroup, userId)
 *   يعيد User مع accessHash الحقيقي ← هذا ما تفعله Dragon Tools
 *
 * سلسلة حل كيان المستخدم (بالأولوية):
 *   1. userId + accessHash صالح → InputUser مباشرة (أسرع)
 *   2. username → resolveEntity
 *   3. userId وحده → channels.GetParticipant(sourceGroup) ← الجديد
 *   4. phone → contacts.ImportContacts
 *   5. فشل → تخطي مع سبب
 *
 * مضاد الحظر:
 *   FloodWait ≤ 60s  → ننتظر
 *   FloodWait > 60s  → ندور للحساب التالي
 *   PeerFlood        → تدوير فوري
 */

import { Api } from "telegram";
import { getClient, getClientFromSession } from "./client-manager.js";
import { updateJob, type Job, type MemberRecord } from "./jobs.js";
import { loadMembersFile } from "./members-files.js";
import { loadAccounts, resetDailyCountsIfNeeded } from "./session-store.js";
import { isKnownInvalid, markInvalid, resolveEntity, setCachedEntity } from "./entity-cache.js";
import {
  sleep, parseFloodWait, isPeerFlood, isPrivacyError,
  isAlreadyMember, isNotFound, handleFloodWait,
  recordAction, recordError, resetCircuit, maybeInterleavePause,
} from "./anti-ban.js";
import { logger } from "../lib/logger.js";

const FLOOD_ROTATE_THRESHOLD = 60;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function errMsg(e: unknown): string { return e instanceof Error ? e.message : String(e); }

function isSkippable(err: unknown): { skip: boolean; reason: string } {
  const m = errMsg(err).toUpperCase();
  const patterns: [string[], string][] = [
    [["USER_NOT_MUTUAL_CONTACT"],           "لا تواصل متبادل"],
    [["USER_CHANNELS_TOO_MUCH"],            "في عدد كافٍ من القنوات"],
    [["INPUT_USER_DEACTIVATED","USER_DEACTIVATED"], "حساب محذوف"],
    [["USER_BOT"],                          "بوت"],
    [["USER_KICKED"],                       "مطرود"],
    [["USER_BANNED_IN_CHANNEL"],            "محظور في القناة"],
    [["USER_BLOCKED"],                      "حجب الحساب"],
    [["PEER_ID_INVALID","PEER_ID_NOT_SUPPORTED"], "مستخدم غير صالح"],
    [["CHAT_WRITE_FORBIDDEN"],              "لا صلاحية كتابة"],
    [["USER_RESTRICTED"],                   "مقيّد"],
    [["BOTS_TOO_MUCH"],                     "عدد بوتات كافٍ"],
    [["PARTICIPANT_VERSION_OUTDATED"],      "إصدار قديم"],
    [["USER_PRIVACY","PRIVACY_KEY_INVALID"], "خصوصية المستخدم"],
  ];
  for (const [pats, reason] of patterns) {
    if (pats.some((p) => m.includes(p))) return { skip: true, reason };
  }
  return { skip: false, reason: "" };
}

function isFatal(err: unknown): string | null {
  const m = errMsg(err).toUpperCase();
  if (m.includes("USERS_TOO_MUCH"))      return "المجموعة ممتلئة (USERS_TOO_MUCH)";
  if (m.includes("CHAT_ADMIN_REQUIRED")) return "يتطلب صلاحيات أدمن";
  if (m.includes("CHANNEL_PRIVATE"))     return "القناة خاصة";
  return null;
}

type Client = Awaited<ReturnType<typeof getClient>>;

async function connectAndResolve(
  acc: { id: string; sessionString?: string },
  targetGroup: string,
): Promise<{ client: Client; targetEntity: any }> {
  const client = acc.sessionString
    ? await getClientFromSession(acc.sessionString, acc.id)
    : await getClient(acc.id);
  const targetEntity = await resolveEntity(client, targetGroup);
  return { client, targetEntity };
}

/** استيراد كجهة اتصال لتجاوز بعض قيود الخصوصية */
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

/**
 * ⭐ الجديد: حل userId عبر channels.GetParticipant من المجموعة المصدر
 * يُعيد accessHash الحقيقي حتى لأعضاء القنوات العامة
 */
async function resolveViaSourceGroup(
  client: Client,
  sourceGroupEntity: any,
  userId: string,
): Promise<Api.InputUser | null> {
  try {
    const res = await client.invoke(new Api.channels.GetParticipant({
      channel: sourceGroupEntity,
      participant: new Api.InputPeerUser({
        userId: BigInt(userId) as any,
        accessHash: BigInt(0) as any,
      }) as any,
    })) as any;

    // users[0] has the real accessHash
    const user = res.users?.[0];
    if (user instanceof Api.User && user.accessHash && user.accessHash.toString() !== "0") {
      // Cache for reuse
      if (user.username) setCachedEntity(user.username, user);
      setCachedEntity(userId, user);
      return new Api.InputUser({ userId: user.id, accessHash: user.accessHash });
    }
  } catch (err) {
    logger.debug({ userId, err: errMsg(err) }, "GetParticipant fallback failed");
  }
  return null;
}

/** بناء InputUser من userId+accessHash صالح */
function buildInputUser(m: MemberRecord): Api.InputUser | null {
  if (m.userId && m.accessHash && m.accessHash !== "0") {
    try {
      return new Api.InputUser({
        userId: BigInt(m.userId) as any,
        accessHash: BigInt(m.accessHash) as any,
      });
    } catch { return null; }
  }
  return null;
}

/** تجميع قائمة الأعضاء من المصدر */
async function buildList(cfg: any): Promise<MemberRecord[]> {
  const { mode, fileId, usernames, userIds, members: inline } = cfg;
  if (inline?.length) return (inline as MemberRecord[]).filter((m) => m.status === "pending");
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

// ─── الدالة الرئيسية ──────────────────────────────────────────────────────────

export async function runAddMembers(job: Job) {
  const cfg = job.config as {
    targetGroup: string; mode: string; fileId?: string;
    usernames?: string[]; userIds?: string[]; delaySeconds: number;
    maxPerDay: number; warmup?: boolean; sessionString?: string;
    members?: MemberRecord[];
    sourceGroup?: string; // المجموعة المصدر — لحل accessHash عبر GetParticipant
    allAccounts?: Array<{ id: string; sessionString?: string }>;
  };

  const { targetGroup, delaySeconds = 3, maxPerDay = 200 } = cfg;
  const accountId = job.accountId!;

  const allAccounts: Array<{ id: string; sessionString?: string }> =
    cfg.allAccounts?.length ? cfg.allAccounts : [{ id: accountId, sessionString: cfg.sessionString }];

  logger.info({ jobId: job.id, mode: cfg.mode, targetGroup, sourceGroup: cfg.sourceGroup, accounts: allAccounts.length, maxPerDay }, "add-members v6 start");
  updateJob(job.id, { status: "running", startedAt: new Date().toISOString() });

  const accountData = loadAccounts().find((a) => a.id === accountId);
  if (accountData) resetDailyCountsIfNeeded(accountData);

  const list = await buildList(cfg);
  if (list.length === 0) {
    updateJob(job.id, { status: "completed", completedAt: new Date().toISOString(), result: { added: 0, failed: 0, skipped: 0, errors: ["لا يوجد أعضاء للإضافة"] } });
    return;
  }
  updateJob(job.id, { total: list.length });

  // ── حالة الاتصال ──────────────────────────────────────────────────────────

  let accIdx = 0;
  let currentAccId = allAccounts[0]!.id;
  let client: Client;
  let targetEntity: any;

  try {
    ({ client, targetEntity } = await connectAndResolve(allAccounts[0]!, targetGroup));
    logger.info({ accId: currentAccId, targetGroup }, "✓ Initial connect OK");
  } catch (err) {
    updateJob(job.id, { status: "failed", error: `فشل الاتصال: ${errMsg(err)}`, completedAt: new Date().toISOString() });
    return;
  }

  // حل المجموعة المصدر (إن وُجدت) لاستخدامها في GetParticipant
  let sourceGroupEntity: any = null;
  if (cfg.sourceGroup) {
    try {
      sourceGroupEntity = await resolveEntity(client, cfg.sourceGroup);
      logger.info({ sourceGroup: cfg.sourceGroup }, "✓ Source group resolved for GetParticipant fallback");
    } catch (e) {
      logger.warn({ sourceGroup: cfg.sourceGroup, err: errMsg(e) }, "Could not resolve source group — GetParticipant fallback disabled");
    }
  }

  // ── دوال التدوير ──────────────────────────────────────────────────────────

  const rotateNext = async (): Promise<boolean> => {
    for (let next = accIdx + 1; next < allAccounts.length; next++) {
      accIdx = next;
      currentAccId = allAccounts[accIdx]!.id;
      updateJob(job.id, { status: "running", error: `🔄 تدوير → الحساب ${accIdx + 1}/${allAccounts.length}` });
      try {
        ({ client, targetEntity } = await connectAndResolve(allAccounts[accIdx]!, targetGroup));
        // إعادة حل المجموعة المصدر للحساب الجديد
        if (cfg.sourceGroup && !sourceGroupEntity) {
          try { sourceGroupEntity = await resolveEntity(client, cfg.sourceGroup); } catch { /* ignore */ }
        }
        logger.info({ newAcc: currentAccId, accIdx }, "✓ Rotated + re-resolved target");
        updateJob(job.id, { status: "running", error: undefined });
        return true;
      } catch (e) {
        logger.warn({ err: errMsg(e), accIdx }, "Rotation failed — trying next");
      }
    }
    return false;
  };

  const rotateAllAndWait = async (): Promise<boolean> => {
    accIdx = 0; currentAccId = allAccounts[0]!.id;
    updateJob(job.id, { status: "running", error: "⏳ جميع الحسابات مقيّدة — انتظار 5 دقائق..." });
    await sleep(5 * 60_000);
    for (const a of allAccounts) resetCircuit(a.id);
    try {
      ({ client, targetEntity } = await connectAndResolve(allAccounts[0]!, targetGroup));
      updateJob(job.id, { status: "running", error: undefined });
      return true;
    } catch { return false; }
  };

  // ── الإحصاءات ─────────────────────────────────────────────────────────────

  let added = 0, failed = 0, skipped = 0, peerFloodRounds = 0;
  const errors: string[] = [];
  const MAX_ROUNDS = 3;

  // ── الحلقة الرئيسية ───────────────────────────────────────────────────────

  for (let i = 0; i < list.length; i++) {
    const m = list[i]!;
    const id = m.username || m.userId;

    // حد يومي
    if (added >= maxPerDay) {
      updateJob(job.id, { status: "completed", error: `✓ وصل للحد اليومي: ${maxPerDay}`, completedAt: new Date().toISOString(), result: { added, failed, skipped, errors, members: list } });
      return;
    }

    // تخطي المحفوظين كغير صالحين
    if (id && isKnownInvalid(id)) {
      m.status = "failed"; m.error = "غير صالح (ذاكرة)";
      failed++; skipped++;
      updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: list } });
      continue;
    }

    // ── سلسلة حل كيان المستخدم ────────────────────────────────────────────

    let userEntity: any = buildInputUser(m); // 1. userId + accessHash صالح

    if (!userEntity && m.username) {         // 2. username
      try {
        userEntity = await resolveEntity(client, m.username);
      } catch (err) {
        const fw = parseFloodWait(err);
        if (fw !== null) {
          recordError(currentAccId, "flood");
          if (fw > FLOOD_ROTATE_THRESHOLD) {
            const ok = await rotateNext();
            if (ok) { i--; continue; }
          } else {
            updateJob(job.id, { status: "running", error: `⏳ FloodWait ${fw}s...` });
            await handleFloodWait(currentAccId, fw);
            updateJob(job.id, { status: "running", error: undefined });
          }
          i--; continue;
        }
        if (isNotFound(err)) {
          if (id) markInvalid(id, "Not found");
          m.status = "failed"; m.error = "غير موجود"; failed++; skipped++;
          updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: list } });
          continue;
        }
        // خطأ آخر — نكمل بدون username
      }
    }

    // 3. ⭐ userId عبر GetParticipant من المجموعة المصدر (للقنوات العامة)
    if (!userEntity && m.userId && sourceGroupEntity) {
      userEntity = await resolveViaSourceGroup(client, sourceGroupEntity, m.userId);
      if (userEntity) {
        logger.info({ userId: m.userId }, "✓ Resolved via GetParticipant");
      }
    }

    // 4. phone → contact import
    if (!userEntity && (m as any).phone) {
      userEntity = await tryImportContact(client, (m as any).phone);
    }

    if (!userEntity) {
      const hint = m.userId ? "(لا accessHash — استخرج من مجموعة وليس قناة)" : "(لا username ولا userId)";
      m.status = "failed"; m.error = `لا يمكن حل المستخدم ${hint}`; failed++; skipped++;
      updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: list } });
      continue;
    }

    // ── محاولة الإضافة ────────────────────────────────────────────────────

    try {
      try {
        await client.invoke(new Api.channels.InviteToChannel({ channel: targetEntity, users: [userEntity] }));
      } catch (inner) {
        const im = errMsg(inner).toUpperCase();
        if (im.includes("CHAT_ID_INVALID") || im.includes("NOT_MODIFIED")) {
          await client.invoke(new Api.messages.AddChatUser({
            chatId: (targetEntity as any).chatId ?? (targetEntity as any).id,
            userId: userEntity, fwdLimit: 50,
          }));
        } else throw inner;
      }

      // ✓ نجاح
      m.status = "added"; added++;
      recordAction(currentAccId);
      logger.info({ acc: currentAccId, user: id, added, total: list.length }, "✓ Added");
      updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: list } });
      await maybeInterleavePause(added);
      if (i < list.length - 1) {
        await sleep(Math.round(delaySeconds * 1000 * (0.7 + Math.random() * 0.6)));
      }

    } catch (err) {

      const fatalMsg = isFatal(err);
      if (fatalMsg) {
        updateJob(job.id, { status: "completed", error: `🛑 ${fatalMsg}`, completedAt: new Date().toISOString(), result: { added, failed, skipped, errors, members: list } });
        return;
      }

      if (isAlreadyMember(err)) {
        m.status = "already_member"; skipped++;
        updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: list } });
        continue;
      }

      if (isPrivacyError(err) || isSkippable(err).skip) {
        const { reason } = isSkippable(err);
        m.status = "privacy"; m.error = reason || "خصوصية";
        if (id) markInvalid(id, reason || "Privacy");
        skipped++;
        updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: list } });
        continue;
      }

      if (isPeerFlood(err)) {
        recordError(currentAccId, "peer_flood");
        logger.warn({ acc: currentAccId }, "PeerFlood — rotating");
        const ok = await rotateNext();
        if (ok) { m.status = "pending"; i--; continue; }
        peerFloodRounds++;
        if (peerFloodRounds >= MAX_ROUNDS) {
          updateJob(job.id, { status: "completed", error: `⚠️ جميع الحسابات PeerFlood — أُضيف ${added}`, completedAt: new Date().toISOString(), result: { added, failed, skipped, errors, members: list } });
          return;
        }
        const waitOk = await rotateAllAndWait();
        if (!waitOk) { updateJob(job.id, { status: "completed", error: "⚠️ فشل الاتصال بعد الانتظار", completedAt: new Date().toISOString(), result: { added, failed, skipped, errors, members: list } }); return; }
        m.status = "pending"; i--; continue;
      }

      const fw = parseFloodWait(err);
      if (fw !== null) {
        recordError(currentAccId, "flood");
        if (fw > FLOOD_ROTATE_THRESHOLD) {
          logger.warn({ acc: currentAccId, fw }, "FloodWait > 60s — rotating");
          const ok = await rotateNext();
          if (ok) { m.status = "pending"; i--; continue; }
        }
        updateJob(job.id, { status: "running", error: `⏳ FloodWait ${fw}s...`, result: { added, failed, skipped, errors, members: list } });
        await handleFloodWait(currentAccId, fw);
        updateJob(job.id, { status: "running", error: undefined });
        m.status = "pending"; i--; continue;
      }

      // خطأ غير معروف
      m.status = "failed"; m.error = errMsg(err).slice(0, 80);
      failed++; errors.push(`${id}: ${m.error}`);
      logger.warn({ acc: currentAccId, err: m.error, user: id }, "Unknown add error");
      updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: list } });
    }
  }

  logger.info({ jobId: job.id, added, failed, skipped }, "add-members v6 done");
  updateJob(job.id, { status: "completed", progress: list.length, completedAt: new Date().toISOString(), result: { added, failed, skipped, errors, members: list } });
}
