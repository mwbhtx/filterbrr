import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACL } from './acl';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Skip for @Public() endpoints
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const role: string | undefined = req.user?.role;

    if (!role) throw new ForbiddenException('No role assigned');

    const permissions = ACL[role];
    if (!permissions) throw new ForbiddenException('Unknown role');
    if (permissions === '*') return true;

    const method = req.method.toUpperCase();
    const routePath: string = req.route?.path ?? '';
    const key = `${method} ${routePath}`;

    if (permissions[key]) return true;

    throw new ForbiddenException('Access denied for demo account');
  }
}
