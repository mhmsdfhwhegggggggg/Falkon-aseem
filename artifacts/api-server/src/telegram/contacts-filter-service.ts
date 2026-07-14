/**
 * CONTACTS FILTER SERVICE
 * =======================
 * Checks a list of phone numbers to see which ones have active Telegram accounts.
 * Returns full profile data for each number that resolves.
 *
 * Uses ImportContacts temporarily then deletes them — no permanent changes to contacts.
 */

import { Api } from "telegram";
import bigInt from "big-integer";
import { getClientFromSession } from "./client-manager.js";
import { updateJob, type Job, type MemberRecord } from "./jobs.js";
import { sleep, parseFloodWait, handleFloodWait, recordError } from "./anti-ban.js";
import { logger } from "../lib/logger.js";

const BATCH = 20; // import in small batches to avoid flood

export async function runContactsFilter(job: Job) {
  const config = job.config as {
    phones: string[];          // list of phone numbers (international format)
    sessionString: string;
  };

  const { phones, sessionString } = config;
  const accountId = job.accountId!;
  const cleaned = phones
    .map((p) => p.replace(/\D/g, ""))
    .filter((p) => p.length >= 7 && p.length <= 15);

  logger.info({ jobId: job.id, total: cleaned.length }, "Contacts filter starting");
  updateJob(job.id, { status: "running", startedAt: new Date().toISOString(), progress: 0, total: cleaned.length });

  try {
    const client = await getClientFromSession(sessionString, accountId);
    const found: MemberRecord[] = [];
    const notFound: string[] = [];

    for (let i = 0; i < cleaned.length; i += BATCH) {
      const batch = cleaned.slice(i, i + BATCH);

      const contacts = batch.map((phone, idx) =>
        new Api.InputPhoneContact({
          clientId: bigInt(i + idx),
          phone,
          firstName: `Contact${i + idx}`,
          lastName: "",
        })
      );

      let result: any;
      let retries = 0;
      while (true) {
        try {
          result = await client.invoke(new Api.contacts.ImportContacts({ contacts }));
          retries = 0;
          break;
        } catch (err: unknown) {
          const flood = parseFloodWait(err);
          if (flood !== null) {
            recordError(accountId, "flood");
            await handleFloodWait(accountId, flood);
            continue;
          }
          retries++;
          if (retries >= 3) { result = null; break; }
          await sleep(Math.pow(2, retries) * 1000);
        }
      }

      if (result) {
        const users = (result.users ?? []) as Api.User[];
        const importedMap = new Map<string, Api.User>();
        for (const u of users) {
          if (u instanceof Api.User && u.phone) {
            importedMap.set(u.phone.replace(/\D/g, ""), u);
          }
        }

        for (const phone of batch) {
          const user = importedMap.get(phone);
          if (user) {
            found.push({
              userId:     user.id.toString(),
              accessHash: user.accessHash?.toString() || undefined,
              username:   user.username   || "",
              firstName:  user.firstName  || "",
              lastName:   user.lastName   || "",
              phone:      user.phone      || phone,
              isOnline:   user.status instanceof Api.UserStatusOnline,
              status:     "pending" as const,
            });
          } else {
            notFound.push(phone);
          }
        }

        // Delete imported contacts to stay clean
        const toDelete = users
          .filter((u): u is Api.User => u instanceof Api.User)
          .map((u) => new Api.InputUser({ userId: u.id, accessHash: u.accessHash ?? bigInt.zero }));
        if (toDelete.length > 0) {
          try {
            await client.invoke(new Api.contacts.DeleteContacts({ id: toDelete }));
          } catch { /* best-effort */ }
        }
      }

      updateJob(job.id, { progress: Math.min(i + BATCH, cleaned.length), total: cleaned.length });
      if (i + BATCH < cleaned.length) await sleep(600 + Math.random() * 400);
    }

    updateJob(job.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      progress: cleaned.length,
      total: cleaned.length,
      result: {
        members: found,
        extracted: found.length,
        errors: [`لا يوجد تيليجرام: ${notFound.length} رقم`],
      },
    });
    logger.info({ jobId: job.id, found: found.length, notFound: notFound.length }, "Contacts filter complete");
    return { found, notFound };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ jobId: job.id, err: msg }, "Contacts filter failed");
    updateJob(job.id, { status: "failed", completedAt: new Date().toISOString(), error: msg });
    throw err;
  }
}
