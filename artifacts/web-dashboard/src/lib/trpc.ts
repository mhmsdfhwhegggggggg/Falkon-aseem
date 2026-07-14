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
      // No custom headers — the backend uses adminSecret inside the tRPC input body,
      // not an Authorization header. Sending non-ASCII values in headers causes
      // "String contains non ISO-8859-1 code point" fetch errors.
    }),
  ],
});
