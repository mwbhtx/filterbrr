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

export function login(email: string, password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: pool });
    const auth = new AuthenticationDetails({ Username: email, Password: password });
    user.authenticateUser(auth, {
      onSuccess: (session) => { storeSession(session); resolve(); },
      onFailure: reject,
      newPasswordRequired: () => reject(new Error('Password reset required. Run: aws cognito-idp admin-set-user-password --user-pool-id ' + import.meta.env.VITE_COGNITO_USER_POOL_ID + ' --username ' + email + ' --password \'NewPassword1!\' --permanent --region us-east-1')),
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
