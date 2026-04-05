import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";

const t = initTRPC.create({ transformer: superjson });
export const router = t.router;
export const publicProcedure = t.procedure;

const accountsRouter = router({
  list: publicProcedure.query((): {
    accounts: Array<{
      id: string; phone: string; firstName: string; lastName: string;
      username: string; userId: string; addedAt: string; isActive: boolean;
      dailyAdded: number; lastReset: string;
    }>
  } => ({ accounts: [] })),

  startAuth: publicProcedure
    .input(z.object({ phone: z.string().min(7) }))
    .mutation(async ({ input }): Promise<{ phoneCodeHash: string; sessionId: string }> => {
      const res = await fetch(`/api/trpc/accounts.startAuth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: input }),
      });
      const data = await res.json();
      return data.result.data.json;
    }),

  confirmAuth: publicProcedure
    .input(z.object({ sessionId: z.string(), code: z.string().min(4), password: z.string().optional() }))
    .mutation(async (): Promise<{
      success: boolean; accountId: string; phone: string; firstName: string;
      lastName: string; username: string; userId: string;
    }> => ({ success: true, accountId: '', phone: '', firstName: '', lastName: '', username: '', userId: '' })),

  resendCode: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async (): Promise<{ success: boolean }> => ({ success: true })),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async (): Promise<{ success: boolean }> => ({ success: true })),

  setActive: publicProcedure
    .input(z.object({ id: z.string(), isActive: z.boolean() }))
    .mutation(async (): Promise<{ success: boolean }> => ({ success: true })),
});

const extractionRouter = router({
  start: publicProcedure
    .input(z.object({
      group: z.string(), limit: z.number().optional(), filterActive: z.boolean().optional(),
      excludeBots: z.boolean().optional(), mode: z.enum(["members", "admins", "subscribers", "contacts"]).optional(),
      accountId: z.string(),
    }))
    .mutation(async (): Promise<{ jobId: string; status: string }> => ({ jobId: '', status: 'queued' })),

  status: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async (): Promise<{
      jobId: string; status: string; progress: number; total: number;
      extracted: number; error?: string; savedFileId?: string; completedAt?: string;
    }> => ({ jobId: '', status: 'pending', progress: 0, total: 0, extracted: 0 })),
});

const addMembersRouter = router({
  start: publicProcedure
    .input(z.object({
      targetGroup: z.string(), mode: z.enum(["from-file", "by-username", "by-id"]),
      fileId: z.string().optional(), usernames: z.array(z.string()).optional(),
      userIds: z.array(z.string()).optional(), delaySeconds: z.number().optional(),
      maxPerDay: z.number().optional(), accountId: z.string(),
    }))
    .mutation(async (): Promise<{ jobId: string; status: string }> => ({ jobId: '', status: 'queued' })),

  status: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async (): Promise<{
      jobId: string; status: string; progress: number; total: number;
      added: number; failed: number; errors: string[]; error?: string; completedAt?: string;
    }> => ({ jobId: '', status: 'pending', progress: 0, total: 0, added: 0, failed: 0, errors: [] })),
});

const membersFilesRouter = router({
  list: publicProcedure.query((): {
    files: Array<{
      id: string; name: string; sourceGroup: string; createdAt: string;
      memberCount: number; addedCount: number;
    }>
  } => ({ files: [] })),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query((): any => null),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation((): { success: boolean } => ({ success: true })),
});

const jobsRouter = router({
  list: publicProcedure
    .input(z.object({
      type: z.enum(["extraction", "add_members", "bulk_message", "extract_and_add"]).optional(),
      status: z.enum(["queued", "running", "completed", "failed", "cancelled"]).optional(),
      limit: z.number().optional(),
    }).optional())
    .query((): {
      jobs: Array<{
        id: string; type: string; status: string; progress: number; total: number;
        createdAt: string; result?: any; error?: string; savedFileId?: string;
      }>
    } => ({ jobs: [] })),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query((): any => null),

  cancel: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation((): { success: boolean } => ({ success: true })),
});

const statsRouter = router({
  overview: publicProcedure
    .input(z.object({ period: z.enum(["today", "week", "month", "all"]).optional() }))
    .query((): {
      extracted: number; added: number; messagesSent: number;
      tasksCompleted: number; errors: number; activeAccounts: number; totalFiles: number;
    } => ({ extracted: 0, added: 0, messagesSent: 0, tasksCompleted: 0, errors: 0, activeAccounts: 0, totalFiles: 0 })),
});

const licenseRouter = router({
  activate: publicProcedure
    .input(z.object({ key: z.string(), hwid: z.string().optional() }))
    .mutation((): { success: boolean; tier?: string; error?: string } => ({ success: true, tier: 'professional' })),
  validate: publicProcedure
    .input(z.object({ hwid: z.string() }))
    .query((): { valid: boolean; tier: string } => ({ valid: true, tier: 'professional' })),
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
