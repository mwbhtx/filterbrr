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

    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing token');
    }
    const token = authHeader.slice(7);

    // Try self-signed JWT first (demo + local tokens, cheap local secret verification)
    const jwtSecret = process.env.DEMO_JWT_SECRET;
    if (jwtSecret) {
      try {
        const payload = jwt.verify(token, jwtSecret) as { sub: string; role: string; iss: string };
        if (!payload.role) throw new UnauthorizedException('Missing role claim');
        req.user = { userId: payload.sub, role: payload.role };
        return true;
      } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
          throw new UnauthorizedException('Session expired');
        }
        // Not a self-signed token — fall through to Cognito
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
