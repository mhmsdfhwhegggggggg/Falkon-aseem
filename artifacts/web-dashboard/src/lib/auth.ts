const TOKEN_KEY = 'falkon_admin_session_token';
const EXPIRY_KEY = 'falkon_admin_session_expiry';
const LEGACY_KEY = 'falkon_admin_token';

function clearLegacySecret(): void {
  localStorage.removeItem(LEGACY_KEY);
}

export function saveSession(token: string, expiresAt: string): void {
  clearLegacySecret();
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(EXPIRY_KEY, expiresAt);
}

export function getAuthToken(): string {
  const token = sessionStorage.getItem(TOKEN_KEY) ?? '';
  const expiresAt = sessionStorage.getItem(EXPIRY_KEY) ?? '';
  if (!token || !expiresAt || Date.parse(expiresAt) <= Date.now()) {
    logout();
    return '';
  }
  return token;
}

export function isAuthenticated(): boolean {
  clearLegacySecret();
  return Boolean(getAuthToken());
}

export function logout(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(EXPIRY_KEY);
  clearLegacySecret();
}
