import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { decryptSensitive, encryptSensitive } from "./data-crypto.js";

const originalEnvironment = { ...process.env };

beforeEach(() => {
  process.env["NODE_ENV"] = "test";
  delete process.env["DATA_ENCRYPTION_KEY"];
});

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("sensitive data encryption", () => {
  it("round-trips values with AES-256-GCM and a unique IV", () => {
    process.env["DATA_ENCRYPTION_KEY"] = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    const first = encryptSensitive("telegram-session-secret");
    const second = encryptSensitive("telegram-session-secret");

    assert.match(first, /^enc:v1:/);
    assert.notEqual(first, second);
    assert.equal(decryptSensitive(first), "telegram-session-secret");
    assert.equal(decryptSensitive(second), "telegram-session-secret");
  });

  it("accepts a 32-byte base64 key", () => {
    process.env["DATA_ENCRYPTION_KEY"] = Buffer.alloc(32, 7).toString("base64");
    const encrypted = encryptSensitive("api-hash");
    assert.equal(decryptSensitive(encrypted), "api-hash");
  });

  it("detects ciphertext tampering", () => {
    process.env["DATA_ENCRYPTION_KEY"] = Buffer.alloc(32, 9).toString("base64");
    const encrypted = encryptSensitive("sensitive-value");
    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("A") ? "B" : "A"}`;
    assert.throws(() => decryptSensitive(tampered), /unable to decrypt/i);
  });

  it("preserves legacy plaintext only outside production", () => {
    assert.equal(encryptSensitive("legacy-plaintext"), "legacy-plaintext");
    assert.equal(decryptSensitive("legacy-plaintext"), "legacy-plaintext");

    process.env["NODE_ENV"] = "production";
    assert.throws(() => encryptSensitive("must-encrypt"), /required in production/i);
  });

  it("rejects malformed key material", () => {
    process.env["DATA_ENCRYPTION_KEY"] = "not-a-valid-32-byte-key";
    assert.throws(() => encryptSensitive("secret"), /exactly 32 bytes/i);
  });
});
