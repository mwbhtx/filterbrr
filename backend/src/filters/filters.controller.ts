import { Controller, Get, Post, Put, Delete, Param, Body, Req, HttpCode } from '@nestjs/common';
import { FiltersService } from './filters.service';
import { CreateFilterDto } from './dto/create-filter.dto';
import { UpdateFilterDto } from './dto/update-filter.dto';

/** Map a DynamoDB item to the shape the frontend expects. */
function toFilterResponse(item: Record<string, unknown>) {
  const res: Record<string, unknown> = {
    _id: item.filter_id,
    _source: item._source ?? 'saved',
    name: item.name,
    version: item.version ?? '1.0',
    data: item.data,
  };
  if (item.tracker_type) res.tracker_type = item.tracker_type;
  return res;
}

@Controller('filters')
export class FiltersController {
  constructor(private readonly filters: FiltersService) {}

  @Get()
  async list(@Req() req: any) {
    const items = await this.filters.list(req.user.userId);
    return items.map(toFilterResponse);
  }

  @Post()
  async create(@Req() req: any, @Body() dto: CreateFilterDto) {
    const item = await this.filters.create(req.user.userId, dto);
    return toFilterResponse(item);
  }

  @Get(':id')
  async get(@Req() req: any, @Param('id') id: string) {
    const item = await this.filters.get(req.user.userId, id);
    return toFilterResponse(item);
  }

  @Put(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateFilterDto) {
    const item = await this.filters.update(req.user.userId, id, dto);
    return toFilterResponse(item);
  }

  @Post(':id/promote')
  async promote(@Req() req: any, @Param('id') id: string) {
    const item = await this.filters.promote(req.user.userId, id);
    return toFilterResponse(item);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Req() req: any, @Param('id') id: string) {
    return this.filters.delete(req.user.userId, id);
  }
}
