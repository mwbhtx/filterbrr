import { Controller, Get, Post, Body, Req, UnauthorizedException } from '@nestjs/common';
import { IsString } from 'class-validator';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { ACL } from './acl';
import { Public } from './public.decorator';

class LocalLoginDto {
  @IsString() email: string;
  @IsString() password: string;
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
    if (dto.email !== 'local@filterbrr.com' || dto.password !== 'sCqGfiq4VoVmF&jd') {
      throw new UnauthorizedException('Invalid credentials');
    }
    const role = process.env.LOCAL_ROLE ?? 'user';
    const userId = `local-${randomUUID()}`;
    const secret = process.env.DEMO_JWT_SECRET;
    if (!secret) throw new UnauthorizedException('DEMO_JWT_SECRET not configured');

    const token = jwt.sign(
      { sub: userId, role, iss: 'filterbrr-local' },
      secret,
      { expiresIn: '30d' },
    );
    return { token, role };
  }
}
