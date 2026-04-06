# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## FALKON PRO — Expo Mobile App

Located at `artifacts/falkon-pro/`. Production-ready Telegram management system.

### Architecture
- **Framework**: Expo Router v6 + React Native 0.81
- **Styling**: NativeWind v4 (TailwindCSS for RN)
- **State**: React Query + tRPC
- **Auth/Sessions**: expo-secure-store
- **Theme**: Dark mode default (#030712 bg, #8B5CF6 primary violet)

### Screens & Routes
- `app/(tabs)/index.tsx` — Dashboard (stats, quick access, activity)
- `app/(tabs)/accounts.tsx` — Telegram account management
- `app/(tabs)/tasks.tsx` — Task launcher (extraction, bulk ops, etc.)
- `app/(tabs)/tools.tsx` — All tools categorized
- `app/(tabs)/settings.tsx` — App settings, theme toggle
- `app/extraction.tsx` — Member extraction task
- `app/extract-and-add.tsx` — Extract + add members
- `app/bulk-ops.tsx` — Bulk messaging
- `app/auto-reply.tsx` — Auto-reply rule manager
- `app/proxies.tsx` — Proxy pool manager
- `app/stats.tsx` — Performance analytics
- `app/channel-management.tsx` — Channel/group management
- `app/content-cloner.tsx` — Content forwarding
- `app/scheduler.tsx` — Task scheduling
- `app/windows.tsx` — Multi-window manager (Windows-like parallel instances)
- `app/license-activation.tsx` — License key activation
- `app/license-dashboard.tsx` — License info
- `app/developer-dashboard.tsx` — Dev tools, API test, logs

### Key Libraries
- `lib/members-store.tsx` — Central persistent store (AsyncStorage) for member files: CRUD, status tracking per-member, export, import from text
- `lib/task-runner.tsx` — Real-time task context with per-task logs, progress, succeeded/failed/skipped stats, output file linking
- `lib/window-manager.tsx` — Multi-instance window state (Context API)
- `lib/trpc.ts` — tRPC client with bearer token + HWID headers
- `lib/theme-provider.tsx` — Dark/light theme with NativeWind CSS vars
- `lib/theme.ts` — Color token definitions
- `server/routers.ts` — tRPC router stubs (all endpoints)

### Full Integration Pipeline
1. **Extraction** → extracts members from group/channel → auto-saves to named MembersFile
2. **Members Files browser** (`/members-files`) → lists all saved files with stats (total/added/pending/%)
3. **Members File viewer** (`/members-file`) → view all members in a file, filter by status, add from file button
4. **Add Members** (`/add-members`) — 3 modes:
   - **From File** — pick a saved extraction file, add pending members
   - **By @Username** — paste list of usernames (one per line)
   - **By User ID** — paste list of numeric Telegram IDs
5. **Extract & Add** (`/extract-and-add`) — sequential pipeline: extract → auto-save → add
6. **Task Monitor** (`/tasks-monitor`) — live view of all running/completed tasks with logs and output file links
7. **Dashboard** — shows live counts: files, members, running tasks, members added; quick-add buttons

### Multi-Window Feature
Windows screen (`/windows`) allows creating and managing multiple independent task instances simultaneously.

**Architecture (`lib/window-manager.tsx`):**
- Each `AppWindow` has a `status` (`configuring|running|paused|completed|error|cancelled`), `jobId` (server job link), per-window `logs[]` (last 50), and per-window `stats` (extracted/added/failed/total)
- `createWindow(config, title)` — creates window in `configuring` state (no server job yet)
- `startWindow(id)` — fetches session from SecureStore, submits real job to server (`extraction.start` or `addMembers.start` mutation), then starts 2s polling loop
- `pauseWindow` — stops polling (server job continues); `resumeWindow` — restarts polling
- All async callbacks use `windowsRef` to avoid stale closure issues
- Polling uses `utils.extraction.status.fetch` / `utils.addMembers.status.fetch` with `staleTime: 0`

**UI (`app/windows.tsx`):**
- macOS-style window cards: traffic light buttons, title, status badge
- Animated gradient progress bar with shimmer effect (running state)
- Stats grid: extracted / added / failed / total
- Expandable log viewer (tap to show last 8 entries)
- Elapsed time ticker (live counter while running)
- "New Window" bottom sheet: task type selection → config form with account picker, group inputs, limit presets, warmup toggle
- Gold gradient buttons throughout; full Arabic RTL UI
