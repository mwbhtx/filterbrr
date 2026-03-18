import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class DemoWriteGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (req.userId === 'demo') {
      const method = req.method.toUpperCase();
      // Allow all GET requests
      if (method === 'GET') return true;
      // Allow simulation, filter generation, and filter CRUD for demo
      const url: string = req.url ?? '';
      if (method === 'POST') {
        if (url.includes('/simulation/run') || url.includes('/pipeline/analyze') || url.includes('/filters')) return true;
      }
      if ((method === 'PUT' || method === 'DELETE') && url.includes('/filters')) return true;
      throw new ForbiddenException('Demo account is read-only');
    }
    return true;
  }
}
