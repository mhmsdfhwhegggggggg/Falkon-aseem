const TOKEN_KEY = 'falkon_admin_token';

export function isAuthenticated(): boolean {
  return !!localStorage.getItem(TOKEN_KEY);
}

export function login(password: string): boolean {
  localStorage.setItem(TOKEN_KEY, password);
  return true;
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getAdminSecret(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}
