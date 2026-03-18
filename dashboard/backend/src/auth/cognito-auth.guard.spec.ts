import { ExecutionContext } from '@nestjs/common';
import { CognitoAuthGuard } from './cognito-auth.guard';

describe('CognitoAuthGuard', () => {
  let guard: CognitoAuthGuard;
  const mockRequest = { userId: undefined as string | undefined };
  const mockContext = {
    switchToHttp: () => ({ getRequest: () => mockRequest }),
  } as unknown as ExecutionContext;

  beforeEach(() => {
    mockRequest.userId = undefined;
    // Provide a no-op super.canActivate by spying on the prototype
    guard = new CognitoAuthGuard();
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
  });

  describe('in local environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'local';
    });

    it('sets req.userId to dev-user', () => {
      guard.canActivate(mockContext);
      expect(mockRequest.userId).toBe('dev-user');
    });

    it('returns true without calling passport', () => {
      const result = guard.canActivate(mockContext);
      expect(result).toBe(true);
    });
  });

  describe('in non-local environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      // Mock super.canActivate to avoid real JWT validation
      jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate')
        .mockReturnValue(true as any);
    });

    it('does not set req.userId directly', () => {
      guard.canActivate(mockContext);
      expect(mockRequest.userId).toBeUndefined();
    });

    it('delegates to passport jwt strategy', () => {
      const superSpy = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate')
        .mockReturnValue(true as any);
      guard.canActivate(mockContext);
      expect(superSpy).toHaveBeenCalledWith(mockContext);
    });
  });
});
