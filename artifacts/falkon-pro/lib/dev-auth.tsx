/**
 * Developer Authentication — Secure PIN gate for developer-only screens.
 * PIN is hashed (FNV-1a) before storage. Never stored in plaintext.
 * Auto-lock after LOCK_AFTER_MS of inactivity. Max 3 failed attempts → 5 min lockout.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import * as SecureStore from 'expo-secure-store';

const STORE_KEY_HASH = '@falkon_dev_pin_hash';
const STORE_KEY_ATTEMPTS = '@falkon_dev_attempts';
const STORE_KEY_LOCKOUT = '@falkon_dev_lockout';
const LOCK_AFTER_MS = 5 * 60 * 1000; // 5 minutes inactivity
const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes lockout

/** FNV-1a 32-bit hash — fast, good distribution */
function fnv1a(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  // Salt so it's not a known preimage
  const salted = (hash ^ 0xAB3D5F91) >>> 0;
  return salted.toString(16).padStart(8, '0');
}

interface DevAuthState {
  isAuthenticated: boolean;
  isPinSet: boolean;
  attemptsLeft: number;
  lockedUntil: number | null;
  isLoading: boolean;
}

interface DevAuthContextValue extends DevAuthState {
  login: (pin: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  setPin: (oldPin: string | null, newPin: string) => Promise<{ success: boolean; error?: string }>;
  resetActivity: () => void;
  lockNow: () => void;
}

const DevAuthContext = createContext<DevAuthContextValue | null>(null);

export function DevAuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DevAuthState>({
    isAuthenticated: false,
    isPinSet: false,
    attemptsLeft: MAX_ATTEMPTS,
    lockedUntil: null,
    isLoading: true,
  });
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const scheduleAutoLock = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      setState((prev) => ({ ...prev, isAuthenticated: false }));
    }, LOCK_AFTER_MS);
  }, []);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (state.isAuthenticated) scheduleAutoLock();
  }, [state.isAuthenticated, scheduleAutoLock]);

  useEffect(() => {
    async function init() {
      const [hash, attStr, lockStr] = await Promise.all([
        SecureStore.getItemAsync(STORE_KEY_HASH).catch(() => null),
        SecureStore.getItemAsync(STORE_KEY_ATTEMPTS).catch(() => null),
        SecureStore.getItemAsync(STORE_KEY_LOCKOUT).catch(() => null),
      ]);
      const lockedUntil = lockStr ? parseInt(lockStr, 10) : null;
      const attemptsLeft = attStr ? parseInt(attStr, 10) : MAX_ATTEMPTS;
      const now = Date.now();
      // Clear expired lockout
      const activeLock = lockedUntil && lockedUntil > now ? lockedUntil : null;
      if (lockedUntil && !activeLock) {
        await SecureStore.deleteItemAsync(STORE_KEY_LOCKOUT).catch(() => {});
        await SecureStore.setItemAsync(STORE_KEY_ATTEMPTS, String(MAX_ATTEMPTS)).catch(() => {});
      }
      setState({
        isAuthenticated: false,
        isPinSet: !!hash,
        attemptsLeft: activeLock ? attemptsLeft : MAX_ATTEMPTS,
        lockedUntil: activeLock,
        isLoading: false,
      });
    }
    init();
    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, []);

  const login = useCallback(async (pin: string): Promise<{ success: boolean; error?: string }> => {
    if (!pin || pin.trim().length < 4) {
      return { success: false, error: 'PIN must be at least 4 characters' };
    }
    const now = Date.now();
    if (state.lockedUntil && state.lockedUntil > now) {
      const rem = Math.ceil((state.lockedUntil - now) / 1000);
      return { success: false, error: `Account locked. Try again in ${rem}s` };
    }
    const storedHash = await SecureStore.getItemAsync(STORE_KEY_HASH).catch(() => null);
    if (!storedHash) {
      return { success: false, error: 'No PIN configured. Set a PIN first.' };
    }
    const inputHash = fnv1a(pin.trim());
    if (inputHash === storedHash) {
      await SecureStore.setItemAsync(STORE_KEY_ATTEMPTS, String(MAX_ATTEMPTS)).catch(() => {});
      await SecureStore.deleteItemAsync(STORE_KEY_LOCKOUT).catch(() => {});
      setState((prev) => ({ ...prev, isAuthenticated: true, attemptsLeft: MAX_ATTEMPTS, lockedUntil: null }));
      scheduleAutoLock();
      return { success: true };
    }
    const newAttempts = Math.max(0, (state.attemptsLeft) - 1);
    await SecureStore.setItemAsync(STORE_KEY_ATTEMPTS, String(newAttempts)).catch(() => {});
    if (newAttempts <= 0) {
      const lockUntil = now + LOCKOUT_MS;
      await SecureStore.setItemAsync(STORE_KEY_LOCKOUT, String(lockUntil)).catch(() => {});
      setState((prev) => ({ ...prev, attemptsLeft: 0, lockedUntil: lockUntil }));
      return { success: false, error: `Too many attempts. Locked for 5 minutes.` };
    }
    setState((prev) => ({ ...prev, attemptsLeft: newAttempts }));
    return { success: false, error: `Incorrect PIN. ${newAttempts} attempt${newAttempts === 1 ? '' : 's'} left.` };
  }, [state.lockedUntil, state.attemptsLeft, scheduleAutoLock]);

  const setPin = useCallback(async (oldPin: string | null, newPin: string): Promise<{ success: boolean; error?: string }> => {
    if (!newPin || newPin.trim().length < 4) {
      return { success: false, error: 'New PIN must be at least 4 characters' };
    }
    const stored = await SecureStore.getItemAsync(STORE_KEY_HASH).catch(() => null);
    if (stored) {
      if (!oldPin) return { success: false, error: 'Current PIN required to change PIN' };
      if (fnv1a(oldPin.trim()) !== stored) {
        return { success: false, error: 'Current PIN is incorrect' };
      }
    }
    const newHash = fnv1a(newPin.trim());
    await SecureStore.setItemAsync(STORE_KEY_HASH, newHash);
    setState((prev) => ({ ...prev, isPinSet: true, isAuthenticated: true }));
    scheduleAutoLock();
    return { success: true };
  }, [scheduleAutoLock]);

  const logout = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    setState((prev) => ({ ...prev, isAuthenticated: false }));
  }, []);

  const lockNow = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    setState((prev) => ({ ...prev, isAuthenticated: false }));
  }, []);

  return (
    <DevAuthContext.Provider value={{ ...state, login, logout, setPin, resetActivity, lockNow }}>
      {children}
    </DevAuthContext.Provider>
  );
}

export function useDevAuth(): DevAuthContextValue {
  const ctx = useContext(DevAuthContext);
  if (!ctx) throw new Error('useDevAuth must be used within DevAuthProvider');
  return ctx;
}
