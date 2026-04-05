import { createTRPCReact, type CreateTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../server/routers";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export const trpc: CreateTRPCReact<AppRouter, any> = createTRPCReact<AppRouter>();

/**
 * Returns the API base URL:
 * 1. EXPO_PUBLIC_API_BASE_URL  ← set this in eas.json / .env for production APK
 * 2. Web (browser): uses window.location (same-origin proxy during dev)
 * 3. Native dev: Replit domain via EXPO_PUBLIC_DOMAIN
 * 4. Fallback: empty string (will fail loudly rather than silently)
 */
export function getApiBaseUrl(): string {
  // 1. Explicit env var — always wins (production APK must set this)
  const explicit = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
  if (explicit) return explicit.replace(/\/$/, "");

  // 2. Web browser — same-origin proxy works
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}`;
  }

  // 3. Native development on Replit — use the dev domain
  const replDomain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
  if (replDomain) {
    return `https://${replDomain}`;
  }

  // 4. Nothing found — return empty so tRPC errors are visible
  console.warn("[FALKON] EXPO_PUBLIC_API_BASE_URL is not set. API calls will fail.");
  return "";
}

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${getApiBaseUrl()}/api/trpc`,
        transformer: superjson,
        async headers() {
          try {
            const hwid = await getHardwareId();
            return { "x-hwid": hwid };
          } catch {
            return {};
          }
        },
        fetch(url, options) {
          // On native we don't send credentials (no cookies), the session
          // string is passed in the tRPC payload instead.
          const fetchOptions = Platform.OS === "web"
            ? { ...options, credentials: "include" as RequestCredentials }
            : options;
          return fetch(url, fetchOptions);
        },
      }),
    ],
  });
}

const HWID_KEY = "device_hwid";

export async function getHardwareId(): Promise<string> {
  try {
    let hwid: string | null = null;
    if (Platform.OS !== "web") {
      hwid = await SecureStore.getItemAsync(HWID_KEY);
    } else if (typeof window !== "undefined") {
      hwid = localStorage.getItem(HWID_KEY);
    }
    if (hwid) return hwid;
    const newHwid = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    if (Platform.OS !== "web") {
      await SecureStore.setItemAsync(HWID_KEY, newHwid);
    } else if (typeof window !== "undefined") {
      localStorage.setItem(HWID_KEY, newHwid);
    }
    return newHwid;
  } catch {
    return `fallback-${Math.random().toString(36).substr(2, 8)}`;
  }
}
