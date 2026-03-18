import { Test } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { DynamoService } from '../dynamo/dynamo.service';

const mockDynamo = {
  client: {
    send: jest.fn(),
  },
};

describe('SettingsService', () => {
  let service: SettingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: DynamoService, useValue: mockDynamo },
      ],
    }).compile();
    service = module.get(SettingsService);
  });

  it('returns default settings when none exist', async () => {
    mockDynamo.client.send.mockResolvedValue({ Item: undefined });
    const result = await service.get('user-123');
    expect(result).toEqual({ user_id: 'user-123', trackers: [], seedboxes: [] });
  });

  it('returns existing settings', async () => {
    mockDynamo.client.send.mockResolvedValue({
      Item: { user_id: 'user-123', trackers: [], seedboxes: [], autobrr_url: 'http://localhost' },
    });
    const result = await service.get('user-123');
    expect(result.autobrr_url).toBe('http://localhost');
  });
});
