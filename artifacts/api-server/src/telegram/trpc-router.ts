import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import { loadAccounts, removeAccount, getAccount } from "./session-store.js";
import { startPhoneAuth, confirmPhoneCode, resendCode } from "./auth-service.js";
import { createJob, getJob, loadJobs, updateJob } from "./jobs.js";
import { runExtraction } from "./extraction-service.js";
import { runAddMembers } from "./add-members-service.js";
import { loadMembersIndex, loadMembersFile, deleteMembersFile } from "./members-files.js";
import { logger } from "../lib/logger.js";

const t = initTRPC.create({ transformer: superjson });
export const router = t.router;
export const procedure = t.procedure;

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
      const { sessionString: _s, ...safe } = result;
      return safe;
    }),

  resendCode: procedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input }) => {
      await resendCode(input.sessionId);
      return { success: true };
    }),

  remove: procedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      removeAccount(input.id);
      return { success: true };
    }),

  setActive: procedure
    .input(z.object({ id: z.string(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      const accounts = loadAccounts();
      const acc = accounts.find((a) => a.id === input.id);
      if (!acc) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
      const { upsertAccount } = await import("./session-store.js");
      upsertAccount({ ...acc, isActive: input.isActive });
      return { success: true };
    }),
});

const extractionRouter = router({
  start: procedure
    .input(z.object({
      group: z.string().min(1),
      limit: z.number().min(1).max(10000).default(500),
      filterActive: z.boolean().default(false),
      excludeBots: z.boolean().default(true),
      mode: z.enum(["members", "admins", "subscribers", "contacts"]).default("members"),
      accountId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const account = getAccount(input.accountId);
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });

      const job = createJob("extraction", {
        group: input.group,
        limit: input.limit,
        filterActive: input.filterActive,
        excludeBots: input.excludeBots,
        mode: input.mode,
      }, input.accountId);

      runExtraction(job).catch((err) => {
        logger.error({ jobId: job.id, err }, "Extraction job failed");
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
        savedFileId: job.savedFileId,
        completedAt: job.completedAt,
      };
    }),
});

const addMembersRouter = router({
  start: procedure
    .input(z.object({
      targetGroup: z.string().min(1),
      mode: z.enum(["from-file", "by-username", "by-id"]),
      fileId: z.string().optional(),
      usernames: z.array(z.string()).optional(),
      userIds: z.array(z.string()).optional(),
      delaySeconds: z.number().min(5).max(300).default(30),
      maxPerDay: z.number().min(1).max(200).default(40),
      accountId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const account = getAccount(input.accountId);
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });

      const job = createJob("add_members", {
        targetGroup: input.targetGroup,
        mode: input.mode,
        fileId: input.fileId,
        usernames: input.usernames,
        userIds: input.userIds,
        delaySeconds: input.delaySeconds,
        maxPerDay: input.maxPerDay,
      }, input.accountId);

      runAddMembers(job).catch((err) => {
        logger.error({ jobId: job.id, err }, "Add-members job failed");
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
        added: job.result?.added || 0,
        failed: job.result?.failed || 0,
        errors: job.result?.errors || [],
        error: job.error,
        completedAt: job.completedAt,
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

const licenseRouter = router({
  activate: procedure
    .input(z.object({ key: z.string(), hwid: z.string().optional() }))
    .mutation(async ({ input }) => {
      const key = input.key.toUpperCase().trim();
      const validPattern = /^FLK-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
      if (!validPattern.test(key)) {
        return { success: false, error: "Invalid license key format" };
      }
      return { success: true, tier: "professional", expiresAt: null, key };
    }),

  validate: procedure
    .input(z.object({ hwid: z.string() }))
    .query(() => {
      return { valid: true, tier: "professional" };
    }),
});

export const appRouter = router({
  accounts: accountsRouter,
  extraction: extractionRouter,
  addMembers: addMembersRouter,
  membersFiles: membersFilesRouter,
  jobs: jobsRouter,
  stats: statsRouter,
  license: licenseRouter,
});

export type AppRouter = typeof appRouter;
