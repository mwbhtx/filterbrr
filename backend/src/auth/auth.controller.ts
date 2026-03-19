import { Controller, Get, Req } from '@nestjs/common';
import { ACL } from './acl';

@Controller('auth')
export class AuthController {
  @Get('me')
  me(@Req() req: any) {
    const role: string = req.user.role;
    const permissions = ACL[role];
    return {
      userId: req.user.userId,
      role,
      fullAccess: permissions === '*',
    };
  }
}
