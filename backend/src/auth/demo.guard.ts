import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class DemoWriteGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (req.userId === 'demo') {
      const method = req.method.toUpperCase();
      // Allow all GET requests
      if (method === 'GET') return true;
      // Allow simulation and filter generation for demo
      if (method === 'POST') {
        const url: string = req.url ?? '';
        if (url.includes('/simulation/run') || url.includes('/pipeline/analyze')) return true;
      }
      throw new ForbiddenException('Demo account is read-only');
    }
    return true;
  }
}
