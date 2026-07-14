import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import { loadAccounts, removeAccount, getAccount } from "./session-store.js";
import { startPhoneAuth, confirmPhoneCode, resendCode } from "./auth-service.js";
import { createJob, getJob, loadJobs, updateJob } from "./jobs.js";
import { runExtraction } from "./extraction-service.js";
import { runAddMembers } from "./add-members-service.js";
import { runBulkMessage } from "./bulk-message-service.js";
import { runContentCloner } from "./content-cloner-service.js";
import { loadMembersIndex, loadMembersFile, deleteMembersFile } from "./members-files.js";
import { workerPool } from "./worker-pool.js";
import { getHealthReport, getDetailedHealth, resetCircuit, resetAllCircuits } from "./anti-ban.js";
import { getCacheStats as getEntityCacheStats } from "./entity-cache.js";
import { getPoolMetrics, setAccountProxy } from "./client-manager.js";
import { logger } from "../lib/logger.js";
import { assertAdminToken, createAdminToken, verifyAdminPassword } from "../auth/admin-auth.js";
import {
  createLicense, activateLicense, verifyLicense,
  listLicenses, revokeLicense, renewLicense, getLicenseLogs,
  type LicenseTier,
} from "./license-service.js";
import { requestApiOtp, confirmApiOtpAndGetCredentials } from "./api-credentials-service.js";
import { setAccountApiCredentials } from "./client-manager.js";
import { checkAndAutoReply } from "./auto-reply-service.js";
import { runChatterExtraction } from "./chatters-service.js";
import { runContactsFilter } from "./contacts-filter-service.js";
import {
  runJoinGroups,
  runLeaveGroups,
  runSendToJoined,
  listJoinedGroups,
  runExtractAdmins,
  updateAccountProfile,
} from "./group-manager-service.js";
import {
  createScheduledJob,
  listScheduledJobs,
  deleteScheduledJob,
  getScheduledJob,
  updateScheduledJobStatus,
  getPendingJobsDue,
} from "./scheduler-service.js";

// ─── Shared zod schema for proxy config ──────────────────────────────────────
const ProxyConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  type: z.enum(["socks5", "http", "mtproto"]),
  username: z.string().optional(),
  password: z.string().optional(),
  secret: z.string().optional(),
}).optional();

export interface TRPCContext {
  adminToken?: string;
}

const t = initTRPC.context<TRPCContext>().create({ transformer: superjson });
export const router = t.router;
export const publicProcedure = t.procedure;
export const procedure = publicProcedure.use(({ ctx, next }) => {
  assertAdminToken(ctx.adminToken);
  return next({ ctx });
});

const authRouter = router({
  login: publicProcedure
    .input(z.object({ password: z.string().min(1).max(512) }))
    .mutation(({ input }) => {
      if (!verifyAdminPassword(input.password)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid administrator credentials" });
      }
      return createAdminToken();
    }),
  session: procedure.query(() => ({ authenticated: true })),
});

const accountsRouter = router({
  list: procedure.query(() => {
    return { accounts: loadAccounts().map(({ sessionString: _s, ...rest }) => rest) };
  }),

  startAuth: procedure
    .input(z.object({ phone: z.string().min(7) }))
    .mutation(async ({ input }) => {
      const result = await startPhoneAuth(input.phone);
      return result;
    }),

  confirmAuth: procedure
    .input(z.object({
      sessionId: z.string(),
      code: z.string().min(4),
      password: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await confirmPhoneCode(input.sessionId, input.code, input.password);
      // Return sessionString so the phone can store it locally (SecureStore)
      return result;
    }),

  resendCode: procedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input }) => {
      await resendCode(input.sessionId);
      return { success: true };
    }),

  importSession: procedure
    .input(z.object({ sessionString: z.string().min(10) }))
    .mutation(async ({ input }) => {
      const { TelegramClient, Api } = await import("telegram");
      const { StringSession } = await import("telegram/sessions/index.js");
      const { API_ID, API_HASH } = await import("./client-manager.js");
      const session = new StringSession(input.sessionString.trim());
      const client = new TelegramClient(session, API_ID, API_HASH, {
        connectionRetries: 2,
        useWSS: false,
        timeout: 15,
      });
      await client.connect();
      try {
        const me = await client.getMe() as any;
        const userId = String(me.id);
        const phone = me.phone ? `+${me.phone}` : "";
        const firstName = me.firstName || "";
        const lastName = me.lastName || "";
        const username = me.username || "";
        const savedSession = (client.session as InstanceType<typeof StringSession>).save();
        await client.disconnect();
        return { userId, phone, firstName, lastName, username, sessionString: savedSession };
      } catch (err) {
        await client.disconnect().catch(() => {});
        throw err;
      }
    }),

  remove: procedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await removeAccount(input.id);
      return { success: true };
    }),

  setActive: procedure
    .input(z.object({ id: z.string(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      const accounts = loadAccounts();
      const acc = accounts.find((a) => a.id === input.id);
      if (!acc) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      const { upsertAccount } = await import("./session-store.js");
      await upsertAccount({ ...acc, isActive: input.isActive });
      return { success: true };
    }),
});

