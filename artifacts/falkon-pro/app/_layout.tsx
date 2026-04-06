import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/lib/theme-provider";
import { trpc, createTRPCClient } from "@/lib/trpc";
import { WindowManagerProvider } from "@/lib/window-manager";
import { MembersStoreProvider } from "@/lib/members-store";
import { AccountsStoreProvider } from "@/lib/accounts-store";
import { TaskRunnerProvider } from "@/lib/task-runner";
import { DevAuthProvider } from "@/lib/dev-auth";

import "@/global.css";

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="license-activation" options={{ headerShown: false, presentation: "fullScreenModal" }} />
      <Stack.Screen name="extraction" options={{ headerShown: false }} />
      <Stack.Screen name="extract-and-add" options={{ headerShown: false }} />
      <Stack.Screen name="add-members" options={{ headerShown: false }} />
      <Stack.Screen name="members-file" options={{ headerShown: false }} />
      <Stack.Screen name="members-files" options={{ headerShown: false }} />
      <Stack.Screen name="bulk-ops" options={{ headerShown: false }} />
      <Stack.Screen name="auto-reply" options={{ headerShown: false }} />
      <Stack.Screen name="proxies" options={{ headerShown: false }} />
      <Stack.Screen name="stats" options={{ headerShown: false }} />
      <Stack.Screen name="channel-management" options={{ headerShown: false }} />
      <Stack.Screen name="content-cloner" options={{ headerShown: false }} />
      <Stack.Screen name="scheduler" options={{ headerShown: false }} />
      <Stack.Screen name="windows" options={{ headerShown: false }} />
      <Stack.Screen name="tasks-monitor" options={{ headerShown: false }} />
      <Stack.Screen name="license-dashboard" options={{ headerShown: false }} />
      <Stack.Screen name="developer-dashboard" options={{ headerShown: false }} />
      <Stack.Screen name="account-health" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30000, retry: 2 },
    },
  }));

  const trpcClient = useMemo(() => createTRPCClient(), []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider>
              <DevAuthProvider>
                <AccountsStoreProvider>
                <MembersStoreProvider>
                  <TaskRunnerProvider>
                    <WindowManagerProvider>
                      <GestureHandlerRootView style={{ flex: 1 }}>
                        <KeyboardProvider>
                          <RootLayoutNav />
                        </KeyboardProvider>
                      </GestureHandlerRootView>
                    </WindowManagerProvider>
                  </TaskRunnerProvider>
                </MembersStoreProvider>
                </AccountsStoreProvider>
              </DevAuthProvider>
            </ThemeProvider>
          </QueryClientProvider>
        </trpc.Provider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
