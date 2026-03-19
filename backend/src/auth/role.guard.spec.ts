import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleGuard } from './role.guard';

const mockReflector = {
  getAllAndOverride: jest.fn().mockReturnValue(false),
};

function makeContext(role: string, method: string, routePath: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: { userId: 'test-user', role },
        method,
        route: { path: routePath },
      }),
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('RoleGuard', () => {
  const guard = new RoleGuard(mockReflector as unknown as Reflector);

  beforeEach(() => {
    mockReflector.getAllAndOverride.mockReturnValue(false);
  });

  it('allows user role for any endpoint', () => {
    expect(guard.canActivate(makeContext('user', 'POST', '/api/pipeline/scrape'))).toBe(true);
  });

  it('allows demo role for allowlisted endpoint', () => {
    expect(guard.canActivate(makeContext('demo', 'GET', '/api/filters'))).toBe(true);
  });

  it('blocks demo role for non-allowlisted endpoint', () => {
    expect(() => guard.canActivate(makeContext('demo', 'POST', '/api/pipeline/scrape'))).toThrow(ForbiddenException);
  });

  it('blocks demo role for settings write', () => {
    expect(() => guard.canActivate(makeContext('demo', 'PUT', '/api/settings'))).toThrow(ForbiddenException);
  });

  it('blocks unknown roles', () => {
    expect(() => guard.canActivate(makeContext('unknown', 'GET', '/api/filters'))).toThrow(ForbiddenException);
  });

  it('allows @Public() endpoints without role check', () => {
    mockReflector.getAllAndOverride.mockReturnValue(true);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ user: undefined }),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
