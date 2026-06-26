/**
 * ADD MEMBERS SERVICE v5.0 — جبار + حماية ذكية
 * ================================================
 *
 * فلسفة مضاد الحظر للكتابة:
 *   - FloodWait ≤ 60s  → ننتظر ونكمل
 *   - FloodWait > 60s  → ندور للحساب التالي فوراً (لا ننتظر)
 *   - PeerFlood        → ندور فوراً، إذا انتهت الحسابات ننتظر 5 دقائق
 *   - USER_PRIVACY     → نحاول contact-import، إن فشل نتخطى
 *   - USERS_TOO_MUCH   → توقف فوري (المجموعة ممتلئة)
 *
 * إصلاحات v5:
 *   1. FloodWait > 60s → rotate فوراً بدل الانتظار
 *   2. تدوير فوري عند FloodWait الطويل أثناء حل الكيان
 *   3. إعادة محاولة USER_PRIVACY مع contact-import إن وُجد رقم
 *   4. maybeInterleavePause بين كل إضافتين (محاكاة إنسانية)
 *   5. إعادة حل targetEntity دائماً عند التدوير
 */

import { Api } from "telegram";
import { getClient, getClientFromSession } from "./client-manager.js";
import { updateJob, type Job, type MemberRecord } from "./jobs.js";
import { loadMembersFile } from "./members-files.js";
import { loadAccounts, resetDailyCountsIfNeeded } from "./session-store.js";
import { isKnownInvalid, markInvalid, resolveEntity } from "./entity-cache.js";
import {
  sleep,
  humanDelay,
  parseFloodWait,
  isPeerFlood,
  isPrivacyError,
  isAlreadyMember,
  isNotFound,
  handleFloodWait,
  recordAction,
  recordError,
  resetCircuit,
  maybeInterleavePause,
} from "./anti-ban.js";
import { logger } from "../lib/logger.js";

// ─── Config ───────────────────────────────────────────────────────────────────

const FLOOD_ROTATE_THRESHOLD = 60; // seconds — above this, rotate instead of wait

// ─── Helpers ──────────────────────────────────────────────────────────────────

function errMsg(e: unknown): string { return e instanceof Error ? e.message : String(e); }