const extractionRouter = router({
  start: procedure
    .input(z.object({
      group: z.string().min(1),
      limit: z.number().min(1).max(100000).default(500),
      filterActive: z.boolean().default(false),   // legacy — kept for compat
      excludeBots: z.boolean().default(true),
      lastSeenDays: z.number().min(0).max(3650).default(0),  // 0 = no filter
      dataFilter: z.enum(["all", "with-username", "without-username", "with-phone"]).default("all"),
      onlineOnly: z.boolean().default(false),
      mode: z.enum(["members", "admins", "subscribers", "contacts"]).default("members"),
      accountId: z.string(),
      sessionString: z.string().optional(), // phone-stored session
    }))
    .mutation(async ({ input }) => {
      // Support both phone-stored sessions and server-stored accounts
      if (!input.sessionString) {
        const account = getAccount(input.accountId);
        if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      }

      const job = createJob("extraction", {
        group: input.group,
        limit: input.limit,
        filterActive: input.filterActive,
        excludeBots: input.excludeBots,
        lastSeenDays: input.lastSeenDays,
        dataFilter: input.dataFilter,
        onlineOnly: input.onlineOnly,
        mode: input.mode,
        sessionString: input.sessionString, // stored in job config (in-memory only)
      }, input.accountId);

      workerPool.enqueue({
        id: job.id,
        accountId: input.accountId,
        priority: "normal",
        timeoutMs: 30 * 60 * 1000,
        addedAt: Date.now(),
        fn: () => runExtraction(job).then(() => {}),
      });

      return { jobId: job.id, status: "queued" };
    }),

  status: procedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      const job = getJob(input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      return {
        jobId: job.id,
        status: job.status,
        progress: job.progress,
        total: job.total,
        extracted: job.result?.extracted || 0,
        error: job.error,
        // savedFileId removed — storage is phone-side only
        completedAt: job.completedAt,
      };
    }),

  // Returns full members list after completion — phone saves it to FileSystem
  result: procedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      const job = getJob(input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      if (job.status !== "completed") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Job not completed yet" });
      return {
        jobId: job.id,
        members: job.result?.members || [],
        extracted: job.result?.extracted || 0,
        savedFileId: job.savedFileId,
        completedAt: job.completedAt,
      };
    }),
});

const MemberRecordSchema = z.object({
  userId: z.string(),
  accessHash: z.string().optional(),   // stored at extraction — used to build InputUser
  username: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  isOnline: z.boolean(),
  phone: z.string().optional(),
  lastSeen: z.string().optional(),
  status: z.enum(["pending", "added", "failed", "flood", "already_member", "privacy"]),
  error: z.string().optional(),
});

