import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock amazon-cognito-identity-js before importing auth
vi.mock('amazon-cognito-identity-js', () => {
  const mockSignOut = vi.fn();
  const mockGetCurrentUser = vi.fn(() => ({ signOut: mockSignOut }));
  const mockSignUp = vi.fn();
  const mockAuthenticateUser = vi.fn();
  const mockGetSession = vi.fn();

  function CognitoUserPool() {
    return { getCurrentUser: mockGetCurrentUser, signUp: mockSignUp };
  }
  function CognitoUser() {
    return { authenticateUser: mockAuthenticateUser, getSession: mockGetSession };
  }
  function AuthenticationDetails() {}

  return { CognitoUserPool, CognitoUser, AuthenticationDetails };
});

import { getIdToken, storeSession, clearSession, logout } from './auth';

const TOKEN_KEY = 'filterbrr_id_token';
const REFRESH_KEY = 'filterbrr_refresh_token';

describe('auth token storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns null when no token is stored', () => {
    expect(getIdToken()).toBeNull();
  });

  it('returns stored token', () => {
    localStorage.setItem(TOKEN_KEY, 'test-token');
    expect(getIdToken()).toBe('test-token');
  });

  it('clearSession removes both token keys', () => {
    localStorage.setItem(TOKEN_KEY, 'id-token');
    localStorage.setItem(REFRESH_KEY, 'refresh-token');

    clearSession();

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
  });

  it('clearSession does not throw when keys are already absent', () => {
    expect(() => clearSession()).not.toThrow();
  });

  it('logout clears session tokens', () => {
    localStorage.setItem(TOKEN_KEY, 'id-token');
    localStorage.setItem(REFRESH_KEY, 'refresh-token');

    logout();

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
  });
});
