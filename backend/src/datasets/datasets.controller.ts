import { Controller, Get, Delete, Param, Req, HttpCode } from '@nestjs/common';
import { DatasetsService } from './datasets.service';

@Controller('datasets')
export class DatasetsController {
  constructor(private readonly datasets: DatasetsService) {}

  @Get()
  list(@Req() req: any) {
    return this.datasets.list(req.user.userId, req.user.role);
  }

  @Delete(':filename')
  @HttpCode(204)
  delete(@Req() req: any, @Param('filename') filename: string) {
    return this.datasets.delete(req.user.userId, filename);
  }
}