const addMembersRouter = router({
  start: procedure
    .input(z.object({
      targetGroup: z.string().min(1),
      mode: z.enum(["from-file", "by-username", "by-id", "from-phone"]),
      fileId: z.string().optional(),
      usernames: z.array(z.string()).optional(),
      userIds: z.array(z.string()).optional(),
      members: z.array(MemberRecordSchema).optional(), // phone-stored members sent inline
      delaySeconds: z.number().min(1).max(1000).default(3),
      maxPerDay: z.number().min(1).max(10000).default(500),
      accountId: z.string(),
      sessionString: z.string().optional(), // phone-stored session (primary account)
      allAccounts: z.array(z.object({          // rotation pool — all active accounts
        id: z.string(),
        sessionString: z.string().optional(),
      })).optional(),
      warmup: z.boolean().default(false),
      priority: z.enum(["low", "normal", "high"]).default("normal"),
    }))
    .mutation(async ({ input }) => {
      if (!input.sessionString) {
        const account = getAccount(input.accountId);
        if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      }

      const job = createJob("add_members", {
        targetGroup: input.targetGroup,
        mode: input.mode,
        fileId: input.fileId,
        usernames: input.usernames,
        userIds: input.userIds,
        members: input.members, // phone-stored members (inline)
        delaySeconds: input.delaySeconds,
        maxPerDay: input.maxPerDay,
        warmup: input.warmup,
        sessionString: input.sessionString, // phone-stored session
        allAccounts: input.allAccounts,      // account rotation pool
      }, input.accountId);

      workerPool.enqueue({
        id: job.id,
        accountId: input.accountId,
        priority: input.priority,
        timeoutMs: 6 * 60 * 60 * 1000, // 6 hours max (long running)
        addedAt: Date.now(),
        fn: () => runAddMembers(job),
      });

      return { jobId: job.id, status: "queued" };
    }),

  status: procedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      const job = getJob(input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      const isDone = job.status === "completed" || job.status === "failed" || job.status === "cancelled";
      return {
        jobId: job.id,
        status: job.status,
        progress: job.progress,
        total: job.total,
        added: job.result?.added || 0,
        failed: job.result?.failed || 0,
        skipped: job.result?.skipped || 0,
        errors: job.result?.errors || [],
        error: job.error,
        completedAt: job.completedAt,
        // Return members with updated statuses once job is done so phone can persist them
        members: isDone ? (job.result?.members || null) : null,
      };
    }),
});

const membersFilesRouter = router({
  list: procedure.query(() => {
    return { files: loadMembersIndex() };
  }),

  get: procedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      const file = loadMembersFile(input.id);
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
      return file;
    }),

  delete: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      deleteMembersFile(input.id);
      return { success: true };
    }),
});

const jobsRouter = router({
  list: procedure
    .input(z.object({
      type: z.enum(["extraction", "add_members", "bulk_message", "extract_and_add"]).optional(),
      status: z.enum(["queued", "running", "completed", "failed", "cancelled"]).optional(),
      limit: z.number().default(50),
    }).optional())
    .query(({ input }) => {
      let jobs = loadJobs();
      if (input?.type) jobs = jobs.filter((j) => j.type === input.type);
      if (input?.status) jobs = jobs.filter((j) => j.status === input.status);
      return { jobs: jobs.slice(-( input?.limit || 50)).reverse() };
    }),

  get: procedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      const job = getJob(input.id);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      return job;
    }),

  cancel: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const job = getJob(input.id);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      if (job.status === "running" || job.status === "queued") {
        updateJob(input.id, { status: "cancelled", completedAt: new Date().toISOString() });
      }
      return { success: true };
    }),
});

const statsRouter = router({
  overview: procedure
    .input(z.object({ period: z.enum(["today", "week", "month", "all"]).optional() }))
    .query(() => {
      const jobs = loadJobs();
      const accounts = loadAccounts();
      const files = loadMembersIndex();

      const extracted = files.reduce((a, f) => a + f.memberCount, 0);
      const added = files.reduce((a, f) => a + f.addedCount, 0);
      const completedJobs = jobs.filter((j) => j.status === "completed").length;
      const failedJobs = jobs.filter((j) => j.status === "failed").length;

      return {
        extracted,
        added,
        messagesSent: 0,
        tasksCompleted: completedJobs,
        errors: failedJobs,
        activeAccounts: accounts.filter((a) => a.isActive).length,
        totalFiles: files.length,
      };
    }),
});

const systemRouter = router({
  health: procedure.query(() => {
    const poolMetrics = workerPool.metrics();
    const accountHealth = getHealthReport();
    const entityCache = getEntityCacheStats();
    const clientPool = getPoolMetrics();

    return {
      workerPool: poolMetrics,
      accountHealth,
      entityCache,
      clientPool,
      uptime: process.uptime(),
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      timestamp: new Date().toISOString(),
    };
  }),

  accountHealth: procedure
    .input(z.object({ accountId: z.string() }))
    .query(({ input }) => {
      return getDetailedHealth(input.accountId);
    }),

  resetCircuit: procedure
    .input(z.object({ accountId: z.string() }))
    .mutation(({ input }) => {
      resetCircuit(input.accountId);
      return { success: true, accountId: input.accountId };
    }),

  resetAllCircuits: procedure
    .mutation(() => {
      const reset = resetAllCircuits();
      return { success: true, resetCount: reset.length, accounts: reset };
    }),

  setPoolSize: procedure
    .input(z.object({ concurrency: z.number().min(1).max(50) }))
    .mutation(({ input }) => {
      workerPool.setMaxConcurrency(input.concurrency);
      return { success: true, concurrency: input.concurrency };
    }),
});

