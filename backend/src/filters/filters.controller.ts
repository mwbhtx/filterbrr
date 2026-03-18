import { Controller, Get, Post, Put, Delete, Param, Body, Req, HttpCode } from '@nestjs/common';
import { FiltersService } from './filters.service';
import { CreateFilterDto } from './dto/create-filter.dto';
import { UpdateFilterDto } from './dto/update-filter.dto';

@Controller('filters')
export class FiltersController {
  constructor(private readonly filters: FiltersService) {}

  @Get()
  async list(@Req() req: any) {
    const items = await this.filters.list(req.userId ?? 'dev-user');
    return items.map((item: any) => ({
      _id: item.filter_id,
      _source: item._source ?? 'saved',
      name: item.name,
      version: item.version ?? '1.0',
      data: item.data,
    }));
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateFilterDto) {
    return this.filters.create(req.userId ?? 'dev-user', dto);
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.filters.get(req.userId ?? 'dev-user', id);
  }

  @Put(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateFilterDto) {
    return this.filters.update(req.userId ?? 'dev-user', id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Req() req: any, @Param('id') id: string) {
    return this.filters.delete(req.userId ?? 'dev-user', id);
  }
}
