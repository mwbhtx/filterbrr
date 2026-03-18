import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock amazon-cognito-identity-js so auth.ts module-level pool construction succeeds
vi.mock('amazon-cognito-identity-js', () => {
  function CognitoUserPool() {
    return { getCurrentUser: vi.fn(), signUp: vi.fn() };
  }
  function CognitoUser() {
    return { authenticateUser: vi.fn(), getSession: vi.fn() };
  }
  function AuthenticationDetails() {}
  return { CognitoUserPool, CognitoUser, AuthenticationDetails };
});

import RequireAuth from './RequireAuth';

const TOKEN_KEY = 'filterbrr_id_token';

describe('RequireAuth', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders children when token exists', () => {
    localStorage.setItem(TOKEN_KEY, 'valid-token');

    render(
      <MemoryRouter>
        <RequireAuth>
          <div>protected content</div>
        </RequireAuth>
      </MemoryRouter>
    );

    expect(screen.getByText('protected content')).toBeInTheDocument();
  });

  it('redirects to /login when no token', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <RequireAuth>
          <div>protected content</div>
        </RequireAuth>
      </MemoryRouter>
    );

    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });
});
