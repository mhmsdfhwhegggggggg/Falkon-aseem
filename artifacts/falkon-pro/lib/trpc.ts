import { createTRPCReact, type CreateTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/routers";

export const trpc: CreateTRPCReact<AppRouter, any> = createTRPCReact<AppRouter>();

export function getApiBaseUrl(): string {
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
  if (apiBaseUrl) {
    return apiBaseUrl.replace(/\/$/, "");
  }

  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    const apiHostname = hostname.replace(/^8081-/, "3000-").replace(/^25769-/, "3000-");
    if (apiHostname !== hostname) {
      return `${protocol}//${apiHostname}`;
    }
  }

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
            const token = await getSessionToken();
            const hwid = await getHardwareId();
            return {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              "x-hwid": hwid,
            };
          } catch {
            return {};
          }
        },
        fetch(url, options) {
          return fetch(url, {
            ...options,
            credentials: "include",
          });
        },
      }),
    ],
  });
}

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const SESSION_TOKEN_KEY = "app_session_token";

async function getSessionToken(): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      return typeof window !== "undefined" ? window.localStorage.getItem(SESSION_TOKEN_KEY) : null;
    }
    return await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

const HWID_KEY = "device_hwid";

async function getHardwareId(): Promise<string> {
  try {
    let hwid = null;
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
