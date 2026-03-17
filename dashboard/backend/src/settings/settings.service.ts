import { Injectable } from '@nestjs/common';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoService } from '../dynamo/dynamo.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

const TABLE = 'UserSettings';

@Injectable()
export class SettingsService {
  constructor(private readonly dynamo: DynamoService) {}

  async get(userId: string): Promise<Record<string, unknown>> {
    const result = await this.dynamo.client.send(
      new GetCommand({ TableName: TABLE, Key: { user_id: userId } })
    );
    return result.Item ?? { user_id: userId, trackers: [], seedboxes: [] };
  }

  async update(userId: string, dto: UpdateSettingsDto): Promise<Record<string, unknown>> {
    const current = await this.get(userId);
    const updated = { ...current, ...dto, user_id: userId };
    await this.dynamo.client.send(new PutCommand({ TableName: TABLE, Item: updated }));
    return updated;
  }
}
