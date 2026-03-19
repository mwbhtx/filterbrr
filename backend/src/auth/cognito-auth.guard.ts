import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class CognitoAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    if (process.env.NODE_ENV === 'local') {
      const req = context.switchToHttp().getRequest();
      req.user = { userId: 'dev-user', role: process.env.LOCAL_ROLE ?? 'user' };
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing token');
    }
    const token = authHeader.slice(7);

    // Try demo JWT first (cheap local secret verification)
    const demoSecret = process.env.DEMO_JWT_SECRET;
    if (demoSecret) {
      try {
        const payload = jwt.verify(token, demoSecret, { issuer: 'filterbrr-demo' }) as { sub: string; role: string };
        if (!payload.role) throw new UnauthorizedException('Missing role claim');
        req.user = { userId: payload.sub, role: payload.role };
        return true;
      } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
          throw new UnauthorizedException('Demo session expired');
        }
        // Not a demo token — fall through to Cognito
      }
    }

    // Fall through to Cognito JWKS validation (Passport)
    const result = await (super.canActivate(context) as Promise<boolean>);
    if (result && !req.user?.role) {
      throw new UnauthorizedException('Missing role claim');
    }
    return result;
  }
}
