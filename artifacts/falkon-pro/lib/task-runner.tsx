import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { type Member, type MembersFile, type MemberStatus } from './members-store';

export type TaskType =
  | 'extraction'
  | 'add-by-username'
  | 'add-by-id'
  | 'add-from-file'
  | 'bulk-message'
  | 'auto-reply'
  | 'content-clone'
  | 'scheduler';

export type TaskStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error' | 'cancelled';

export interface TaskLog {
  time: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

export interface RunningTask {
  id: string;
  type: TaskType;
  title: string;
  status: TaskStatus;
  progress: number;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  logs: TaskLog[];
  startedAt: Date;
  accountId?: string;
  config: Record<string, any>;
  outputFileId?: string;
  error?: string;
}

interface TaskRunnerContextValue {
  tasks: RunningTask[];
  createTask: (params: Omit<RunningTask, 'id' | 'status' | 'progress' | 'processed' | 'succeeded' | 'failed' | 'skipped' | 'logs' | 'startedAt'>) => string;
  updateTask: (id: string, updates: Partial<RunningTask>) => void;
  logTask: (id: string, message: string, type?: TaskLog['type']) => void;
  cancelTask: (id: string) => void;
  removeTask: (id: string) => void;
  getTask: (id: string) => RunningTask | undefined;
  activeTasks: RunningTask[];
}

const TaskRunnerContext = createContext<TaskRunnerContextValue | null>(null);

function genId() {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

export function TaskRunnerProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<RunningTask[]>([]);

  const createTask = useCallback((params: Omit<RunningTask, 'id' | 'status' | 'progress' | 'processed' | 'succeeded' | 'failed' | 'skipped' | 'logs' | 'startedAt'>): string => {
    const id = genId();
    const task: RunningTask = {
      ...params,
      id,
      status: 'running',
      progress: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      logs: [],
      startedAt: new Date(),
    };
    setTasks((prev) => [task, ...prev]);
    return id;
  }, []);

  const updateTask = useCallback((id: string, updates: Partial<RunningTask>) => {
    setTasks((prev) =>
      prev.map((t) => t.id === id ? {
        ...t,
        ...updates,
        progress: updates.total != null && updates.processed != null
          ? Math.round((updates.processed / Math.max(updates.total, 1)) * 100)
          : updates.progress ?? (t.total > 0 ? Math.round(((updates.processed ?? t.processed) / t.total) * 100) : t.progress),
      } : t)
    );
  }, []);

  const logTask = useCallback((id: string, message: string, type: TaskLog['type'] = 'info') => {
    const log: TaskLog = {
      time: new Date().toLocaleTimeString(),
      message,
      type,
    };
    setTasks((prev) =>
      prev.map((t) => t.id === id ? { ...t, logs: [log, ...t.logs].slice(0, 200) } : t)
    );
  }, []);

  const cancelTask = useCallback((id: string) => {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: 'cancelled' } : t));
  }, []);

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const getTask = useCallback((id: string) => tasks.find((t) => t.id === id), [tasks]);

  const activeTasks = useMemo(() => tasks.filter((t) => t.status === 'running' || t.status === 'paused'), [tasks]);

  const value: TaskRunnerContextValue = useMemo(() => ({
    tasks,
    createTask,
    updateTask,
    logTask,
    cancelTask,
    removeTask,
    getTask,
    activeTasks,
  }), [tasks, createTask, updateTask, logTask, cancelTask, removeTask, getTask, activeTasks]);

  return <TaskRunnerContext.Provider value={value}>{children}</TaskRunnerContext.Provider>;
}

export function useTaskRunner(): TaskRunnerContextValue {
  const ctx = useContext(TaskRunnerContext);
  if (!ctx) throw new Error('useTaskRunner must be used within TaskRunnerProvider');
  return ctx;
}
