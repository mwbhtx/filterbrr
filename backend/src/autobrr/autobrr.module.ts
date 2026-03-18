import { Module } from '@nestjs/common';
import { AutobrrService } from './autobrr.service';
import { AutobrrController } from './autobrr.controller';

@Module({ controllers: [AutobrrController], providers: [AutobrrService], exports: [AutobrrService] })
export class AutobrrModule {}
