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
- `lib/window-manager.tsx` — Multi-instance window state (Context API)
- `lib/trpc.ts` — tRPC client with bearer token + HWID headers
- `lib/theme-provider.tsx` — Dark/light theme with NativeWind CSS vars
- `lib/theme.ts` — Color token definitions
- `server/routers.ts` — tRPC router stubs (all endpoints)

### Multi-Window Feature
Windows screen (`/windows`) allows creating and managing multiple independent task instances simultaneously — each with its own title bar (macOS window chrome style), progress tracking, pause/resume/close controls.
