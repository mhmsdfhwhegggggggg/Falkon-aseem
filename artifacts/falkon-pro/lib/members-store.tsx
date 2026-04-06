import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type MemberStatus = 'pending' | 'added' | 'failed' | 'flood' | 'already_member' | 'privacy';

export interface Member {
  id: string;
  userId?: string;
  accessHash?: string;   // stored from extraction — required to add by ID
  username?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  isBot?: boolean;
  isOnline?: boolean;
  lastSeen?: string;
  status: MemberStatus;
  error?: string;
  source?: string;
  extractedAt?: string;
}

export interface MembersFile {
  id: string;
  name: string;
  members: Member[];
  sourceGroup?: string;
  createdAt: string;
  totalCount: number;
  addedCount: number;
}

interface MembersState {
  files: MembersFile[];
  selectedFileId: string | null;
  isLoading: boolean;
}

type MembersAction =
  | { type: 'SET_FILES'; files: MembersFile[] }
  | { type: 'ADD_FILE'; file: MembersFile }
  | { type: 'UPDATE_FILE'; id: string; updates: Partial<MembersFile> }
  | { type: 'DELETE_FILE'; id: string }
  | { type: 'SELECT_FILE'; id: string | null }
  | { type: 'UPDATE_MEMBER_STATUS'; fileId: string; memberId: string; status: MemberStatus }
  | { type: 'BATCH_UPDATE_STATUSES'; fileId: string; updates: Array<{ userId?: string; username?: string; status: MemberStatus; error?: string }> }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'APPEND_MEMBERS'; fileId: string; members: Member[] };

function membersReducer(state: MembersState, action: MembersAction): MembersState {
  switch (action.type) {
    case 'SET_FILES':
      return { ...state, files: action.files, isLoading: false };
    case 'ADD_FILE':
      return { ...state, files: [action.file, ...state.files] };
    case 'UPDATE_FILE':
      return {
        ...state,
        files: state.files.map((f) =>
          f.id === action.id ? { ...f, ...action.updates } : f
        ),
      };
    case 'DELETE_FILE':
      return {
        ...state,
        files: state.files.filter((f) => f.id !== action.id),
        selectedFileId: state.selectedFileId === action.id ? null : state.selectedFileId,
      };
    case 'SELECT_FILE':
      return { ...state, selectedFileId: action.id };
    case 'UPDATE_MEMBER_STATUS':
      return {
        ...state,
        files: state.files.map((f) => {
          if (f.id !== action.fileId) return f;
          const members = f.members.map((m) =>
            m.id === action.memberId ? { ...m, status: action.status } : m
          );
          const addedCount = members.filter((m) => m.status === 'added').length;
          return { ...f, members, addedCount };
        }),
      };
    case 'BATCH_UPDATE_STATUSES':
      return {
        ...state,
        files: state.files.map((f) => {
          if (f.id !== action.fileId) return f;
          const members = f.members.map((m) => {
            const upd = action.updates.find((u) =>
              (u.userId && u.userId === m.userId) ||
              (u.username && u.username === m.username)
            );
            if (!upd) return m;
            return { ...m, status: upd.status, ...(upd.error ? { error: upd.error } : {}) };
          });
          const addedCount = members.filter((m) => m.status === 'added').length;
          return { ...f, members, addedCount };
        }),
      };
    case 'APPEND_MEMBERS':
      return {
        ...state,
        files: state.files.map((f) => {
          if (f.id !== action.fileId) return f;
          const existing = new Set(f.members.map((m) => m.id));
          const newMembers = action.members.filter((m) => !existing.has(m.id));
          const allMembers = [...f.members, ...newMembers];
          return { ...f, members: allMembers, totalCount: allMembers.length };
        }),
      };
    case 'SET_LOADING':
      return { ...state, isLoading: action.loading };
    default:
      return state;
  }
}

const STORAGE_KEY = '@falkon_pro_members_files';

