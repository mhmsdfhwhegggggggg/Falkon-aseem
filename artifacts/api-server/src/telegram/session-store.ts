import fs from "fs";
import path from "path";

const DATA_DIR = process.env["DATA_DIR"] || path.join(process.cwd(), "../../data");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

export interface StoredAccount {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  username: string;
  userId: string;
  sessionString: string;
  addedAt: string;
  isActive: boolean;
  dailyAdded: number;
  lastReset: string;
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadAccounts(): StoredAccount[] {
  ensureDir();
  if (!fs.existsSync(SESSIONS_FILE)) return [];
  try {
    const raw = fs.readFileSync(SESSIONS_FILE, "utf-8");
    return JSON.parse(raw) as StoredAccount[];
  } catch {
    return [];
  }
}

export function saveAccounts(accounts: StoredAccount[]) {
  ensureDir();
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(accounts, null, 2));
}

export function getAccount(id: string): StoredAccount | undefined {
  return loadAccounts().find((a) => a.id === id);
}

export function upsertAccount(account: StoredAccount) {
  const accounts = loadAccounts();
  const idx = accounts.findIndex((a) => a.id === account.id);
  if (idx >= 0) {
    accounts[idx] = account;
  } else {
    accounts.push(account);
  }
  saveAccounts(accounts);
}

export function removeAccount(id: string) {
  const accounts = loadAccounts().filter((a) => a.id !== id);
  saveAccounts(accounts);
}

export function resetDailyCountsIfNeeded(account: StoredAccount): StoredAccount {
  const today = new Date().toISOString().split("T")[0];
  if (account.lastReset !== today) {
    return { ...account, dailyAdded: 0, lastReset: today! };
  }
  return account;
}
