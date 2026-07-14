import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";

const TOKEN_VERSION = 1;
const DEFAULT_SESSION_TTL_SECONDS = 8 * 60 * 60;

interface AdminTokenPayload {
  v: number;
  sub: "admin";
  iat: number;
  exp: number;
  nonce: string;
}

function configuredAdminSecret(): string {
  const secret = process.env["ADMIN_SECRET_KEY"]?.trim() ?? "";
  if (!secret) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "ADMIN_SECRET_KEY is not configured",
    });
  }
  if (process.env["NODE_ENV"] === "production" && secret.length < 16) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "ADMIN_SECRET_KEY must contain at least 16 characters in production",
    });
  }
  return secret;
}

function signingKey(): string {
  const key = process.env["ADMIN_TOKEN_KEY"]?.trim() || configuredAdminSecret();
  if (process.env["NODE_ENV"] === "production" && key.length < 32) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "ADMIN_TOKEN_KEY must contain at least 32 characters in production",
    });
  }
  return key;
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function signature(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

export function verifyAdminPassword(password: string): boolean {
  return secureEqual(password, configuredAdminSecret());
}

export function createAdminToken(nowSeconds = Math.floor(Date.now() / 1000)): {
  token: string;
  expiresAt: string;
} {
  const configuredTtl = Number.parseInt(process.env["ADMIN_SESSION_TTL_SECONDS"] ?? "", 10);
  const ttl = Number.isFinite(configuredTtl)
    ? Math.min(Math.max(configuredTtl, 300), 24 * 60 * 60)
    : DEFAULT_SESSION_TTL_SECONDS;
  const payload: AdminTokenPayload = {
    v: TOKEN_VERSION,
    sub: "admin",
    iat: nowSeconds,
    exp: nowSeconds + ttl,
    nonce: randomBytes(16).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return {
    token: `${encoded}.${signature(encoded)}`,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

export function assertAdminToken(token: string | undefined, nowSeconds = Math.floor(Date.now() / 1000)): AdminTokenPayload {
  if (!token) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Admin authentication is required" });
  }

  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid admin session" });
  }
  if (!secureEqual(suppliedSignature, signature(encoded))) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid admin session" });
  }

  let payload: AdminTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AdminTokenPayload;
  } catch {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid admin session" });
  }

  if (
    payload.v !== TOKEN_VERSION ||
    payload.sub !== "admin" ||
    !Number.isInteger(payload.iat) ||
    !Number.isInteger(payload.exp) ||
    payload.iat > nowSeconds + 60 ||
    payload.exp <= nowSeconds
  ) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Admin session expired or invalid" });
  }

  return payload;
}

export function bearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) return undefined;
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization.trim());
  return match?.[1];
}
