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

const app: Express = express();

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

// ─── CORS — open for all origins (mobile APK + web) ──────────────────────────
app.use(
  cors({
    origin: true,
    credentials: false,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-hwid", "trpc-batch-mode"],
    maxAge: 86400,
  }),
);

// ─── Global rate limiter — prevent abuse ─────────────────────────────────────
// 300 requests / 1 minute per IP (generous for legit users)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please wait a moment" },
  skip: (req) => {
    // Never rate-limit job status polling (it's cheap in-memory reads)
    return req.url?.includes("extraction.status") ||
           req.url?.includes("addMembers.status") ||
           req.url?.includes("jobs.get") ||
           req.url?.includes("jobs.list");
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
    createContext: () => ({}),
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
