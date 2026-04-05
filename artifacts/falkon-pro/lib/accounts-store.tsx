/**
 * ACCOUNTS STORE — Phone-Side Session Management
 * ================================================
 * All account data (sessions included) is stored on the device.
 * - Account metadata     → AsyncStorage (non-sensitive display info)
 * - Session strings      → SecureStore (native) / AsyncStorage (web fallback)
 *
 * The server NEVER permanently stores session strings.
 * Sessions are sent per-request and used in-memory only.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StoredAccount {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  username: string;
  userId: string;
  addedAt: string;
  isActive: boolean;
  dailyAdded: number;
  lastReset: string;
}

interface AccountsState {
  accounts: StoredAccount[];
  isLoading: boolean;
}

type AccountsAction =
  | { type: 'SET_ACCOUNTS'; accounts: StoredAccount[] }
  | { type: 'UPSERT_ACCOUNT'; account: StoredAccount }
  | { type: 'REMOVE_ACCOUNT'; id: string }
  | { type: 'UPDATE_ACCOUNT'; id: string; updates: Partial<StoredAccount> }
  | { type: 'SET_LOADING'; loading: boolean };

function accountsReducer(state: AccountsState, action: AccountsAction): AccountsState {
  switch (action.type) {
    case 'SET_ACCOUNTS':
      return { ...state, accounts: action.accounts, isLoading: false };
    case 'UPSERT_ACCOUNT': {
      const exists = state.accounts.findIndex((a) => a.id === action.account.id);
      const accounts =
        exists >= 0
          ? state.accounts.map((a) => (a.id === action.account.id ? action.account : a))
          : [action.account, ...state.accounts];
      return { ...state, accounts };
    }
    case 'REMOVE_ACCOUNT':
      return { ...state, accounts: state.accounts.filter((a) => a.id !== action.id) };
    case 'UPDATE_ACCOUNT':
      return {
        ...state,
        accounts: state.accounts.map((a) =>
          a.id === action.id ? { ...a, ...action.updates } : a
        ),
      };
    case 'SET_LOADING':
      return { ...state, isLoading: action.loading };
    default:
      return state;
  }
}

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const ACCOUNTS_META_KEY = '@falkon_pro_accounts_meta';
const sessionKey = (id: string) => `@falkon_session_${id}`;

// ─── Secure storage helpers (cross-platform) ──────────────────────────────────

async function saveSession(accountId: string, sessionString: string): Promise<void> {
  const key = sessionKey(accountId);
  if (Platform.OS !== 'web') {
    await SecureStore.setItemAsync(key, sessionString);
  } else {
    await AsyncStorage.setItem(key, sessionString);
  }
}

async function loadSession(accountId: string): Promise<string | null> {
  const key = sessionKey(accountId);
  if (Platform.OS !== 'web') {
    return SecureStore.getItemAsync(key);
  } else {
    return AsyncStorage.getItem(key);
  }
}

async function deleteSession(accountId: string): Promise<void> {
  const key = sessionKey(accountId);
  if (Platform.OS !== 'web') {
    await SecureStore.deleteItemAsync(key);
  } else {
    await AsyncStorage.removeItem(key);
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface AccountsContextValue {
  accounts: StoredAccount[];
  isLoading: boolean;
  activeAccounts: StoredAccount[];
  totalAccounts: number;

  addAccount: (account: StoredAccount, sessionString: string) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;
  setActive: (id: string, isActive: boolean) => Promise<void>;
  updateDailyAdded: (id: string, delta: number) => Promise<void>;
  getSession: (id: string) => Promise<string | null>;
  getAccount: (id: string) => StoredAccount | undefined;
}

const AccountsContext = createContext<AccountsContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AccountsStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(accountsReducer, {
    accounts: [],
    isLoading: true,
  });

  // Load on mount
  useEffect(() => {
    AsyncStorage.getItem(ACCOUNTS_META_KEY)
      .then((raw) => {
        if (raw) {
          const accounts = JSON.parse(raw) as StoredAccount[];
          dispatch({ type: 'SET_ACCOUNTS', accounts });
        } else {
          dispatch({ type: 'SET_LOADING', loading: false });
        }
      })
      .catch(() => dispatch({ type: 'SET_LOADING', loading: false }));
  }, []);

  const persistMeta = useCallback(async (accounts: StoredAccount[]) => {
    await AsyncStorage.setItem(ACCOUNTS_META_KEY, JSON.stringify(accounts));
  }, []);

  const addAccount = useCallback(
    async (account: StoredAccount, sessionString: string) => {
      // 1. Save session string securely
      await saveSession(account.id, sessionString);

      // 2. Save metadata (no sessionString)
      dispatch({ type: 'UPSERT_ACCOUNT', account });
      const exists = state.accounts.findIndex((a) => a.id === account.id);
      const next =
        exists >= 0
          ? state.accounts.map((a) => (a.id === account.id ? account : a))
          : [account, ...state.accounts];
      await persistMeta(next);
    },
    [state.accounts, persistMeta]
  );

  const removeAccount = useCallback(
    async (id: string) => {
      await deleteSession(id);
      dispatch({ type: 'REMOVE_ACCOUNT', id });
      const next = state.accounts.filter((a) => a.id !== id);
      await persistMeta(next);
    },
    [state.accounts, persistMeta]
  );

  const setActive = useCallback(
    async (id: string, isActive: boolean) => {
      dispatch({ type: 'UPDATE_ACCOUNT', id, updates: { isActive } });
      const next = state.accounts.map((a) => (a.id === id ? { ...a, isActive } : a));
      await persistMeta(next);
    },
    [state.accounts, persistMeta]
  );

  const updateDailyAdded = useCallback(
    async (id: string, delta: number) => {
      const today = new Date().toISOString().split('T')[0]!;
      const account = state.accounts.find((a) => a.id === id);
      if (!account) return;

      const base = account.lastReset === today ? account.dailyAdded : 0;
      const dailyAdded = Math.max(0, base + delta);
      dispatch({ type: 'UPDATE_ACCOUNT', id, updates: { dailyAdded, lastReset: today } });
      const next = state.accounts.map((a) =>
        a.id === id ? { ...a, dailyAdded, lastReset: today } : a
      );
      await persistMeta(next);
    },
    [state.accounts, persistMeta]
  );

  const getSession = useCallback((id: string) => loadSession(id), []);

  const getAccount = useCallback(
    (id: string) => state.accounts.find((a) => a.id === id),
    [state.accounts]
  );

  const activeAccounts = useMemo(
    () => state.accounts.filter((a) => a.isActive),
    [state.accounts]
  );

  const value: AccountsContextValue = useMemo(
    () => ({
      accounts: state.accounts,
      isLoading: state.isLoading,
      activeAccounts,
      totalAccounts: state.accounts.length,
      addAccount,
      removeAccount,
      setActive,
      updateDailyAdded,
      getSession,
      getAccount,
    }),
    [state, activeAccounts, addAccount, removeAccount, setActive, updateDailyAdded, getSession, getAccount]
  );

  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>;
}

export function useAccountsStore(): AccountsContextValue {
  const ctx = useContext(AccountsContext);
  if (!ctx) throw new Error('useAccountsStore must be used within AccountsStoreProvider');
  return ctx;
}