/** أخطاء يجب تخطيها فوراً بدون إعادة محاولة */
function isSkippable(err: unknown): { skip: boolean; reason: string } {
  const m = errMsg(err).toUpperCase();
  const patterns: [string[], string][] = [
    [["USER_NOT_MUTUAL_CONTACT"],           "لا تواصل متبادل"],
    [["USER_CHANNELS_TOO_MUCH"],            "في عدد كافٍ من القنوات"],
    [["INPUT_USER_DEACTIVATED","USER_DEACTIVATED"], "حساب محذوف"],
    [["USER_BOT"],                          "بوت"],
    [["USER_KICKED"],                       "مطرود من المجموعة"],
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

/** أخطاء تعني توقف العملية كلها */
function isFatal(err: unknown): string | null {
  const m = errMsg(err).toUpperCase();
  if (m.includes("USERS_TOO_MUCH"))      return "المجموعة ممتلئة (USERS_TOO_MUCH)";
  if (m.includes("CHAT_ADMIN_REQUIRED")) return "يتطلب صلاحيات أدمن";
  if (m.includes("CHANNEL_PRIVATE"))     return "القناة خاصة";
  return null;
}

type Client = Awaited<ReturnType<typeof getClient>>;

/** اتصال + حل targetEntity في خطوة واحدة */
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

/** بناء InputUser من userId+accessHash المخزّن */
function buildInputUser(m: MemberRecord): Api.InputUser | null {
  if (m.userId && m.accessHash) {
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
  // أولوية: inline members (من الهاتف عبر "from-phone")
  if (inline?.length) return (inline as MemberRecord[]).filter((m) => m.status === "pending");
  if (mode === "from-file" && fileId) {
    const f = loadMembersFile(fileId);
    return f ? f.members.filter((m) => m.status === "pending") : [];
  }
  if (mode === "by-username" && usernames)
    return (usernames as string[])
      .map((u: string) => u.trim().replace(/^@/, ""))
      .filter(Boolean)
      .map((u: string) => ({ userId: "", username: u, firstName: "", lastName: "", isOnline: false, status: "pending" as const }));
  if (mode === "by-id" && userIds)
    return (userIds as string[])
      .filter(Boolean)
      .map((id: string) => ({ userId: id, username: "", firstName: "", lastName: "", isOnline: false, status: "pending" as const }));
  return [];
}

// ─── الدالة الرئيسية ──────────────────────────────────────────────────────────

export async function runAddMembers(job: Job) {
  const cfg = job.config as {
    targetGroup: string; mode: string; fileId?: string;
    usernames?: string[]; userIds?: string[]; delaySeconds: number;
    maxPerDay: number; warmup?: boolean; sessionString?: string;
    members?: MemberRecord[]; allAccounts?: Array<{ id: string; sessionString?: string }>;
  };

  const { targetGroup, delaySeconds = 3, maxPerDay = 200 } = cfg;
  const accountId = job.accountId!;

  const allAccounts: Array<{ id: string; sessionString?: string }> =
    cfg.allAccounts?.length ? cfg.allAccounts : [{ id: accountId, sessionString: cfg.sessionString }];

  logger.info({ jobId: job.id, mode: cfg.mode, targetGroup, accounts: allAccounts.length, maxPerDay }, "add-members v5 start");
  updateJob(job.id, { status: "running", startedAt: new Date().toISOString() });

  const accountData = loadAccounts().find((a) => a.id === accountId);
  if (accountData) resetDailyCountsIfNeeded(accountData);

  const list = await buildList(cfg);
  if (list.length === 0) {
    updateJob(job.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      result: { added: 0, failed: 0, skipped: 0, errors: ["لا يوجد أعضاء للإضافة"] },
    });
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

  // ── دوال التدوير ──────────────────────────────────────────────────────────

  /** تدوير للحساب التالي المتاح */
  const rotateNext = async (): Promise<boolean> => {
    for (let next = accIdx + 1; next < allAccounts.length; next++) {
      accIdx = next;
      currentAccId = allAccounts[accIdx]!.id;
      updateJob(job.id, { status: "running", error: `🔄 تدوير → الحساب ${accIdx + 1}/${allAccounts.length}` });
      try {
        ({ client, targetEntity } = await connectAndResolve(allAccounts[accIdx]!, targetGroup));
        logger.info({ newAcc: currentAccId, accIdx }, "✓ Rotated + re-resolved target");
        updateJob(job.id, { status: "running", error: undefined });
        return true;
      } catch (e) {
        logger.warn({ err: errMsg(e), accIdx }, "Rotation failed — trying next");
      }
    }
    return false;
  };

  /** إعادة التعيين لأول حساب بعد انتظار */
  const rotateAllAndWait = async (): Promise<boolean> => {
    accIdx = 0;
    currentAccId = allAccounts[0]!.id;
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
      updateJob(job.id, {
        status: "completed",
        error: `✓ وصل للحد اليومي: ${maxPerDay}`,
        completedAt: new Date().toISOString(),
        result: { added, failed, skipped, errors, members: list },
      });
      return;
    }

    // تخطي المحفوظين كغير صالحين
    if (id && isKnownInvalid(id)) {
      m.status = "failed"; m.error = "غير صالح (ذاكرة)";
      failed++; skipped++;
      updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: list } });
      continue;
    }

    // ── حل كيان المستخدم ──────────────────────────────────────────────────

    let userEntity: any = buildInputUser(m); // أسرع — من userId+accessHash

    if (!userEntity && m.username) {
      try {
        userEntity = await resolveEntity(client, m.username);
      } catch (err) {
        const fw = parseFloodWait(err);
        if (fw !== null) {
          recordError(currentAccId, "flood");
          if (fw > FLOOD_ROTATE_THRESHOLD) {
            // FloodWait طويل أثناء حل الكيان — ندور
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
        m.status = "failed"; m.error = `فشل الحل: ${errMsg(err).slice(0, 60)}`; failed++;
        updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: list } });
        continue;
      }
    }

    if (!userEntity && m.userId) {
      try { userEntity = await resolveEntity(client, m.userId); } catch { /* يفشل لاحقاً */ }
    }

    // contact-import إن كان يملك رقم هاتف
    if (!userEntity && (m as any).phone) {
      userEntity = await tryImportContact(client, (m as any).phone);
    }

    if (!userEntity) {
      m.status = "failed"; m.error = "لا يمكن حل المستخدم"; failed++; skipped++;
      updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: list } });
      continue;
    }

    // ── محاولة الإضافة ────────────────────────────────────────────────────

    try {
      // جرّب InviteToChannel أولاً (للقنوات والسوبرغروبات)
      try {
        await client.invoke(new Api.channels.InviteToChannel({ channel: targetEntity, users: [userEntity] }));
      } catch (inner) {
        const im = errMsg(inner).toUpperCase();
        // إذا كانت مجموعة أساسية جرّب AddChatUser
        if (im.includes("CHAT_ID_INVALID") || im.includes("NOT_MODIFIED")) {
          await client.invoke(new Api.messages.AddChatUser({
            chatId: (targetEntity as any).chatId ?? (targetEntity as any).id,
            userId: userEntity,
            fwdLimit: 50,
          }));
        } else throw inner;
      }

      // ✓ نجاح
      m.status = "added"; added++;
      recordAction(currentAccId);
      logger.info({ acc: currentAccId, user: id, added, total: list.length }, "✓ Added");
      updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: list } });

      // تأخير بشري بين الإضافات + توقف عرضي للمحاكاة
      await maybeInterleavePause(added);
      if (i < list.length - 1) {
        await sleep(Math.round(delaySeconds * 1000 * (0.7 + Math.random() * 0.6)));
      }

    } catch (err) {

      // توقف كامل
      const fatalMsg = isFatal(err);
      if (fatalMsg) {
        updateJob(job.id, {
          status: "completed",
          error: `🛑 ${fatalMsg}`,
          completedAt: new Date().toISOString(),
          result: { added, failed, skipped, errors, members: list },
        });
        return;
      }

      // عضو موجود بالفعل
      if (isAlreadyMember(err)) {
        m.status = "already_member"; skipped++;
        updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: list } });
        continue;
      }

      // خصوصية → نحاول contact-import إن لم نجرّبه بعد
      if (isPrivacyError(err) || isSkippable(err).skip) {
        const { reason } = isSkippable(err);
        // إذا كان سبب الخصوصية ولديه رقم → نحاول contact-import
        if (isPrivacyError(err) && (m as any).phone && !(userEntity instanceof Api.InputUser && (userEntity as any)._importedContact)) {
          const imported = await tryImportContact(client, (m as any).phone);
          if (imported) {
            // نعيد المحاولة مع الكيان المستورد
            (imported as any)._importedContact = true;
            userEntity = imported;
            i--; list[i + 1] = { ...m, status: "pending" as const }; // أعد المحاولة
            continue;
          }
        }
        m.status = "privacy"; m.error = reason || "خصوصية";
        if (id) markInvalid(id, reason || "Privacy");
        skipped++;
        updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: list } });
        continue;
      }

      // PeerFlood → ندور فوراً
      if (isPeerFlood(err)) {
        recordError(currentAccId, "peer_flood");
        logger.warn({ acc: currentAccId }, "PeerFlood — rotating now");
        const ok = await rotateNext();
        if (ok) { m.status = "pending"; i--; continue; }
        peerFloodRounds++;
        if (peerFloodRounds >= MAX_ROUNDS) {
          updateJob(job.id, {
            status: "completed",
            error: `⚠️ جميع الحسابات PeerFlood — أُضيف ${added}`,
            completedAt: new Date().toISOString(),
            result: { added, failed, skipped, errors, members: list },
          });
          return;
        }
        const waitOk = await rotateAllAndWait();
        if (!waitOk) {
          updateJob(job.id, { status: "completed", error: "⚠️ فشل الاتصال بعد الانتظار", completedAt: new Date().toISOString(), result: { added, failed, skipped, errors, members: list } });
          return;
        }
        m.status = "pending"; i--; continue;
      }

      // FloodWait
      const fw = parseFloodWait(err);
      if (fw !== null) {
        recordError(currentAccId, "flood");
        if (fw > FLOOD_ROTATE_THRESHOLD) {
          // FloodWait طويل → ندور فوراً بدل الانتظار
          logger.warn({ acc: currentAccId, fw }, "FloodWait > 60s — rotating account instead of waiting");
          const ok = await rotateNext();
          if (ok) { m.status = "pending"; i--; continue; }
          // لا حسابات أخرى → ننتظر بدون خيار
          updateJob(job.id, { status: "running", error: `⏳ FloodWait ${fw}s (لا حسابات أخرى)...`, result: { added, failed, skipped, errors, members: list } });
          await handleFloodWait(currentAccId, fw);
          updateJob(job.id, { status: "running", error: undefined });
        } else {
          // FloodWait قصير → ننتظر
          m.status = "flood"; m.error = `FloodWait ${fw}s`;
          updateJob(job.id, { status: "running", error: `⏳ FloodWait ${fw}s...`, result: { added, failed, skipped, errors, members: list } });
          await handleFloodWait(currentAccId, fw);
          updateJob(job.id, { status: "running", error: undefined });
        }
        m.status = "pending"; i--; continue;
      }

      // خطأ غير معروف
      m.status = "failed"; m.error = errMsg(err).slice(0, 80);
      failed++; errors.push(`${id}: ${m.error}`);
      logger.warn({ acc: currentAccId, err: m.error, user: id }, "Unknown add error");
      updateJob(job.id, { progress: i + 1, result: { added, failed, skipped, errors, members: list } });
    }
  }

  logger.info({ jobId: job.id, added, failed, skipped }, "add-members v5 done");
  updateJob(job.id, {
    status: "completed",
    progress: list.length,
    completedAt: new Date().toISOString(),
    result: { added, failed, skipped, errors, members: list },
  });
}
