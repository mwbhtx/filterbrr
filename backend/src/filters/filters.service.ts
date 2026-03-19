import { Injectable, NotFoundException } from '@nestjs/common';
import { GetCommand, PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoService } from '../dynamo/dynamo.service';
import { CreateFilterDto } from './dto/create-filter.dto';
import { UpdateFilterDto } from './dto/update-filter.dto';
import { randomUUID } from 'crypto';

const TABLE = 'Filters';

const DEMO_FILTERS = [
  {
    name: 'Small Freeleech',
    version: '1',
    data: {
      enabled: true,
      min_size: '100 MB',
      max_size: '2 GB',
      delay: 0,
      priority: 1,
      max_downloads: 20,
      max_downloads_unit: 'DAY',
      except_releases: '',
      announce_types: [],
      freeleech: true,
      resolutions: [],
      sources: [],
      match_categories: '',
      is_auto_updated: false,
      release_profile_duplicate: null,
      match_release_groups: '',
      except_release_groups: '',
    },
  },
  {
    name: 'Medium Freeleech',
    version: '1',
    data: {
      enabled: true,
      min_size: '2 GB',
      max_size: '10 GB',
      delay: 0,
      priority: 2,
      max_downloads: 10,
      max_downloads_unit: 'DAY',
      except_releases: '',
      announce_types: [],
      freeleech: true,
      resolutions: [],
      sources: [],
      match_categories: '',
      is_auto_updated: false,
      release_profile_duplicate: null,
      match_release_groups: '',
      except_release_groups: '',
    },
  },
  {
    name: 'Large Freeleech',
    version: '1',
    data: {
      enabled: true,
      min_size: '10 GB',
      max_size: '50 GB',
      delay: 0,
      priority: 3,
      max_downloads: 3,
      max_downloads_unit: 'DAY',
      except_releases: '',
      announce_types: [],
      freeleech: true,
      resolutions: [],
      sources: [],
      match_categories: '',
      is_auto_updated: false,
      release_profile_duplicate: null,
      match_release_groups: '',
      except_release_groups: '',
    },
  },
];

@Injectable()
export class FiltersService {
  constructor(private readonly dynamo: DynamoService) {}

  async list(userId: string): Promise<Record<string, unknown>[]> {
    if (userId === 'demo') {
      await this.ensureDemoFilters();
    }
    const result = await this.dynamo.client.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'user_id = :uid',
        ExpressionAttributeValues: { ':uid': userId },
      })
    );
    return (result.Items ?? []) as Record<string, unknown>[];
  }

  private async ensureDemoFilters(): Promise<void> {
    const result = await this.dynamo.client.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'user_id = :uid',
        ExpressionAttributeValues: { ':uid': 'demo' },
      })
    );
    if ((result.Items ?? []).length > 0) return;
    for (const filter of DEMO_FILTERS) {
      await this.create('demo', filter as CreateFilterDto);
    }
  }

  async get(userId: string, filterId: string): Promise<Record<string, unknown>> {
    const result = await this.dynamo.client.send(
      new GetCommand({ TableName: TABLE, Key: { user_id: userId, filter_id: filterId } })
    );
    if (!result.Item) throw new NotFoundException('Filter not found');
    return result.Item as Record<string, unknown>;
  }

  async create(userId: string, dto: CreateFilterDto): Promise<Record<string, unknown>> {
    const item = {
      user_id: userId,
      filter_id: randomUUID(),
      ...dto,
      created_at: new Date().toISOString(),
    };
    await this.dynamo.client.send(new PutCommand({ TableName: TABLE, Item: item }));
    return item;
  }

  async update(userId: string, filterId: string, dto: UpdateFilterDto): Promise<Record<string, unknown>> {
    const existing = await this.get(userId, filterId);
    const updated = { ...existing, ...dto, updated_at: new Date().toISOString() };
    await this.dynamo.client.send(new PutCommand({ TableName: TABLE, Item: updated }));
    return updated;
  }

  async delete(userId: string, filterId: string): Promise<void> {
    await this.get(userId, filterId);
    await this.dynamo.client.send(
      new DeleteCommand({ TableName: TABLE, Key: { user_id: userId, filter_id: filterId } })
    );
  }
}