// ─── Bulk Message Router ──────────────────────────────────────────────────────

const bulkMessageRouter = router({
  start: procedure
    .input(z.object({
      mode: z.enum(["dm", "group", "channel"]).default("dm"),
      message: z.string().min(1),
      targets: z.array(z.string()).min(1),
      delaySeconds: z.number().min(1).max(1000).default(3),
      maxPerDay: z.number().min(1).max(10000).default(500),
      warmup: z.boolean().default(false),
      parseMode: z.enum(["html", "markdown", "none"]).default("none"),
      accountId: z.string(),
      sessionString: z.string().optional(),
      allAccounts: z.array(z.object({
        id: z.string(),
        sessionString: z.string().optional(),
        proxy: ProxyConfigSchema,
      })).optional(),
      proxy: ProxyConfigSchema,
      priority: z.enum(["low", "normal", "high"]).default("normal"),
    }))
    .mutation(async ({ input }) => {
      if (!input.sessionString) {
        const account = getAccount(input.accountId);
        if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      }

      if (input.proxy) {
        setAccountProxy(input.accountId, input.proxy);
      }

      const job = createJob("bulk_message", {
        mode: input.mode,
        message: input.message,
        targets: input.targets,
        delaySeconds: input.delaySeconds,
        maxPerDay: input.maxPerDay,
        warmup: input.warmup,
        parseMode: input.parseMode,
        sessionString: input.sessionString,
        allAccounts: input.allAccounts,
        proxy: input.proxy,
      }, input.accountId);

      workerPool.enqueue({
        id: job.id,
        accountId: input.accountId,
        priority: input.priority,
        timeoutMs: 8 * 60 * 60 * 1000, // 8h max
        addedAt: Date.now(),
        fn: () => runBulkMessage(job),
      });

      return { jobId: job.id, status: "queued" };
    }),

  status: procedure
    .input(z.object({ jobId: z.string() }))
    .query(({ input }) => {
      const job = getJob(input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      return {
        jobId: job.id,
        status: job.status,
        progress: job.progress,
        total: job.total,
        sent: job.result?.added || 0,
        failed: job.result?.failed || 0,
        errors: job.result?.errors || [],
        error: job.error,
        completedAt: job.completedAt,
      };
    }),
});

// ─── Content Cloner Router ────────────────────────────────────────────────────

const contentClonerRouter = router({
  start: procedure
    .input(z.object({
      sourceGroup: z.string().min(1),
      destGroup: z.string().min(1),
      cloneMedia: z.boolean().default(true),
      clonePolls: z.boolean().default(false),
      delaySeconds: z.number().min(1).max(300).default(5),
      limit: z.number().min(1).max(5000).default(100),
      skipForwards: z.boolean().default(true),
      reverseOrder: z.boolean().default(true),
      accountId: z.string(),
      sessionString: z.string().optional(),
      proxy: ProxyConfigSchema,
      priority: z.enum(["low", "normal", "high"]).default("normal"),
    }))
    .mutation(async ({ input }) => {
      if (!input.sessionString) {
        const account = getAccount(input.accountId);
        if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      }

      if (input.proxy) {
        setAccountProxy(input.accountId, input.proxy);
      }

      const job = createJob("bulk_message", {
        sourceGroup: input.sourceGroup,
        destGroup: input.destGroup,
        cloneMedia: input.cloneMedia,
        clonePolls: input.clonePolls,
        delaySeconds: input.delaySeconds,
        limit: input.limit,
        skipForwards: input.skipForwards,
        reverseOrder: input.reverseOrder,
        sessionString: input.sessionString,
        proxy: input.proxy,
        _serviceType: "content_cloner",
      }, input.accountId);

      workerPool.enqueue({
        id: job.id,
        accountId: input.accountId,
        priority: input.priority,
        timeoutMs: 6 * 60 * 60 * 1000, // 6h max
        addedAt: Date.now(),
        fn: () => runContentCloner(job),
      });

      return { jobId: job.id, status: "queued" };
    }),

  status: procedure
    .input(z.object({ jobId: z.string() }))
    .query(({ input }) => {
      const job = getJob(input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      return {
        jobId: job.id,
        status: job.status,
        progress: job.progress,
        total: job.total,
        forwarded: job.result?.added || 0,
        failed: job.result?.failed || 0,
        errors: job.result?.errors || [],
        error: job.error,
        completedAt: job.completedAt,
      };
    }),
});

// ─── Proxy Router (server-side proxy cache management) ────────────────────────

const proxyRouter = router({
  setAccountProxy: procedure
    .input(z.object({
      accountId: z.string(),
      proxy: z.object({
        host: z.string().min(1),
        port: z.number().int().min(1).max(65535),
        type: z.enum(["socks5", "http", "mtproto"]),
        username: z.string().optional(),
        password: z.string().optional(),
        secret: z.string().optional(),
      }).nullable(),
    }))
    .mutation(({ input }) => {
      if (input.proxy) {
        setAccountProxy(input.accountId, input.proxy);
      } else {
        setAccountProxy(input.accountId, null);
      }
      return { success: true, accountId: input.accountId };
    }),
});

// ─── License Router (user-facing) ────────────────────────────────────────────
const licenseRouter = router({
  // Step 1 of onboarding — validate + bind phone + HWID on first use
  activate: publicProcedure
    .input(z.object({
      licenseKey: z.string().min(10),
      phone:      z.string().min(7),
      hwid:       z.string().min(4),
    }))
    .mutation(async ({ input }) => {
      const { activateLicense } = await import("./license-service.js");
      const result = await activateLicense({ licenseKey: input.licenseKey, phone: input.phone, hwid: input.hwid });
      if (!result.valid) throw new TRPCError({ code: "FORBIDDEN", message: result.error ?? "ترخيص غير صالح" });
      return result;
    }),

  // Called on every app startup — fast (60s in-memory cache)
  verify: publicProcedure
    .input(z.object({
      licenseKey: z.string().min(10),
      hwid:       z.string().min(4),
    }))
    .query(async ({ input }) => {
      const { verifyLicense } = await import("./license-service.js");
      const result = await verifyLicense({ licenseKey: input.licenseKey, hwid: input.hwid });
      if (!result.valid) throw new TRPCError({ code: "FORBIDDEN", message: result.error ?? "ترخيص غير صالح" });
      return result;
    }),

  // For displaying license info in app settings
  status: publicProcedure
    .input(z.object({ licenseKey: z.string(), hwid: z.string() }))
    .query(async ({ input }) => {
      const { verifyLicense } = await import("./license-service.js");
      return await verifyLicense({ licenseKey: input.licenseKey, hwid: input.hwid });
    }),
});

// ─── Admin Router (protected by ADMIN_SECRET_KEY env var) ────────────────────
const adminRouter = router({
  createLicense: procedure
    .input(z.object({
      phone:       z.string().min(7),
      days:        z.number().min(1).max(3650),
      tier:        z.enum(["basic", "pro", "enterprise"]).default("pro"),
      maxAccounts: z.number().min(1).max(100).default(5),
      notes:       z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { createLicense } = await import("./license-service.js");
      const expiresAt = new Date(Date.now() + input.days * 86_400_000);
      const license = await createLicense({
        phone: input.phone, expiresAt,
        tier: input.tier as any, maxAccounts: input.maxAccounts,
        notes: input.notes, createdBy: "admin",
      });
      logger.info({ phone: input.phone, licenseId: license.id }, "Admin created license");
      return license;
    }),

  listLicenses: procedure
    .input(z.object({
      status: z.enum(["pending","active","expired","revoked"]).optional(),
      phone:  z.string().optional(),
    }))
    .query(async ({ input }) => {
      const { listLicenses } = await import("./license-service.js");
      return await listLicenses({ status: input.status as any, phone: input.phone });
    }),

  revoke: procedure
    .input(z.object({ licenseKey: z.string(), reason: z.string().optional() }))
    .mutation(async ({ input }) => {
      const { revokeLicense } = await import("./license-service.js");
      const ok = await revokeLicense(input.licenseKey, input.reason);
      if (!ok) throw new TRPCError({ code: "NOT_FOUND", message: "License not found" });
      return { success: true };
    }),

  renew: procedure
    .input(z.object({ licenseKey: z.string(), days: z.number().min(1).max(3650) }))
    .mutation(async ({ input }) => {
      const { renewLicense } = await import("./license-service.js");
      const newExpiry = new Date(Date.now() + input.days * 86_400_000);
      const license = await renewLicense(input.licenseKey, newExpiry);
      if (!license) throw new TRPCError({ code: "NOT_FOUND", message: "License not found" });
      return license;
    }),

  logs: procedure
    .input(z.object({ licenseKey: z.string(), limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ input }) => {
      const { getLicenseLogs } = await import("./license-service.js");
      return await getLicenseLogs(input.licenseKey, input.limit);
    }),

  stats: procedure
    .query(async () => {
      const { listLicenses } = await import("./license-service.js");
      const [all, active, expired, revoked] = await Promise.all([
        listLicenses(), listLicenses({ status: "active" }),
        listLicenses({ status: "expired" }), listLicenses({ status: "revoked" }),
      ]);
      const expiringSoon = active.filter(l =>
        Math.ceil((new Date(l.expiresAt).getTime() - Date.now()) / 86400000) < 7
      );
      return { total: all.length, active: active.length, expired: expired.length, revoked: revoked.length, expiringSoon: expiringSoon.length };
    }),
});


// ─── Auto-Reply Router ────────────────────────────────────────────────────────
// In-memory rules store (keyed by accountId)
const autoReplyRulesStore = new Map<string, import("./auto-reply-service.js").AutoReplyRule[]>();

function getRules(accountId: string): import("./auto-reply-service.js").AutoReplyRule[] {
  return autoReplyRulesStore.get(accountId) ?? [];
}

const autoReplyRouter = router({
  list: procedure
    .input(z.object({ accountId: z.string() }))
    .query(({ input }) => {
      return { rules: getRules(input.accountId) };
    }),

  addRule: procedure
    .input(z.object({
      accountId: z.string(),
      trigger:   z.string().min(1),
      response:  z.string().min(1),
      matchType: z.enum(["contains", "exact", "startsWith"]).default("contains"),
    }))
    .mutation(({ input }) => {
      const rules = getRules(input.accountId);
      const rule = {
        id:        `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        trigger:   input.trigger,
        response:  input.response,
        matchType: input.matchType,
        enabled:   true,
      };
      autoReplyRulesStore.set(input.accountId, [...rules, rule]);
      return { rule };
    }),

  removeRule: procedure
    .input(z.object({ accountId: z.string(), ruleId: z.string() }))
    .mutation(({ input }) => {
      const rules = getRules(input.accountId).filter(r => r.id !== input.ruleId);
      autoReplyRulesStore.set(input.accountId, rules);
      return { success: true };
    }),

  toggleRule: procedure
    .input(z.object({ accountId: z.string(), ruleId: z.string() }))
    .mutation(({ input }) => {
      const rules = getRules(input.accountId).map(r =>
        r.id === input.ruleId ? { ...r, enabled: !r.enabled } : r
      );
      autoReplyRulesStore.set(input.accountId, rules);
      return { success: true };
    }),

  start: procedure
    .input(z.object({
      accountId:     z.string(),
      sessionString: z.string().optional(),
      limitDialogs:  z.number().min(1).max(100).default(10),
      limitMessages: z.number().min(1).max(100).default(20),
    }))
    .mutation(async ({ input }) => {
      const account = !input.sessionString ? getAccount(input.accountId) : null;
      const session = input.sessionString ?? account?.sessionString;
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Account session not found" });

      const rules = getRules(input.accountId);
      if (rules.length === 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لا توجد قواعد للرد التلقائي" });

      const { checkAndAutoReply } = await import("./auto-reply-service.js");
      const result = await checkAndAutoReply(session, rules, input.limitDialogs, input.limitMessages);
      return result;
    }),
});

// ─── Scheduler Router ─────────────────────────────────────────────────────────
const schedulerRouter = router({
  create: procedure
    .input(z.object({
      name:        z.string().min(1),
      taskType:    z.enum(["extraction", "add-members", "bulk-message"]),
      scheduledAt: z.number(), // Unix ms
      params:      z.record(z.unknown()).default({}),
    }))
    .mutation(({ input }) => {
      const job = createScheduledJob({
        name:        input.name,
        taskType:    input.taskType,
        scheduledAt: input.scheduledAt,
        params:      input.params,
      });
      return { job };
    }),

  list: procedure.query(() => {
    return { jobs: listScheduledJobs() };
  }),

  get: procedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      const job = getScheduledJob(input.id);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Scheduled job not found" });
      return { job };
    }),

  delete: procedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const deleted = deleteScheduledJob(input.id);
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Scheduled job not found" });
      return { success: true };
    }),

  updateStatus: procedure
    .input(z.object({
      id:     z.string(),
      status: z.enum(["pending", "running", "done", "failed"]),
      result: z.object({ success: z.boolean(), message: z.string() }).optional(),
    }))
    .mutation(({ input }) => {
      updateScheduledJobStatus(input.id, input.status, input.result);
      return { success: true };
    }),
});

// ─── Chatters Router ──────────────────────────────────────────────────────────
const chattersRouter = router({
  start: procedure
    .input(z.object({
      group:         z.string().min(1),
      limit:         z.number().min(1).max(50000).default(500),
      lastDays:      z.number().min(0).max(365).default(30),
      excludeBots:   z.boolean().default(true),
      accountId:     z.string(),
      sessionString: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!input.sessionString) {
        const account = getAccount(input.accountId);
        if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      }

      const job = createJob("extraction", {
        group:         input.group,
        limit:         input.limit,
        lastDays:      input.lastDays,
        excludeBots:   input.excludeBots,
        sessionString: input.sessionString,
        _chattersMode: true,
      }, input.accountId);

      workerPool.enqueue({
        id: job.id,
        accountId: input.accountId,
        priority: "normal",
        timeoutMs: 20 * 60 * 1000,
        addedAt: Date.now(),
        fn: () => runChatterExtraction(job).then(() => {}),
      });

      return { jobId: job.id, status: "queued" };
    }),

  status: procedure
    .input(z.object({ jobId: z.string() }))
    .query(({ input }) => {
      const job = getJob(input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      return {
        jobId: job.id, status: job.status,
        progress: job.progress, total: job.total,
        extracted: job.result?.extracted ?? 0,
        result: job.result,
        error: job.error,
      };
    }),
});

// ─── Contacts Filter Router ───────────────────────────────────────────────────
const contactsFilterRouter = router({
  start: procedure
    .input(z.object({
      phones:        z.array(z.string()).min(1),
      accountId:     z.string(),
      sessionString: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!input.sessionString) {
        const account = getAccount(input.accountId);
        if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      }

      const job = createJob("extraction", {
        phones:        input.phones,
        sessionString: input.sessionString,
        _contactsFilterMode: true,
      }, input.accountId);

      workerPool.enqueue({
        id: job.id,
        accountId: input.accountId,
        priority: "normal",
        timeoutMs: 15 * 60 * 1000,
        addedAt: Date.now(),
        fn: () => runContactsFilter(job).then(() => {}),
      });

      return { jobId: job.id, status: "queued" };
    }),

  status: procedure
    .input(z.object({ jobId: z.string() }))
    .query(({ input }) => {
      const job = getJob(input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      return {
        jobId: job.id, status: job.status,
        progress: job.progress, total: job.total,
        extracted: job.result?.extracted ?? 0,
        result: job.result,
        error: job.error,
      };
    }),
});

// ─── Group Manager Router ─────────────────────────────────────────────────────
const groupManagerRouter = router({
  join: procedure
    .input(z.object({
      groups:        z.array(z.string()).min(1),
      delaySeconds:  z.number().min(0).max(60).default(3),
      accountId:     z.string(),
      sessionString: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!input.sessionString) {
        const account = getAccount(input.accountId);
        if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      }
      const job = createJob("extraction", {
        groups:        input.groups,
        delaySeconds:  input.delaySeconds,
        sessionString: input.sessionString,
        _groupManagerMode: "join",
      }, input.accountId);
      workerPool.enqueue({
        id: job.id, accountId: input.accountId, priority: "normal",
        timeoutMs: 30 * 60 * 1000, addedAt: Date.now(),
        fn: () => runJoinGroups(job).then(() => {}),
      });
      return { jobId: job.id, status: "queued" };
    }),

  leave: procedure
    .input(z.object({
      groups:        z.array(z.string()).optional(),
      accountId:     z.string(),
      sessionString: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!input.sessionString) {
        const account = getAccount(input.accountId);
        if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      }
      const job = createJob("extraction", {
        groups:        input.groups ?? [],
        sessionString: input.sessionString,
        _groupManagerMode: "leave",
      }, input.accountId);
      workerPool.enqueue({
        id: job.id, accountId: input.accountId, priority: "normal",
        timeoutMs: 30 * 60 * 1000, addedAt: Date.now(),
        fn: () => runLeaveGroups(job).then(() => {}),
      });
      return { jobId: job.id, status: "queued" };
    }),

  sendToAll: procedure
    .input(z.object({
      message:       z.string().min(1),
      delaySeconds:  z.number().min(0).max(60).default(5),
      accountId:     z.string(),
      sessionString: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!input.sessionString) {
        const account = getAccount(input.accountId);
        if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      }
      const job = createJob("bulk_message", {
        message:       input.message,
        delaySeconds:  input.delaySeconds,
        sessionString: input.sessionString,
        _groupManagerMode: "sendToAll",
      }, input.accountId);
      workerPool.enqueue({
        id: job.id, accountId: input.accountId, priority: "normal",
        timeoutMs: 30 * 60 * 1000, addedAt: Date.now(),
        fn: () => runSendToJoined(job).then(() => {}),
      });
      return { jobId: job.id, status: "queued" };
    }),

  extractAdmins: procedure
    .input(z.object({
      group:         z.string().min(1),
      accountId:     z.string(),
      sessionString: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!input.sessionString) {
        const account = getAccount(input.accountId);
        if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      }
      const job = createJob("extraction", {
        group:         input.group,
        sessionString: input.sessionString,
        _groupManagerMode: "extractAdmins",
      }, input.accountId);
      workerPool.enqueue({
        id: job.id, accountId: input.accountId, priority: "normal",
        timeoutMs: 10 * 60 * 1000, addedAt: Date.now(),
        fn: () => runExtractAdmins(job).then(() => {}),
      });
      return { jobId: job.id, status: "queued" };
    }),

  status: procedure
    .input(z.object({ jobId: z.string() }))
    .query(({ input }) => {
      const job = getJob(input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      return {
        jobId: job.id, status: job.status,
        progress: job.progress, total: job.total,
        result: job.result,
        error: job.error,
      };
    }),

  listJoined: procedure
    .input(z.object({ accountId: z.string(), sessionString: z.string().optional() }))
    .query(async ({ input }) => {
      const account = !input.sessionString ? getAccount(input.accountId) : null;
      const session = input.sessionString ?? account?.sessionString;
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Account session not found" });
      const groups = await listJoinedGroups(session, input.accountId);
      return { groups };
    }),
});

// ─── API Credentials Router ───────────────────────────────────────────────────
const apiCredentialsRouter = router({
  requestOtp: procedure
    .input(z.object({ phone: z.string().min(7) }))
    .mutation(async ({ input }) => {
      const { requestApiOtp } = await import("./api-credentials-service.js");
      return await requestApiOtp(input.phone);
    }),

  confirmOtp: procedure
    .input(z.object({ sessionId: z.string(), otp: z.string().min(4) }))
    .mutation(async ({ input }) => {
      const { confirmApiOtpAndGetCredentials } = await import("./api-credentials-service.js");
      return await confirmApiOtpAndGetCredentials(input.sessionId, input.otp);
    }),

  setForAccount: procedure
    .input(z.object({
      accountId: z.string(),
      apiId:     z.number(),
      apiHash:   z.string().min(10),
    }))
    .mutation(async ({ input }) => {
      await setAccountApiCredentials(input.accountId, input.apiId, input.apiHash);
      return { success: true };
    }),
});

export const appRouter = router({
  auth:           authRouter,
  accounts:       accountsRouter,
  extraction:     extractionRouter,
  addMembers:     addMembersRouter,
  bulkMessage:    bulkMessageRouter,
  contentCloner:  contentClonerRouter,
  proxy:          proxyRouter,
  membersFiles:   membersFilesRouter,
  jobs:           jobsRouter,
  stats:          statsRouter,
  license:        licenseRouter,
  admin:          adminRouter,
  system:         systemRouter,
  autoReply:      autoReplyRouter,
  scheduler:      schedulerRouter,
  chatters:       chattersRouter,
  contactsFilter: contactsFilterRouter,
  groupManager:   groupManagerRouter,
  apiCredentials: apiCredentialsRouter,
});

export type AppRouter = typeof appRouter;
