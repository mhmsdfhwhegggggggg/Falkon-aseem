import fs from "fs";
import path from "path";
import type { MemberRecord } from "./jobs.js";

const DATA_DIR = process.env["DATA_DIR"] || path.join(process.cwd(), "../../data");
const FILES_DIR = path.join(DATA_DIR, "members");
const INDEX_FILE = path.join(DATA_DIR, "members_index.json");

export interface MembersFile {
  id: string;
  name: string;
  sourceGroup: string;
  createdAt: string;
  memberCount: number;
  addedCount: number;
  members: MemberRecord[];
}

function ensureDir() {
  if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });
}

export function loadMembersIndex(): Omit<MembersFile, "members">[] {
  ensureDir();
  if (!fs.existsSync(INDEX_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf-8"));
  } catch {
    return [];
  }
}

export function saveMembersFile(file: MembersFile): MembersFile {
  ensureDir();
  const filePath = path.join(FILES_DIR, `${file.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(file, null, 2));

  const index = loadMembersIndex();
  const { members: _m, ...meta } = file;
  const idx = index.findIndex((f) => f.id === file.id);
  if (idx >= 0) {
    index[idx] = meta;
  } else {
    index.push(meta);
  }
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
  return file;
}

export function loadMembersFile(id: string): MembersFile | null {
  ensureDir();
  const filePath = path.join(FILES_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as MembersFile;
  } catch {
    return null;
  }
}

export function deleteMembersFile(id: string) {
  const filePath = path.join(FILES_DIR, `${id}.json`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  const index = loadMembersIndex().filter((f) => f.id !== id);
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
}

export function createMembersFile(name: string, sourceGroup: string, members: MemberRecord[]): MembersFile {
  const file: MembersFile = {
    id: `mf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    sourceGroup,
    createdAt: new Date().toISOString(),
    memberCount: members.length,
    addedCount: 0,
    members,
  };
  return saveMembersFile(file);
}
