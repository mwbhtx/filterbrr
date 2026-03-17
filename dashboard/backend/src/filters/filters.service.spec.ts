import { Test } from '@nestjs/testing';
import { FiltersService } from './filters.service';
import { DynamoService } from '../dynamo/dynamo.service';
import { NotFoundException } from '@nestjs/common';

const mockDynamo = { client: { send: jest.fn() } };

describe('FiltersService', () => {
  let service: FiltersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [FiltersService, { provide: DynamoService, useValue: mockDynamo }],
    }).compile();
    service = module.get(FiltersService);
  });

  it('throws NotFoundException when filter not found', async () => {
    mockDynamo.client.send.mockResolvedValue({ Item: undefined });
    await expect(service.get('user-123', 'missing-id')).rejects.toThrow(NotFoundException);
  });

  it('creates a filter with a uuid filter_id', async () => {
    mockDynamo.client.send.mockResolvedValue({});
    const result = await service.create('user-123', { name: 'Test', data: {} });
    expect(result.filter_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('lists filters for a user', async () => {
    mockDynamo.client.send.mockResolvedValue({ Items: [{ user_id: 'user-123', filter_id: 'abc', name: 'Test' }] });
    const result = await service.list('user-123');
    expect(result).toHaveLength(1);
  });
});
