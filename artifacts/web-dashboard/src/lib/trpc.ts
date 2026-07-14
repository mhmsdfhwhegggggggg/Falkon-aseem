import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { QueryClient } from '@tanstack/react-query';
import { getAuthToken, logout } from './auth';
import type { AppRouter } from '../../../api-server/src/telegram/trpc-router';

export const trpc = createTRPCReact<AppRouter>();

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://85.155.190.130').replace(/\/$/, '');

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry(failureCount, error: any) {
        if (error?.data?.code === 'UNAUTHORIZED') {
          logout();
          return false;
        }
        return failureCount < 1;
      },
    },
    mutations: {
      retry: false,
      onError(error: any) {
        if (error?.data?.code === 'UNAUTHORIZED') logout();
      },
    },
  },
});

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${API_BASE_URL}/api/trpc`,
      transformer: superjson,
      headers() {
        const token = getAuthToken();
        return token ? { authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});
