/**
 * WINDOW MANAGER — Multi-Tasking Engine
 * =======================================
 * Manages parallel Telegram operations as independent "windows".
 * Each window is linked to a real server job and polls for live updates.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useReducer,
} from 'react';
import { trpc } from './trpc';
import { useAccountsStore } from './accounts-store';
import { useMembersStore, type Member } from './members-store';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WindowState = 'configuring' | 'running' | 'paused' | 'completed' | 'error' | 'cancelled';
export type WindowTaskType = 'extraction' | 'add-members' | 'extract-and-add' | 'bulk-message' | 'content-clone' | 'auto-reply' | 'scheduler';

export interface WindowLog {
  id: string;
  time: Date;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

export interface WindowStats {
  extracted: number;
  added: number;
  failed: number;
  skipped: number;
  total: number;
}

export interface WindowConfig {
  taskType: WindowTaskType;
  accountId?: string;
  sessionString?: string;
  sourceGroup?: string;
  limit?: number;
  excludeBots?: boolean;
  filterActive?: boolean;
  targetGroup?: string;
  delaySeconds?: number;
  maxPerDay?: number;
  warmup?: boolean;
  fileId?: string;
}

export interface AppWindow {
  id: string;
  title: string;
  taskType: WindowTaskType;
  status: WindowState;
  progress: number;
  total: number;
  createdAt: Date;
  updatedAt: Date;
  accountId: string | undefined;
  jobId?: string;
  config: WindowConfig;
  logs: WindowLog[];
  stats: WindowStats;
  error?: string;
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

type Action =
  | { type: 'CREATE'; window: AppWindow }
  | { type: 'UPDATE'; id: string; updates: Partial<AppWindow> }
  | { type: 'CLOSE'; id: string }
  | { type: 'ADD_LOG'; id: string; log: WindowLog }
  | { type: 'UPDATE_STATS'; id: string; stats: Partial<WindowStats> };

function reducer(state: AppWindow[], action: Action): AppWindow[] {
  switch (action.type) {
    case 'CREATE':
      return [...state, action.window];
    case 'UPDATE':
      return state.map((w) =>
        w.id === action.id ? { ...w, ...action.updates, updatedAt: new Date() } : w
      );
    case 'CLOSE':
      return state.filter((w) => w.id !== action.id);
    case 'ADD_LOG':
      return state.map((w) => {
        if (w.id !== action.id) return w;
        const logs = [...w.logs, action.log].slice(-50);
        return { ...w, logs, updatedAt: new Date() };
      });
    case 'UPDATE_STATS':
      return state.map((w) => {
        if (w.id !== action.id) return w;
        return { ...w, stats: { ...w.stats, ...action.stats }, updatedAt: new Date() };
      });
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface WindowManagerContextValue {
  windows: AppWindow[];
  activeCount: number;
  createWindow: (config: WindowConfig, title?: string) => string;
  startWindow: (id: string) => Promise<void>;
  closeWindow: (id: string) => void;
  pauseWindow: (id: string) => void;
  resumeWindow: (id: string) => void;
  getWindow: (id: string) => AppWindow | undefined;
  addLog: (id: string, message: string, type?: WindowLog['type']) => void;
}

const WindowManagerContext = createContext<WindowManagerContextValue | null>(null);

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _idCounter = 0;
function genId() { return `w_${Date.now()}_${(++_idCounter).toString(36)}`; }
function genLogId() { return `l_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`; }

const TYPE_LABELS: Record<WindowTaskType, string> = {
  extraction: 'استخراج أعضاء',
  'add-members': 'إضافة أعضاء',
  'extract-and-add': 'استخراج وإضافة',
  'bulk-message': 'رسائل جماعية',
  'content-clone': 'نسخ المحتوى',
  'auto-reply': 'رد تلقائي',
  'scheduler': 'جدولة',
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export function WindowManagerProvider({ children }: { children: React.ReactNode }) {
  const [windows, dispatch] = useReducer(reducer, []);

  // Refs to avoid stale closures in async callbacks
  const windowsRef = useRef<AppWindow[]>(windows);
  useEffect(() => { windowsRef.current = windows; }, [windows]);

  const { getSession } = useAccountsStore();
  const membersStore = useMembersStore();
  const utils = trpc.useUtils();

  // Per-window polling timers: windowId → intervalId
  const pollTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // ── Logging ────────────────────────────────────────────────────────────────

  const addLog = useCallback((id: string, message: string, type: WindowLog['type'] = 'info') => {
    dispatch({
      type: 'ADD_LOG',
      id,
      log: { id: genLogId(), time: new Date(), message, type },
    });
  }, []);

  // ── Polling ────────────────────────────────────────────────────────────────

  const stopPolling = useCallback((windowId: string) => {
    const timer = pollTimers.current.get(windowId);
    if (timer) {
      clearInterval(timer);
      pollTimers.current.delete(windowId);
    }
  }, []);

  const startPolling = useCallback((windowId: string, jobId: string, taskType: WindowTaskType) => {
    // Don't double-poll
    if (pollTimers.current.has(windowId)) return;

    const timer = setInterval(async () => {
      try {
        let status: {
          status: string; progress?: number; total?: number;
          extracted?: number; added?: number; failed?: number; error?: string;
        };

        if (taskType === 'extraction' || taskType === 'extract-and-add') {
          status = await utils.extraction.status.fetch({ jobId }, { staleTime: 0 });
        } else {
          status = await utils.addMembers.status.fetch({ jobId }, { staleTime: 0 });
        }

        const stateMap: Record<string, WindowState> = {
          queued: 'running',
          running: 'running',
          completed: 'completed',
          failed: 'error',
          cancelled: 'cancelled',
        };
        const newState: WindowState = stateMap[status.status] ?? 'running';

        dispatch({
          type: 'UPDATE',
          id: windowId,
          updates: {
            status: newState,
            progress: status.progress ?? 0,
            total: status.total ?? 0,
            error: status.error,
          },
        });

        // Update stats
        const statsUpdate: Partial<WindowStats> = {
          total: status.total ?? 0,
          extracted: status.extracted ?? 0,
          added: status.added ?? 0,
          failed: status.failed ?? 0,
        };
        dispatch({ type: 'UPDATE_STATS', id: windowId, stats: statsUpdate });

        // Stop polling when terminal
        if (newState === 'completed' || newState === 'error' || newState === 'cancelled') {
          stopPolling(windowId);

          if (newState === 'completed') {
            addLog(windowId, 'اكتملت المهمة ✓ — جاري الحفظ على الهاتف...', 'success');

            // ── Auto-save extraction results to phone ──
            if (taskType === 'extraction' || taskType === 'extract-and-add') {
              try {
                const win = windowsRef.current.find((w) => w.id === windowId);
                const resultData = await utils.extraction.result.fetch({ jobId }, { staleTime: 0 });

                if (resultData?.members && resultData.members.length > 0) {
                  const sourceGroup = win?.config.sourceGroup ?? jobId;
                  const groupName = sourceGroup
                    .replace(/^@/, '')
                    .replace(/https?:\/\/t\.me\//, '')
                    .replace(/\//g, '_')
                    .substring(0, 40);
                  const fileName = `${groupName}_${new Date().toISOString().split('T')[0]}`;

                  const members: Member[] = resultData.members.map((m: any) => ({
                    id: `m_${m.userId}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                    userId: m.userId,
                    username: m.username || '',
                    firstName: m.firstName || '',
                    lastName: m.lastName || '',
                    phone: m.phone || '',
                    isOnline: m.isOnline || false,
                    lastSeen: m.lastSeen,
                    status: 'pending' as const,
                    source: sourceGroup,
                    extractedAt: new Date().toISOString(),
                  }));

                  await membersStore.createFile(fileName, members, sourceGroup);
                  addLog(windowId, `✓ حُفظ ${members.length} عضو على الهاتف — "${fileName}"`, 'success');
                }
              } catch (saveErr: any) {
                addLog(windowId, `تحذير: فشل الحفظ المحلي — ${saveErr?.message ?? 'unknown'}`, 'warning');
              }
            } else {
              addLog(windowId, 'اكتملت المهمة بنجاح ✓', 'success');
            }
          } else {
            const msg = newState === 'cancelled'
              ? 'تم إلغاء المهمة'
              : `فشلت المهمة: ${status.error ?? 'خطأ غير معروف'}`;
            addLog(windowId, msg, 'error');
          }
        }

      } catch (err: any) {
        addLog(windowId, `خطأ اتصال: ${err?.message ?? 'unknown'}`, 'error');
      }
    }, 2000);

    pollTimers.current.set(windowId, timer);
  }, [utils, addLog, stopPolling]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of pollTimers.current.values()) {
        clearInterval(timer);
      }
    };
  }, []);

  // ── Create Window ──────────────────────────────────────────────────────────

  const createWindow = useCallback((config: WindowConfig, title?: string): string => {
    const id = genId();
    const win: AppWindow = {
      id,
      title: title ?? TYPE_LABELS[config.taskType],
      taskType: config.taskType,
      status: 'configuring',
      progress: 0,
      total: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      accountId: config.accountId,
      config,
      logs: [{
        id: genLogId(), time: new Date(),
        message: 'النافذة جاهزة — اضغط تشغيل للبدء',
        type: 'info',
      }],
      stats: { extracted: 0, added: 0, failed: 0, skipped: 0, total: 0 },
    };
    dispatch({ type: 'CREATE', window: win });
    return id;
  }, []);

  // ── Start Window (submit real job) ─────────────────────────────────────────

  const startWindow = useCallback(async (id: string): Promise<void> => {
    // Use ref to avoid stale closure
    const win = windowsRef.current.find((w) => w.id === id);
    if (!win) return;

    dispatch({ type: 'UPDATE', id, updates: { status: 'running' } });
    addLog(id, 'جاري الاتصال بالسيرفر...', 'info');

    try {
      const accountId = win.config.accountId ?? '';
      // Fetch session from phone SecureStore
      const sessionString = win.config.sessionString
        ?? (accountId ? (await getSession(accountId)) ?? undefined : undefined);

      let jobId: string | undefined;

      if (win.config.taskType === 'extraction' || win.config.taskType === 'extract-and-add') {
        addLog(id, `استخراج من: ${win.config.sourceGroup ?? '?'}`, 'info');
        const res = await utils.client.extraction.start.mutate({
          group: win.config.sourceGroup ?? '',
          limit: win.config.limit ?? 500,
          excludeBots: win.config.excludeBots ?? true,
          filterActive: win.config.filterActive ?? false,
          mode: 'members',
          accountId,
          sessionString,
        });
        jobId = res.jobId;
        addLog(id, `المهمة بدأت — #${res.jobId.slice(-8)}`, 'success');

      } else if (win.config.taskType === 'add-members') {
        addLog(id, `إضافة إلى: ${win.config.targetGroup ?? '?'}`, 'info');
        const res = await utils.client.addMembers.start.mutate({
          targetGroup: win.config.targetGroup ?? '',
          mode: win.config.fileId ? 'from-file' : 'by-username',
          fileId: win.config.fileId,
          delaySeconds: win.config.delaySeconds ?? 30,
          maxPerDay: win.config.maxPerDay ?? 40,
          warmup: win.config.warmup ?? false,
          accountId,
          sessionString,
          priority: 'normal',
        });
        jobId = res.jobId;
        addLog(id, `مهمة الإضافة بدأت — #${res.jobId.slice(-8)}`, 'success');
      }

      if (jobId) {
        dispatch({ type: 'UPDATE', id, updates: { jobId } });
        startPolling(id, jobId, win.config.taskType);
      }

    } catch (err: any) {
      const errMsg = err?.message ?? 'فشل البدء';
      dispatch({ type: 'UPDATE', id, updates: { status: 'error', error: errMsg } });
      addLog(id, `فشل البدء: ${errMsg}`, 'error');
    }
  }, [getSession, utils, startPolling, addLog]);

  // ── Pause / Resume / Close ─────────────────────────────────────────────────

  const pauseWindow = useCallback((id: string) => {
    stopPolling(id);
    dispatch({ type: 'UPDATE', id, updates: { status: 'paused' } });
    addLog(id, 'تم إيقاف التتبع مؤقتاً (المهمة تعمل في الخلفية)', 'warning');
  }, [stopPolling, addLog]);

  const resumeWindow = useCallback((id: string) => {
    const win = windowsRef.current.find((w) => w.id === id);
    if (!win?.jobId) {
      addLog(id, 'لا يوجد job_id — شغّل المهمة من جديد', 'error');
      return;
    }
    dispatch({ type: 'UPDATE', id, updates: { status: 'running' } });
    addLog(id, 'استُؤنف تتبع المهمة', 'success');
    startPolling(id, win.jobId, win.taskType);
  }, [startPolling, addLog]);

  const closeWindow = useCallback((id: string) => {
    stopPolling(id);
    dispatch({ type: 'CLOSE', id });
  }, [stopPolling]);

  const getWindow = useCallback((id: string) => windowsRef.current.find((w) => w.id === id), []);

  const activeCount = useMemo(() => windows.filter((w) => w.status === 'running').length, [windows]);

  const value = useMemo<WindowManagerContextValue>(() => ({
    windows,
    activeCount,
    createWindow,
    startWindow,
    closeWindow,
    pauseWindow,
    resumeWindow,
    getWindow,
    addLog,
  }), [windows, activeCount, createWindow, startWindow, closeWindow, pauseWindow, resumeWindow, getWindow, addLog]);

  return (
    <WindowManagerContext.Provider value={value}>
      {children}
    </WindowManagerContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWindowManager(): WindowManagerContextValue {
  const ctx = useContext(WindowManagerContext);
  if (!ctx) {
    // Graceful fallback outside provider
    return {
      windows: [],
      activeCount: 0,
      createWindow: () => '',
      startWindow: async () => {},
      closeWindow: () => {},
      pauseWindow: () => {},
      resumeWindow: () => {},
      getWindow: () => undefined,
      addLog: () => {},
    };
  }
  return ctx;
}
