import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { getAuthToken, isAuthenticated, logout, saveSession } from './auth.js';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const originalNow = Date.now;

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: new MemoryStorage(),
    configurable: true,
  });
  Date.now = () => 1_000_000;
});

afterEach(() => {
  Date.now = originalNow;
  Reflect.deleteProperty(globalThis, 'localStorage');
  Reflect.deleteProperty(globalThis, 'sessionStorage');
});

describe('browser admin session', () => {
  it('stores only the short-lived token in sessionStorage and removes the legacy password', () => {
    localStorage.setItem('falkon_admin_token', 'legacy-raw-password');
    saveSession('signed-token', new Date(1_600_000).toISOString());

    assert.equal(sessionStorage.getItem('falkon_admin_session_token'), 'signed-token');
    assert.equal(localStorage.getItem('falkon_admin_token'), null);
    assert.equal(getAuthToken(), 'signed-token');
    assert.equal(isAuthenticated(), true);
  });

  it('rejects and removes an expired session', () => {
    saveSession('expired-token', new Date(999_999).toISOString());

    assert.equal(getAuthToken(), '');
    assert.equal(isAuthenticated(), false);
    assert.equal(sessionStorage.length, 0);
  });

  it('rejects incomplete session records and clears them', () => {
    sessionStorage.setItem('falkon_admin_session_token', 'orphan-token');

    assert.equal(getAuthToken(), '');
    assert.equal(sessionStorage.length, 0);
  });

  it('logout clears current and legacy credentials', () => {
    saveSession('signed-token', new Date(1_600_000).toISOString());
    localStorage.setItem('falkon_admin_token', 'legacy-raw-password');

    logout();

    assert.equal(sessionStorage.length, 0);
    assert.equal(localStorage.getItem('falkon_admin_token'), null);
  });
});
