import { PipelineService } from './pipeline.service';

describe('PipelineService', () => {
  let service: PipelineService;

  beforeEach(() => {
    service = new PipelineService();
  });

  it('startScrape returns a job with running status', async () => {
    const job = await service.startScrape('user-123', { category: 'freeleech' });
    expect(job.status).toBe('running');
    expect(job.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('getJob returns undefined for unknown id', () => {
    expect(service.getJob('nonexistent')).toBeUndefined();
  });

  it('getJob returns the job after startScrape', async () => {
    const job = await service.startScrape('user-123', {});
    expect(service.getJob(job.id)).toBeDefined();
  });
});
