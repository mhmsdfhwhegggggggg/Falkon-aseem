import { trpc } from '@/lib/trpc';

export function useActiveAccount() {
  const { data } = trpc.accounts.list.useQuery();
  const accounts = data?.accounts ?? [];
  const active = accounts.find((a: any) => a.isActive) ?? accounts[0];
  return active ?? null;
}
