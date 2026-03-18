import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { CognitoStrategy } from './cognito.strategy';

@Module({
  imports: [PassportModule],
  providers: [CognitoStrategy],
  exports: [CognitoStrategy],
})
export class AuthModule {}
