import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { loadAccounts, getAccount, upsertAccount, type StoredAccount } from "./session-store.js";

const API_ID = parseInt(process.env["TELEGRAM_API_ID"] || "0");
const API_HASH = process.env["TELEGRAM_API_HASH"] || "";

if (!API_ID || !API_HASH) {
  throw new Error("TELEGRAM_API_ID and TELEGRAM_API_HASH must be set");
}

const activeClients = new Map<string, TelegramClient>();

export async function getClient(accountId: string): Promise<TelegramClient> {
  if (activeClients.has(accountId)) {
    const client = activeClients.get(accountId)!;
    if (client.connected) return client;
    await client.connect();
    return client;
  }

  const account = getAccount(accountId);
  if (!account) throw new Error(`Account ${accountId} not found`);

  const session = new StringSession(account.sessionString);
  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 3,
    requestRetries: 3,
  });

  await client.connect();
  activeClients.set(accountId, client);
  return client;
}

export async function disconnectClient(accountId: string) {
  const client = activeClients.get(accountId);
  if (client) {
    await client.disconnect();
    activeClients.delete(accountId);
  }
}

export async function disconnectAll() {
  for (const [id, client] of activeClients) {
    await client.disconnect();
    activeClients.delete(id);
  }
}

export function createFreshClient(): TelegramClient {
  const session = new StringSession("");
  return new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 3,
  });
}

export { API_ID, API_HASH };
