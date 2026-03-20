import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';

const pool = new CognitoUserPool({
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
});

const TOKEN_KEY = 'filterbrr_id_token';
const REFRESH_KEY = 'filterbrr_refresh_token';

export function getIdToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeSession(session: CognitoUserSession) {
  localStorage.setItem(TOKEN_KEY, session.getIdToken().getJwtToken());
  localStorage.setItem(REFRESH_KEY, session.getRefreshToken().getToken());
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export async function login(email: string, password: string): Promise<void> {
  // In local dev, try the local login endpoint first
  if (import.meta.env.DEV) {
    try {
      const res = await fetch('/api/auth/local-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const { token } = await res.json();
        localStorage.setItem(TOKEN_KEY, token);
        const { queryClient } = await import('../queryClient');
        queryClient.clear();
        return;
      }
      // If empty credentials and local endpoint failed, don't fall through to Cognito
      if (!email && !password) {
        const text = await res.text();
        throw new Error(text || 'Local login failed');
      }
    } catch (err) {
      // If empty credentials, surface the error (don't try Cognito)
      if (!email && !password) throw err;
      // Local endpoint unavailable — fall through to Cognito
    }
  }

  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: pool });
    const auth = new AuthenticationDetails({ Username: email, Password: password });
    user.authenticateUser(auth, {
      onSuccess: (session) => { storeSession(session); resolve(); },
      onFailure: reject,
      newPasswordRequired: () => reject(new Error('Password reset required')),
    });
  });
}

export function signUp(email: string, password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    pool.signUp(email, password, [], [], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function confirmSignUp(email: string, code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: pool });
    user.confirmRegistration(code, true, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function resendConfirmationCode(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: pool });
    user.resendConfirmationCode((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function forgotPassword(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: pool });
    user.forgotPassword({
      onSuccess: () => resolve(),
      onFailure: (err) => reject(err),
    });
  });
}

export function confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: pool });
    user.confirmPassword(code, newPassword, {
      onSuccess: () => resolve(),
      onFailure: (err) => reject(err),
    });
  });
}

export async function loginAsDemo(): Promise<void> {
  const res = await fetch('/api/demo', { method: 'POST' });
  if (!res.ok) throw new Error('Demo unavailable');
  const { token } = await res.json();
  localStorage.setItem(TOKEN_KEY, token);
  const { queryClient } = await import('../queryClient');
  queryClient.clear();
}

export function logout() {
  const user = pool.getCurrentUser();
  user?.signOut();
  clearSession();
  localStorage.removeItem('simulator-settings');
  localStorage.removeItem('simulator-last-result');
}

export function refreshSession(): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = pool.getCurrentUser();
    if (!user) return reject(new Error('No current user'));
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session) return reject(err ?? new Error('No session'));
      storeSession(session);
      resolve();
    });
  });
}
