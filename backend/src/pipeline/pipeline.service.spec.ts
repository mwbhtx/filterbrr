import { PipelineService } from './pipeline.service';
import { SettingsService } from '../settings/settings.service';
import { JobRepository } from './job.repository';

const mockSettings = {
  get: jest.fn().mockResolvedValue({
    trackers: [{ id: 't1', tracker_type: 'TorrentLeech', username: 'user', password: 'pass' }],
  }),
} as unknown as SettingsService;

const mockJobRepo = {
  create: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(),
  updateStatus: jest.fn().mockResolvedValue(undefined),
  updateProgress: jest.fn().mockResolvedValue(undefined),
  setCancelling: jest.fn().mockResolvedValue(undefined),
  isCancelling: jest.fn().mockResolvedValue(false),
} as unknown as JobRepository;

describe('PipelineService', () => {
  let service: PipelineService;

  beforeEach(() => {
    jest.clearAllMocks();
    (mockSettings.get as jest.Mock).mockResolvedValue({
      trackers: [{ id: 't1', tracker_type: 'TorrentLeech', username: 'user', password: 'pass' }],
    });
    service = new PipelineService(mockSettings, mockJobRepo);
  });

  describe('startScrape', () => {
    it('returns a valid UUID job_id', async () => {
      const result = await service.startScrape('user-123', { category: 'freeleech', days: 7 });
      expect(result.job_id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('creates a job in the repository with correct fields', async () => {
      await service.startScrape('user-123', { category: 'freeleech', days: 7 });
      expect(mockJobRepo.create).toHaveBeenCalledTimes(1);
      const job = (mockJobRepo.create as jest.Mock).mock.calls[0][0];
      expect(job.user_id).toBe('user-123');
      expect(job.status).toBe('running');
      expect(job.progress).toBe('Starting...');
      expect(job.function_name).toBe('filterbrr-torrent-scraper');
      expect(job.result).toBeNull();
      expect(job.error).toBeNull();
      expect(job.cancelled).toBe(false);
    });

    it('uses the first tracker when no tracker_id specified', async () => {
      await service.startScrape('user-123', { category: 'freeleech', days: 7 });
      const job = (mockJobRepo.create as jest.Mock).mock.calls[0][0];
      expect(job.payload.trackerUsername).toBe('user');
      expect(job.payload.trackerPassword).toBe('pass');
    });

    it('uses specified tracker_id when provided', async () => {
      (mockSettings.get as jest.Mock).mockResolvedValue({
        trackers: [
          { id: 't1', tracker_type: 'TorrentLeech', username: 'user1', password: 'pass1' },
          { id: 't2', tracker_type: 'TorrentLeech', username: 'user2', password: 'pass2' },
        ],
      });
      await service.startScrape('user-123', { category: 'freeleech', days: 7, tracker_id: 't2' });
      const job = (mockJobRepo.create as jest.Mock).mock.calls[0][0];
      expect(job.payload.trackerUsername).toBe('user2');
    });

    it('throws when no tracker is configured', async () => {
      (mockSettings.get as jest.Mock).mockResolvedValue({ trackers: [] });
      await expect(service.startScrape('user-123', { category: 'freeleech', days: 7 }))
        .rejects.toThrow('No tracker configured');
    });

    it('builds correct command string', async () => {
      await service.startScrape('user-123', { category: 'movies', days: 30 });
      const job = (mockJobRepo.create as jest.Mock).mock.calls[0][0];
      expect(job.command).toBe('scrape TorrentLeech movies 30d');
    });

    it('defaults startPage to 1', async () => {
      await service.startScrape('user-123', { category: 'freeleech', days: 7 });
      const job = (mockJobRepo.create as jest.Mock).mock.calls[0][0];
      expect(job.payload.startPage).toBe(1);
    });
  });

  describe('startGenerateFilters', () => {
    it('returns a valid UUID job_id', async () => {
      const result = await service.startGenerateFilters('user-123', {
        source: 'freeleech', dataset_path: 'user-123/datasets/test.csv',
      });
      expect(result.job_id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('creates a job with correct function_name', async () => {
      await service.startGenerateFilters('user-123', {
        source: 'freeleech', dataset_path: 'user-123/datasets/test.csv',
      });
      const job = (mockJobRepo.create as jest.Mock).mock.calls[0][0];
      expect(job.function_name).toBe('filterbrr-filter-generator');
      expect(job.status).toBe('running');
      expect(job.progress).toBe('Starting...');
    });

    it('throws when dataset_path is missing', async () => {
      await expect(service.startGenerateFilters('user-123', { source: 'freeleech' }))
        .rejects.toThrow('dataset_path is required');
    });

    it('defaults storageTb to 4 and seedDays to 30', async () => {
      await service.startGenerateFilters('user-123', {
        source: 'freeleech', dataset_path: 'test.csv',
      });
      const job = (mockJobRepo.create as jest.Mock).mock.calls[0][0];
      expect(job.payload.storageTb).toBe(4);
      expect(job.payload.seedDays).toBe(30);
    });

    it('uses provided storageTb and seedDays', async () => {
      await service.startGenerateFilters('user-123', {
        source: 'freeleech', dataset_path: 'test.csv', storage_tb: 8, avg_seed_days: 14,
      });
      const job = (mockJobRepo.create as jest.Mock).mock.calls[0][0];
      expect(job.payload.storageTb).toBe(8);
      expect(job.payload.seedDays).toBe(14);
    });
  });

  describe('getJob', () => {
    it('returns null for unknown id', async () => {
      (mockJobRepo.get as jest.Mock).mockResolvedValue(null);
      expect(await service.getJob('nonexistent')).toBeNull();
    });

    it('returns the job from repository', async () => {
      const fakeJob = { job_id: 'j1', status: 'running' };
      (mockJobRepo.get as jest.Mock).mockResolvedValue(fakeJob);
      expect(await service.getJob('j1')).toBe(fakeJob);
    });
  });

  describe('cancelJob', () => {
    it('calls setCancelling on the repository', async () => {
      await service.cancelJob('job-123');
      expect(mockJobRepo.setCancelling).toHaveBeenCalledWith('job-123');
    });
  });
});
