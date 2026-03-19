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
    delete process.env.DEMO_JWT_SECRET;
  });

  it('allows @Public() endpoints without auth', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(true);
    const result = await guard.canActivate(mockContext);
    expect(result).toBe(true);
  });

  it('throws UnauthorizedException when no auth header', async () => {
    await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
  });

  it('validates self-signed JWT and sets user with role', async () => {
    process.env.DEMO_JWT_SECRET = 'test-secret';
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ sub: 'demo-123', role: 'demo', iss: 'filterbrr-demo' }, 'test-secret');
    mockRequest.headers = { authorization: `Bearer ${token}` };

    await guard.canActivate(mockContext);
    expect(mockRequest.user).toEqual({ userId: 'demo-123', role: 'demo' });
  });

  it('validates local JWT and sets user with role', async () => {
    process.env.DEMO_JWT_SECRET = 'test-secret';
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ sub: 'local-123', role: 'admin', iss: 'filterbrr-local' }, 'test-secret');
    mockRequest.headers = { authorization: `Bearer ${token}` };

    await guard.canActivate(mockContext);
    expect(mockRequest.user).toEqual({ userId: 'local-123', role: 'admin' });
  });

  it('throws UnauthorizedException for expired tokens', async () => {
    process.env.DEMO_JWT_SECRET = 'test-secret';
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ sub: 'demo-123', role: 'demo', iss: 'filterbrr-demo' }, 'test-secret', { expiresIn: -1 });
    mockRequest.headers = { authorization: `Bearer ${token}` };

    await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
  });
});