interface MembersContextValue {
  files: MembersFile[];
  selectedFileId: string | null;
  isLoading: boolean;
  selectedFile: MembersFile | undefined;
  createFile: (name: string, members: Member[], sourceGroup?: string) => Promise<MembersFile>;
  appendToFile: (fileId: string, members: Member[]) => Promise<void>;
  deleteFile: (fileId: string) => Promise<void>;
  selectFile: (id: string | null) => void;
  updateMemberStatus: (fileId: string, memberId: string, status: MemberStatus) => Promise<void>;
  batchUpdateMemberStatuses: (fileId: string, updates: Array<{ userId?: string; username?: string; status: MemberStatus; error?: string }>) => Promise<void>;
  renameFile: (fileId: string, name: string) => Promise<void>;
  exportFileAsText: (fileId: string) => string;
  exportFileAsUsernames: (fileId: string) => string;
  exportFileAsCSV: (fileId: string) => string;
  importMembersFromText: (text: string, source?: 'username' | 'id') => Member[];
  totalMembers: number;
}

const MembersContext = createContext<MembersContextValue | null>(null);

function generateId() {
  return `mf_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

function generateMemberId() {
  return `m_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

export function MembersStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(membersReducer, {
    files: [],
    selectedFileId: null,
    isLoading: true,
  });

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const files = JSON.parse(raw) as MembersFile[];
          dispatch({ type: 'SET_FILES', files });
        } catch {
          dispatch({ type: 'SET_LOADING', loading: false });
        }
      } else {
        dispatch({ type: 'SET_LOADING', loading: false });
      }
    }).catch(() => {
      dispatch({ type: 'SET_LOADING', loading: false });
    });
  }, []);

  const persist = useCallback(async (files: MembersFile[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(files));
    } catch {
    }
  }, []);

  const createFile = useCallback(async (name: string, members: Member[], sourceGroup?: string): Promise<MembersFile> => {
    const file: MembersFile = {
      id: generateId(),
      name,
      members,
      sourceGroup,
      createdAt: new Date().toISOString(),
      totalCount: members.length,
      addedCount: 0,
    };
    dispatch({ type: 'ADD_FILE', file });
    const next = [file, ...state.files];
    await persist(next);
    return file;
  }, [state.files, persist]);

  const appendToFile = useCallback(async (fileId: string, members: Member[]) => {
    dispatch({ type: 'APPEND_MEMBERS', fileId, members });
    const next = state.files.map((f) => {
      if (f.id !== fileId) return f;
      const existing = new Set(f.members.map((m) => m.id));
      const newMembers = members.filter((m) => !existing.has(m.id));
      const allMembers = [...f.members, ...newMembers];
      return { ...f, members: allMembers, totalCount: allMembers.length };
    });
    await persist(next);
  }, [state.files, persist]);

  const deleteFile = useCallback(async (fileId: string) => {
    dispatch({ type: 'DELETE_FILE', id: fileId });
    const next = state.files.filter((f) => f.id !== fileId);
    await persist(next);
  }, [state.files, persist]);

  const selectFile = useCallback((id: string | null) => {
    dispatch({ type: 'SELECT_FILE', id });
  }, []);

  const updateMemberStatus = useCallback(async (fileId: string, memberId: string, status: MemberStatus) => {
    dispatch({ type: 'UPDATE_MEMBER_STATUS', fileId, memberId, status });
    const next = state.files.map((f) => {
      if (f.id !== fileId) return f;
      const members = f.members.map((m) => m.id === memberId ? { ...m, status } : m);
      return { ...f, members, addedCount: members.filter((m) => m.status === 'added').length };
    });
    await persist(next);
  }, [state.files, persist]);

  const batchUpdateMemberStatuses = useCallback(async (
    fileId: string,
    updates: Array<{ userId?: string; username?: string; status: MemberStatus; error?: string }>
  ) => {
    dispatch({ type: 'BATCH_UPDATE_STATUSES', fileId, updates });
    const next = state.files.map((f) => {
      if (f.id !== fileId) return f;
      const members = f.members.map((m) => {
        const upd = updates.find((u) =>
          (u.userId && u.userId === m.userId) ||
          (u.username && u.username === m.username)
        );
        if (!upd) return m;
        return { ...m, status: upd.status, ...(upd.error ? { error: upd.error } : {}) };
      });
      const addedCount = members.filter((m) => m.status === 'added').length;
      return { ...f, members, addedCount };
    });
    await persist(next);
  }, [state.files, persist]);

  const renameFile = useCallback(async (fileId: string, name: string) => {
    dispatch({ type: 'UPDATE_FILE', id: fileId, updates: { name } });
    const next = state.files.map((f) => f.id === fileId ? { ...f, name } : f);
    await persist(next);
  }, [state.files, persist]);

  const exportFileAsText = useCallback((fileId: string): string => {
    const file = state.files.find((f) => f.id === fileId);
    if (!file) return '';
    const lines = file.members.map((m) => {
      const parts: string[] = [];
      if (m.userId) parts.push(`ID:${m.userId}`);
      if (m.username) parts.push(`@${m.username}`);
      if (m.firstName || m.lastName) parts.push([m.firstName, m.lastName].filter(Boolean).join(' '));
      return parts.join(' | ');
    });
    return `# ${file.name}\n# Source: ${file.sourceGroup ?? 'manual'}\n# Extracted: ${file.createdAt}\n# Total: ${file.totalCount}\n\n${lines.join('\n')}`;
  }, [state.files]);

  const exportFileAsUsernames = useCallback((fileId: string): string => {
    const file = state.files.find((f) => f.id === fileId);
    if (!file) return '';
    return file.members
      .filter((m) => m.username)
      .map((m) => `@${m.username}`)
      .join('\n');
  }, [state.files]);

  const exportFileAsCSV = useCallback((fileId: string): string => {
    const file = state.files.find((f) => f.id === fileId);
    if (!file) return '';
    const header = 'user_id,username,first_name,last_name,phone,is_online,status,source,extracted_at';
    const rows = file.members.map((m) => [
      m.userId ?? '',
      m.username ?? '',
      (m.firstName ?? '').replace(/,/g, ' '),
      (m.lastName ?? '').replace(/,/g, ' '),
      m.phone ?? '',
      m.isOnline ? '1' : '0',
      m.status,
      (m.source ?? '').replace(/,/g, ' '),
      m.extractedAt ?? '',
    ].join(','));
    return [header, ...rows].join('\n');
  }, [state.files]);

  const importMembersFromText = useCallback((text: string, source: 'username' | 'id' = 'username'): Member[] => {
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    return lines.map((line) => {
      const member: Member = {
        id: generateMemberId(),
        status: 'pending',
        source: 'manual',
        extractedAt: new Date().toISOString(),
      };
      if (source === 'id') {
        const clean = line.replace(/^[@\s]+/, '').replace(/\D/g, '');
        if (clean) member.userId = clean;
      } else {
        const clean = line.replace(/^[@\s]+/, '').split(/[\s|,]+/)[0];
        if (clean) member.username = clean;
      }
      return member;
    }).filter((m) => m.userId || m.username);
  }, []);

  const totalMembers = useMemo(() => state.files.reduce((acc, f) => acc + f.totalCount, 0), [state.files]);
  const selectedFile = useMemo(() => state.files.find((f) => f.id === state.selectedFileId), [state.files, state.selectedFileId]);

  const value: MembersContextValue = useMemo(() => ({
    files: state.files,
    selectedFileId: state.selectedFileId,
    selectedFile,
    isLoading: state.isLoading,
    createFile,
    appendToFile,
    deleteFile,
    selectFile,
    updateMemberStatus,
    batchUpdateMemberStatuses,
    renameFile,
    exportFileAsText,
    exportFileAsUsernames,
    exportFileAsCSV,
    importMembersFromText,
    totalMembers,
  }), [state, selectedFile, createFile, appendToFile, deleteFile, selectFile, updateMemberStatus, batchUpdateMemberStatuses, renameFile, exportFileAsText, exportFileAsUsernames, exportFileAsCSV, importMembersFromText, totalMembers]);

  return <MembersContext.Provider value={value}>{children}</MembersContext.Provider>;
}

export function useMembersStore(): MembersContextValue {
  const ctx = useContext(MembersContext);
  if (!ctx) throw new Error('useMembersStore must be used within MembersStoreProvider');
  return ctx;
}
