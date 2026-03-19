import { Test } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { DynamoService } from '../dynamo/dynamo.service';
import { CryptoService } from '../crypto/crypto.service';

const mockDynamo = {
  client: { send: jest.fn() },
};

const mockCrypto = {
  encrypt: jest.fn((val: string) => Promise.resolve(val ? `enc:${Buffer.from(val).toString('base64')}` : '')),
  decrypt: jest.fn((val: string) => {
    if (!val || !val.startsWith('enc:')) return Promise.resolve(val);
    return Promise.resolve(Buffer.from(val.slice(4), 'base64').toString('utf-8'));
  }),
};

describe('SettingsService', () => {
  let service: SettingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: DynamoService, useValue: mockDynamo },
        { provide: CryptoService, useValue: mockCrypto },
      ],
    }).compile();
    service = module.get(SettingsService);
  });

  it('returns default settings when none exist', async () => {
    mockDynamo.client.send.mockResolvedValue({ Item: undefined });
    const result = await service.get('user-123');
    expect(result).toEqual({ user_id: 'user-123', trackers: [], seedboxes: [] });
  });

  it('decrypts sensitive fields on read', async () => {
    mockDynamo.client.send.mockResolvedValue({
      Item: {
        user_id: 'user-123',
        autobrr_api_key: 'enc:c2VjcmV0',
        trackers: [{ id: 't1', tracker_type: 'TL', username: 'matt', password: 'enc:cGFzcw==' }],
        seedboxes: [],
      },
    });
    const result = await service.get('user-123');
    expect(result.autobrr_api_key).toBe('secret');
    expect((result.trackers as any[])[0].password).toBe('pass');
  });

  it('encrypts sensitive fields on write', async () => {
    mockDynamo.client.send
      .mockResolvedValueOnce({ Item: { user_id: 'user-123', trackers: [], seedboxes: [] } })
      .mockResolvedValueOnce({});

    await service.update('user-123', {
      autobrr_api_key: 'my-key',
      trackers: [{ id: 't1', tracker_type: 'TL', username: 'matt', password: 'my-pass' }],
    });

    expect(mockCrypto.encrypt).toHaveBeenCalledWith('my-key');
    expect(mockCrypto.encrypt).toHaveBeenCalledWith('my-pass');

    const putCall = mockDynamo.client.send.mock.calls[1][0];
    const item = putCall.input.Item;
    expect(item.autobrr_api_key).toBe(`enc:${Buffer.from('my-key').toString('base64')}`);
    expect(item.trackers[0].password).toBe(`enc:${Buffer.from('my-pass').toString('base64')}`);
  });
});
