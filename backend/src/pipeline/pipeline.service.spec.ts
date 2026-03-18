import { PipelineService } from './pipeline.service';
import { SettingsService } from '../settings/settings.service';
import { JobRepository } from './job.repository';

const mockSettings = {
  get: async () => ({
    trackers: [{ id: 't1', tracker_type: 'TorrentLeech', username: 'user', password: 'pass' }],
  }),
} as unknown as SettingsService;

const mockJobRepo = {
  create: jest.fn(),
  get: jest.fn(),
  updateStatus: jest.fn(),
  updateProgress: jest.fn(),
  setCancelling: jest.fn(),
  isCancelling: jest.fn(),
} as unknown as JobRepository;

describe('PipelineService', () => {
  let service: PipelineService;

  beforeEach(() => {
    jest.clearAllMocks();
    (mockJobRepo.create as jest.Mock).mockResolvedValue(undefined);
    service = new PipelineService(mockSettings, mockJobRepo);
  });

  it('startScrape returns a job_id', async () => {
    const result = await service.startScrape('user-123', { category: 'freeleech', days: 7 });
    expect(result.job_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('getJob returns null for unknown id', async () => {
    (mockJobRepo.get as jest.Mock).mockResolvedValue(null);
    const job = await service.getJob('nonexistent');
    expect(job).toBeNull();
  });

  it('cancelJob calls setCancelling on the repo', async () => {
    await service.cancelJob('job-123');
    expect(mockJobRepo.setCancelling).toHaveBeenCalledWith('job-123');
  });
});
