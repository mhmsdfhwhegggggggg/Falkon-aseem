import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type WindowState = 'running' | 'paused' | 'completed' | 'error';

export interface AppWindow {
  id: string;
  title: string;
  taskType: string;
  status: WindowState;
  progress: number;
  createdAt: Date;
  accountId?: string;
  metadata?: Record<string, any>;
}

interface WindowManagerContextValue {
  windows: AppWindow[];
  createWindow: (params: Omit<AppWindow, 'id' | 'createdAt' | 'status' | 'progress'>) => string;
  updateWindow: (id: string, updates: Partial<AppWindow>) => void;
  closeWindow: (id: string) => void;
  pauseWindow: (id: string) => void;
  resumeWindow: (id: string) => void;
  getWindow: (id: string) => AppWindow | undefined;
}

const WindowManagerContext = createContext<WindowManagerContextValue | null>(null);

function generateId(): string {
  return `w_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

export function WindowManagerProvider({ children }: { children: React.ReactNode }) {
  const [windows, setWindows] = useState<AppWindow[]>([]);

  const createWindow = useCallback((params: Omit<AppWindow, 'id' | 'createdAt' | 'status' | 'progress'>): string => {
    const id = generateId();
    const newWindow: AppWindow = {
      ...params,
      id,
      status: 'running',
      progress: 0,
      createdAt: new Date(),
    };
    setWindows((prev) => [...prev, newWindow]);
    return id;
  }, []);

  const updateWindow = useCallback((id: string, updates: Partial<AppWindow>) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, ...updates } : w))
    );
  }, []);

  const closeWindow = useCallback((id: string) => {
    setWindows((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const pauseWindow = useCallback((id: string) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, status: 'paused' } : w))
    );
  }, []);

  const resumeWindow = useCallback((id: string) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, status: 'running' } : w))
    );
  }, []);

  const getWindow = useCallback((id: string) => {
    return windows.find((w) => w.id === id);
  }, [windows]);

  const value = useMemo(() => ({
    windows,
    createWindow,
    updateWindow,
    closeWindow,
    pauseWindow,
    resumeWindow,
    getWindow,
  }), [windows, createWindow, updateWindow, closeWindow, pauseWindow, resumeWindow, getWindow]);

  return (
    <WindowManagerContext.Provider value={value}>
      {children}
    </WindowManagerContext.Provider>
  );
}

export function useWindowManager(): WindowManagerContextValue {
  const ctx = useContext(WindowManagerContext);
  if (!ctx) {
    return {
      windows: [],
      createWindow: () => '',
      updateWindow: () => {},
      closeWindow: () => {},
      pauseWindow: () => {},
      resumeWindow: () => {},
      getWindow: () => undefined,
    };
  }
  return ctx;
}
