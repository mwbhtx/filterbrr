import { getIdToken } from './auth';

function getRoleFromToken(): string | null {
  const token = getIdToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role ?? null;
  } catch {
    return null;
  }
}

export function useIsDemo(): boolean {
  return getRoleFromToken() === 'demo';
}

export function isDemoUser(): boolean {
  return getRoleFromToken() === 'demo';
}

export function getUserRole(): string | null {
  return getRoleFromToken();
}
