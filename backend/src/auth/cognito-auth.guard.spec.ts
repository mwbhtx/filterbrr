import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CognitoAuthGuard } from './cognito-auth.guard';

const mockReflector = {
  getAllAndOverride: jest.fn(),
};

describe('CognitoAuthGuard', () => {
  let guard: CognitoAuthGuard;
  const mockRequest = { user: undefined as any, headers: {} as any };
  const mockContext = {
    switchToHttp: () => ({ getRequest: () => mockRequest }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;

  beforeEach(() => {
    mockRequest.user = undefined;
    mockRequest.headers = {};
    mockReflector.getAllAndOverride.mockReturnValue(false);
    guard = new CognitoAuthGuard(mockReflector as unknown as Reflector);
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.LOCAL_ROLE;
  });

  it('allows @Public() endpoints without auth', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(true);
    const result = await guard.canActivate(mockContext);
    expect(result).toBe(true);
  });

  describe('in local environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'local';
    });

    it('sets req.user with dev-user userId and user role', async () => {
      await guard.canActivate(mockContext);
      expect(mockRequest.user).toEqual({ userId: 'dev-user', role: 'user' });
    });

    it('uses LOCAL_ROLE env var when set', async () => {
      process.env.LOCAL_ROLE = 'demo';
      await guard.canActivate(mockContext);
      expect(mockRequest.user).toEqual({ userId: 'dev-user', role: 'demo' });
    });
  });

  describe('in non-local environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('throws UnauthorizedException when no auth header', async () => {
      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });

    it('validates demo JWT and sets user with role', async () => {
      process.env.DEMO_JWT_SECRET = 'test-secret';
      const jwt = require('jsonwebtoken');
      const token = jwt.sign({ sub: 'demo-123', role: 'demo', iss: 'filterbrr-demo' }, 'test-secret');
      mockRequest.headers = { authorization: `Bearer ${token}` };

      await guard.canActivate(mockContext);
      expect(mockRequest.user).toEqual({ userId: 'demo-123', role: 'demo' });

      delete process.env.DEMO_JWT_SECRET;
    });
  });
});
