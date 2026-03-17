import { AutobrrService } from './autobrr.service';

describe('AutobrrService', () => {
  let service: AutobrrService;

  beforeEach(() => {
    service = new AutobrrService();
  });

  it('testConnection returns ok:false when request fails', async () => {
    // Non-existent host will throw
    const result = await service.testConnection('http://localhost:9999', 'bad-key');
    expect(result.ok).toBe(false);
  });
});
