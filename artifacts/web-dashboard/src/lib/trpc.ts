import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { QueryClient } from '@tanstack/react-query';

export const trpc = createTRPCReact<any>();

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 30, retry: 1 },
  },
});

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: '/api/trpc',
      transformer: superjson,
      headers: () => {
        const token = localStorage.getItem('falkon_admin_token');
        return token ? { authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});
