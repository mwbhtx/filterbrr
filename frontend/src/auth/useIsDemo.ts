import { useMemo } from 'react';
import { getIdToken } from './auth';

const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL ?? 'demo@filterbrr.com';

function getEmailFromToken(): string | null {
  const token = getIdToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.email ?? null;
  } catch {
    return null;
  }
}

export function useIsDemo(): boolean {
  return useMemo(() => getEmailFromToken() === DEMO_EMAIL, []);
}

export function isDemoUser(): boolean {
  return getEmailFromToken() === DEMO_EMAIL;
}
