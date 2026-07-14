import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./telegram/trpc-router.js";
import { bearerToken } from "./auth/admin-auth.js";

const app: Express = express();

// Trust Replit's reverse proxy so express-rate-limit reads the real client IP
app.set("trust proxy", 1);

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false, // API server — no HTML
  }),
);

// ─── GZIP compression (cuts bandwidth 60-80%) ─────────────────────────────────
app.use(compression());

// ─── Request logging ──────────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// ─── CORS — explicit allow-list for the dashboard and Capacitor app ──────────
const allowedOrigins = new Set([
  "http://85.155.190.130",
  "http://localhost",
  "https://localhost",
  "capacitor://localhost",
  ...(process.env["CORS_ALLOWED_ORIGINS"] ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
]);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error("Origin is not allowed by CORS"));
    },
    credentials: false,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-hwid", "trpc-batch-mode", "authorization"],
    maxAge: 86400,
  }),
);

// ─── Global rate limiter — prevent abuse ─────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please wait a moment" },
  skip: (req) => {
    return (
      req.url?.includes("extraction.status") ||
      req.url?.includes("addMembers.status") ||
      req.url?.includes("jobs.get") ||
      req.url?.includes("jobs.list") ||
      req.url?.includes("chatters.status") ||
      req.url?.includes("contentCloner.status") ||
      req.url?.includes("contactsFilter.status") ||
      req.url?.includes("groupManager.status") ||
      req.url?.includes("bulkMessage.status") ||
      req.url?.includes("scheduler.list")
    ) ?? false;
  },
});

// Stricter limiter for auth (prevent OTP abuse)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: "Too many auth attempts — please wait 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);
app.use("/api/trpc/auth.login", authLimiter);
app.use("/api/trpc/accounts.startAuth", authLimiter);
app.use("/api/trpc/accounts.confirmAuth", authLimiter);

// ─── Body parsers ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use("/api", router);

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext: ({ req }) => ({
      adminToken: bearerToken(req.header("authorization")),
    }),
    onError({ error, path }) {
      logger.error({ path, error: error.message }, "tRPC error");
    },
  }),
);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    ts: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  });
});

export default app;
