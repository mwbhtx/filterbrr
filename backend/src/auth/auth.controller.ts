import { Controller, Get, Post, Body, Req, UnauthorizedException } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import * as jwt from 'jsonwebtoken';
import { ACL } from './acl';
import { Public } from './public.decorator';

class LocalLoginDto {
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() password?: string;
}

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

  @Public()
  @Post('local-login')
  localLogin(@Body() dto: LocalLoginDto) {
    if (process.env.NODE_ENV !== 'local') {
      throw new UnauthorizedException('Local login is only available in local development');
    }

    // Empty credentials → instant local JWT (no password needed for local dev)
    if (!dto.email && !dto.password) {
      const role = process.env.LOCAL_ROLE ?? 'user';
      const userId = process.env.LOCAL_USER_ID ?? 'local-dev-user';
      const secret = process.env.DEMO_JWT_SECRET;
      if (!secret) throw new UnauthorizedException('DEMO_JWT_SECRET not configured');

      const token = jwt.sign(
        { sub: userId, role, iss: 'filterbrr-local' },
        secret,
        { expiresIn: '30d' },
      );
      return { token, role };
    }

    // Credentials provided → reject (use Cognito auth for real credentials)
    throw new UnauthorizedException('Use Cognito authentication for credential-based login');
  }
}
