import { Controller, Post, Body } from '@nestjs/common';
import { AutobrrService } from './autobrr.service';
import { IsString, IsNotEmpty } from 'class-validator';

class TestConnectionDto {
  @IsString() @IsNotEmpty() autobrr_url: string;
  @IsString() @IsNotEmpty() autobrr_api_key: string;
}

@Controller('autobrr')
export class AutobrrController {
  constructor(private readonly autobrr: AutobrrService) {}

  @Post('test')
  test(@Body() dto: TestConnectionDto) {
    return this.autobrr.testConnection(dto.autobrr_url, dto.autobrr_api_key);
  }
}
