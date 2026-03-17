import { Test } from '@nestjs/testing';
import { DynamoService } from './dynamo.service';

describe('DynamoService', () => {
  let service: DynamoService;

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    const module = await Test.createTestingModule({
      providers: [DynamoService],
    }).compile();
    service = module.get(DynamoService);
  });

  it('should create a DynamoDB document client', () => {
    expect(service.client).toBeDefined();
  });
});
