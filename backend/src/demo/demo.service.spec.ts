import { Test } from '@nestjs/testing';
import { DemoService } from './demo.service';
import { DynamoService } from '../dynamo/dynamo.service';

const mockDynamo = {
  client: { send: jest.fn() },
};

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mock-jwt-token'),
}));

describe('DemoService', () => {
  let service: DemoService;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.DEMO_JWT_SECRET = 'test-secret';
    const module = await Test.createTestingModule({
      providers: [
        DemoService,
        { provide: DynamoService, useValue: mockDynamo },
      ],
    }).compile();
    service = module.get(DemoService);
  });

  it('creates a new demo session and returns a token', async () => {
    mockDynamo.client.send.mockResolvedValueOnce({ Item: undefined });
    mockDynamo.client.send.mockResolvedValueOnce({});
    mockDynamo.client.send.mockResolvedValueOnce({});
    mockDynamo.client.send.mockResolvedValueOnce({});
    mockDynamo.client.send.mockResolvedValueOnce({});

    const result = await service.getOrCreateSession('1.2.3.4');

    expect(result).toHaveProperty('token', 'mock-jwt-token');
    expect(result).toHaveProperty('role', 'demo');
  });

  it('returns existing session token for same IP', async () => {
    mockDynamo.client.send.mockResolvedValueOnce({
      Item: {
        pk: 'demo-session:1.2.3.4',
        user_id: 'demo-existing',
        token: 'existing-token',
        ttl: Math.floor(Date.now() / 1000) + 1800,
      },
    });

    const result = await service.getOrCreateSession('1.2.3.4');

    expect(result).toHaveProperty('token', 'existing-token');
    expect(mockDynamo.client.send).toHaveBeenCalledTimes(1);
  });
});
