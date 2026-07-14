import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  assertAdminToken,
  bearerToken,
  createAdminToken,
  verifyAdminPassword,
} from "./admin-auth.js";

const originalEnvironment = { ...process.env };

beforeEach(() => {
  process.env["NODE_ENV"] = "test";
  process.env["ADMIN_SECRET_KEY"] = "correct horse battery staple";
  process.env["ADMIN_TOKEN_KEY"] = "0123456789abcdef0123456789abcdef";
  delete process.env["ADMIN_SESSION_TTL_SECONDS"];
});

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("admin authentication", () => {
  it("compares the configured password and rejects other values", () => {
    assert.equal(verifyAdminPassword("correct horse battery staple"), true);
    assert.equal(verifyAdminPassword("correct horse battery staplf"), false);
    assert.equal(verifyAdminPassword(""), false);
  });

  it("creates a signed token with a bounded lifetime", () => {
    process.env["ADMIN_SESSION_TTL_SECONDS"] = "600";
    const issued = createAdminToken(1_000);
    const payload = assertAdminToken(issued.token, 1_001);

    assert.equal(payload.sub, "admin");
    assert.equal(payload.iat, 1_000);
    assert.equal(payload.exp, 1_600);
    assert.equal(issued.expiresAt, new Date(1_600_000).toISOString());
  });

  it("rejects expired and tampered tokens", () => {
    process.env["ADMIN_SESSION_TTL_SECONDS"] = "300";
    const { token } = createAdminToken(5_000);

    assert.throws(() => assertAdminToken(token, 5_300), /expired|invalid/i);

    const [payload, signature] = token.split(".");
    assert.ok(payload && signature);
    const tampered = `${payload}.${signature.slice(0, -1)}${signature.endsWith("a") ? "b" : "a"}`;
    assert.throws(() => assertAdminToken(tampered, 5_001), /invalid/i);
  });

  it("requires a strong signing key in production", () => {
    process.env["NODE_ENV"] = "production";
    process.env["ADMIN_TOKEN_KEY"] = "too-short";
    assert.throws(() => createAdminToken(1_000), /at least 32 characters/i);
  });

  it("extracts only a well-formed Bearer token", () => {
    assert.equal(bearerToken("Bearer abc.def"), "abc.def");
    assert.equal(bearerToken("bearer token-value"), "token-value");
    assert.equal(bearerToken("Basic dXNlcjpwYXNz"), undefined);
    assert.equal(bearerToken("Bearer token extra"), undefined);
    assert.equal(bearerToken(undefined), undefined);
  });
});
