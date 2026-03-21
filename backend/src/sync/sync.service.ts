import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoService } from '../dynamo/dynamo.service';
import { FiltersService } from '../filters/filters.service';
import { SettingsService } from '../settings/settings.service';
import { AutobrrService } from '../autobrr/autobrr.service';
import { toAutobrrPayload } from '../autobrr/autobrr-filter.schema';

const TABLE = 'SyncState';

interface SyncStateRecord {
  user_id: string;
  mappings: Record<string, number>;
  updated_at: string;
}

@Injectable()
export class SyncService {
  constructor(
    private readonly dynamo: DynamoService,
    private readonly filters: FiltersService,
    private readonly settings: SettingsService,
    private readonly autobrr: AutobrrService,
  ) {}

  async getSyncState(userId: string): Promise<Record<string, number>> {
    const result = await this.dynamo.client.send(
      new GetCommand({ TableName: TABLE, Key: { user_id: userId } })
    );
    return (result.Item as SyncStateRecord | undefined)?.mappings ?? {};
  }

  async pushFilter(userId: string, filterId: string): Promise<Record<string, unknown>> {
    const [filter, userSettings, syncState] = await Promise.all([
      this.filters.get(userId, filterId),
      this.settings.get(userId),
      this.getSyncState(userId),
    ]);

    const { autobrr_url, autobrr_api_key } = userSettings as { autobrr_url?: string; autobrr_api_key?: string };
    if (!autobrr_url || !autobrr_api_key) {
      throw new BadRequestException('autobrr not configured');
    }

    const remoteId = syncState[filterId];
    let remote: Record<string, unknown>;

    const filterName = filter.name as string;
    const suffix = ' [filterbrr]';
    const name = filterName.endsWith(suffix) ? filterName : filterName + suffix;
    const payload = toAutobrrPayload(name, filter.data as Record<string, unknown>);

    if (remoteId) {
      remote = await this.autobrr.updateFilter(autobrr_url, autobrr_api_key, remoteId, payload);
    } else {
      remote = await this.autobrr.createFilter(autobrr_url, autobrr_api_key, payload);
    }

    const updatedState = { ...syncState, [filterId]: remote.id as number };
    await this.dynamo.client.send(
      new PutCommand({
        TableName: TABLE,
        Item: { user_id: userId, mappings: updatedState, updated_at: new Date().toISOString() },
      })
    );

    return remote;
  }

  async pushAll(userId: string): Promise<{ pushed: number }> {
    const filters = await this.filters.list(userId);
    let pushed = 0;
    for (const filter of filters) {
      await this.pushFilter(userId, filter.filter_id as string);
      pushed++;
    }
    return { pushed };
  }

  async pullAll(userId: string): Promise<{ pulled: number }> {
    const [syncState, userSettings] = await Promise.all([
      this.getSyncState(userId),
      this.settings.get(userId),
    ]);

    const { autobrr_url, autobrr_api_key } = userSettings as { autobrr_url?: string; autobrr_api_key?: string };
    if (!autobrr_url || !autobrr_api_key) {
      throw new BadRequestException('autobrr not configured');
    }

    let pulled = 0;
    for (const [, remoteId] of Object.entries(syncState)) {
      await this.autobrr.getFilter(autobrr_url, autobrr_api_key, remoteId);
      pulled++;
    }
    return { pulled };
  }

  async pullFilter(userId: string, filterId: string): Promise<Record<string, unknown>> {
    const [userSettings, syncState] = await Promise.all([
      this.settings.get(userId),
      this.getSyncState(userId),
    ]);

    const { autobrr_url, autobrr_api_key } = userSettings as { autobrr_url?: string; autobrr_api_key?: string };
    if (!autobrr_url || !autobrr_api_key) {
      throw new BadRequestException('autobrr not configured');
    }

    const remoteId = syncState[filterId];
    if (!remoteId) {
      throw new NotFoundException('No remote mapping found for this filter — push it first');
    }

    const remote = await this.autobrr.getFilter(autobrr_url, autobrr_api_key, remoteId);
    return remote;
  }
}
