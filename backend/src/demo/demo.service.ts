import { Injectable } from '@nestjs/common';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoService } from '../dynamo/dynamo.service';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { DEMO_FILTERS } from './demo.seed';

const SESSION_TABLE = 'DemoSessions';
const FILTERS_TABLE = 'Filters';
const SESSION_TTL_SECONDS = 1800; // 30 minutes

@Injectable()
export class DemoService {
  private readonly jwtSecret = process.env.DEMO_JWT_SECRET!;

  constructor(private readonly dynamo: DynamoService) {}

  async getOrCreateSession(ip: string): Promise<{ token: string; role: string }> {
    const sessionKey = `demo-session:${ip}`;

    // Check for existing active session
    const existing = await this.dynamo.client.send(
      new GetCommand({ TableName: SESSION_TABLE, Key: { pk: sessionKey } })
    );

    if (existing.Item && existing.Item.ttl > Math.floor(Date.now() / 1000)) {
      return { token: existing.Item.token as string, role: 'demo' };
    }

    // Create new demo session
    const userId = `demo-${randomUUID()}`;
    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;

    const token = jwt.sign(
      { sub: userId, role: 'demo', iss: 'filterbrr-demo' },
      this.jwtSecret,
      { expiresIn: SESSION_TTL_SECONDS },
    );

    // Store session
    await this.dynamo.client.send(new PutCommand({
      TableName: SESSION_TABLE,
      Item: { pk: sessionKey, user_id: userId, token, ttl: expiresAt },
    }));

    // Seed demo filters
    await this.seedDemoData(userId, expiresAt);

    return { token, role: 'demo' };
  }

  private async seedDemoData(userId: string, ttl: number): Promise<void> {
    await Promise.all(
      DEMO_FILTERS.map((filter) =>
        this.dynamo.client.send(new PutCommand({
          TableName: FILTERS_TABLE,
          Item: {
            user_id: userId,
            filter_id: filter._id,
            name: filter.name,
            version: filter.version,
            data: filter.data,
            ttl,
          },
        }))
      )
    );
  }
}
