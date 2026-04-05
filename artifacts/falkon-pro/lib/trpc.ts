import { createTRPCReact, type CreateTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../server/routers";

export const trpc: CreateTRPCReact<AppRouter, any> = createTRPCReact<AppRouter>();

export function getApiBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
  if (explicit) return explicit.replace(/\/$/, "");

  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}`;
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
            const hwid = await getHardwareId();
            return { "x-hwid": hwid };
          } catch {
            return {};
          }
        },
        fetch(url, options) {
          return fetch(url, { ...options, credentials: "include" });
        },
      }),
    ],
  });
}

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

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
