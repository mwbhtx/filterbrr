import { Injectable } from '@nestjs/common';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoService } from '../dynamo/dynamo.service';
import { CryptoService } from '../crypto/crypto.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

const TABLE = 'UserSettings';
const SENSITIVE_TRACKER_FIELDS = ['password'] as const;

@Injectable()
export class SettingsService {
  constructor(
    private readonly dynamo: DynamoService,
    private readonly crypto: CryptoService,
  ) {}

  async get(userId: string): Promise<Record<string, unknown>> {
    const result = await this.dynamo.client.send(
      new GetCommand({ TableName: TABLE, Key: { user_id: userId } })
    );
    const item = result.Item ?? { user_id: userId, trackers: [], seedboxes: [] };
    return this.decryptFields(item);
  }

  async update(userId: string, dto: UpdateSettingsDto): Promise<Record<string, unknown>> {
    const current = await this.get(userId);
    const updated = { ...current, ...dto, user_id: userId };
    const encrypted = await this.encryptFields(updated);
    await this.dynamo.client.send(new PutCommand({ TableName: TABLE, Item: encrypted }));
    return updated;
  }

  private async encryptFields(item: Record<string, unknown>): Promise<Record<string, unknown>> {
    const copy = { ...item };
    if (typeof copy.autobrr_api_key === 'string') {
      copy.autobrr_api_key = await this.crypto.encrypt(copy.autobrr_api_key);
    }
    if (Array.isArray(copy.trackers)) {
      copy.trackers = await Promise.all(
        (copy.trackers as Record<string, unknown>[]).map(async (t) => {
          const tc = { ...t };
          for (const field of SENSITIVE_TRACKER_FIELDS) {
            if (typeof tc[field] === 'string') {
              tc[field] = await this.crypto.encrypt(tc[field] as string);
            }
          }
          return tc;
        })
      );
    }
    return copy;
  }

  private async decryptFields(item: Record<string, unknown>): Promise<Record<string, unknown>> {
    const copy = { ...item };
    if (typeof copy.autobrr_api_key === 'string') {
      copy.autobrr_api_key = await this.crypto.decrypt(copy.autobrr_api_key);
    }
    if (Array.isArray(copy.trackers)) {
      copy.trackers = await Promise.all(
        (copy.trackers as Record<string, unknown>[]).map(async (t) => {
          const tc = { ...t };
          for (const field of SENSITIVE_TRACKER_FIELDS) {
            if (typeof tc[field] === 'string') {
              tc[field] = await this.crypto.decrypt(tc[field] as string);
            }
          }
          return tc;
        })
      );
    }
    return copy;
  }
}
