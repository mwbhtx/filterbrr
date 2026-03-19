import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class DemoWriteGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    // req.user is set by Passport via CognitoAuthGuard (runs before this guard)
    const role = req.user?.role;
    if (role === 'demo') {
      const method = req.method.toUpperCase();
      if (method === 'GET') return true;
      // Allow simulation, filter generation, and filter CRUD for demo
      const path: string = req.route?.path ?? req.url ?? '';
      if (method === 'POST') {
        if (path.includes('/simulation/run') || path.includes('/pipeline/analyze') || path.includes('/filters')) return true;
      }
      if ((method === 'PUT' || method === 'DELETE') && path.includes('/filters')) return true;
      throw new ForbiddenException('Demo account is read-only');
    }
    return true;
  }
}
