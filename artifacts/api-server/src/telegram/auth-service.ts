import { TelegramClient, Api } from "telegram";
import { computeCheck } from "telegram/Password.js";
import { StringSession } from "telegram/sessions/index.js";
import { createFreshClient, API_ID, API_HASH } from "./client-manager.js";
import { upsertAccount, loadAccounts } from "./session-store.js";
import { logger } from "../lib/logger.js";

const pendingAuth = new Map<string, { client: TelegramClient; phone: string; phoneCodeHash: string }>();

export async function startPhoneAuth(phone: string): Promise<{ phoneCodeHash: string; sessionId: string }> {
  const client = createFreshClient();
  await client.connect();

  const result = await client.invoke(
    new Api.auth.SendCode({
      phoneNumber: phone,
      apiId: API_ID,
      apiHash: API_HASH,
      settings: new Api.CodeSettings({}),
    })
  );

  const sessionId = `auth_${Date.now()}`;
  pendingAuth.set(sessionId, { client, phone, phoneCodeHash: (result as Api.auth.SentCode).phoneCodeHash });

  logger.info({ phone, sessionId }, "Phone auth started, code sent");
  return { phoneCodeHash: (result as Api.auth.SentCode).phoneCodeHash, sessionId };
}

export async function confirmPhoneCode(sessionId: string, code: string, password?: string): Promise<{
  success: boolean;
  accountId: string;
  phone: string;
  firstName: string;
  lastName: string;
  username: string;
  userId: string;
  sessionString: string;
}> {
  const pending = pendingAuth.get(sessionId);
  if (!pending) throw new Error("Auth session expired or not found");

  const { client, phone, phoneCodeHash } = pending;

  try {
    let user: Api.User;

    try {
      const result = await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: phone,
          phoneCodeHash,
          phoneCode: code,
        })
      );
      user = (result as Api.auth.Authorization).user as Api.User;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("SESSION_PASSWORD_NEEDED") && password) {
        const srp = await client.invoke(new Api.account.GetPassword());
        const check = await computeCheck(srp as Api.account.Password, password);
        const result = await client.invoke(new Api.auth.CheckPassword({ password: check }));
        user = (result as Api.auth.Authorization).user as Api.User;
      } else {
        throw err;
      }
    }

    const sessionString = (client.session as StringSession).save();
    const today = new Date().toISOString().split("T")[0]!;

    const account = {
      id: `acc_${user.id.toString()}`,
      phone,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      username: user.username || "",
      userId: user.id.toString(),
      sessionString,
      addedAt: new Date().toISOString(),
      isActive: true,
      dailyAdded: 0,
      lastReset: today,
    };

    await upsertAccount(account);
    pendingAuth.delete(sessionId);

    logger.info({ phone, userId: account.userId }, "Account authenticated");
    return { success: true, accountId: account.id, ...account };
  } catch (err) {
    logger.error({ sessionId, err }, "Auth confirm failed");
    throw err;
  }
}

export async function resendCode(sessionId: string): Promise<void> {
  const pending = pendingAuth.get(sessionId);
  if (!pending) throw new Error("Auth session not found");

  await pending.client.invoke(
    new Api.auth.ResendCode({
      phoneNumber: pending.phone,
      phoneCodeHash: pending.phoneCodeHash,
    })
  );
  logger.info({ sessionId }, "Code resent");
}

export function getPendingAuthCount() {
  return pendingAuth.size;
}
