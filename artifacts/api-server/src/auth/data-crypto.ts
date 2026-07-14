import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1";

function encryptionKey(): Buffer | undefined {
  const configured = process.env["DATA_ENCRYPTION_KEY"]?.trim();
  if (!configured) {
    if (process.env["NODE_ENV"] === "production") {
      throw new Error("DATA_ENCRYPTION_KEY is required in production");
    }
    return undefined;
  }

  let key: Buffer;
  if (/^[0-9a-f]{64}$/i.test(configured)) {
    key = Buffer.from(configured, "hex");
  } else {
    key = Buffer.from(configured, "base64");
  }
  if (key.length !== 32) {
    throw new Error("DATA_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return key;
}

export function isEncryptedSensitive(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(`${PREFIX}:`));
}

export function encryptSensitive(value: string): string {
  if (!value || isEncryptedSensitive(value)) return value;
  const key = encryptionKey();
  if (!key) return value;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decryptSensitive(value: string): string {
  if (!value || !isEncryptedSensitive(value)) return value;
  const key = encryptionKey();
  if (!key) throw new Error("DATA_ENCRYPTION_KEY is required to decrypt stored data");

  const parts = value.split(":");
  if (parts.length !== 5 || parts[0] !== "enc" || parts[1] !== "v1") {
    throw new Error("Unsupported encrypted data format");
  }

  try {
    const iv = Buffer.from(parts[2]!, "base64url");
    const tag = Buffer.from(parts[3]!, "base64url");
    const ciphertext = Buffer.from(parts[4]!, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (error) {
    throw new Error(`Unable to decrypt sensitive data: ${error instanceof Error ? error.message : String(error)}`);
  }
}
