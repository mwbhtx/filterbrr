import { JobRepository, Job } from './job.repository';
import { DynamoService } from '../dynamo/dynamo.service';

const mockSend = jest.fn();
const mockDynamo = {
  client: { send: mockSend },
} as unknown as DynamoService;

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    job_id: 'job-1',
    user_id: 'user-1',
    command: 'scrape TorrentLeech freeleech 7d',
    function_name: 'filterbrr-torrent-scraper',
    payload: {},
    status: 'running',
    progress: 'Starting...',
    result: null,
    error: null,
    cancelled: false,
    started_at: '2026-03-18T00:00:00.000Z',
    updated_at: '2026-03-18T00:00:00.000Z',
    completed_at: null,
    ...overrides,
  };
}

describe('JobRepository', () => {
  let repo: JobRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({});
    repo = new JobRepository(mockDynamo);
  });

  describe('create', () => {
    it('sends a PutCommand with the job', async () => {
      const job = makeJob();
      await repo.create(job);
      expect(mockSend).toHaveBeenCalledTimes(1);
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input).toEqual({ TableName: 'Jobs', Item: { ...job, ttl: expect.any(Number) } });
    });
  });

  describe('get', () => {
    it('returns the job when found', async () => {
      const job = makeJob();
      mockSend.mockResolvedValue({ Item: job });
      const result = await repo.get('job-1');
      expect(result).toEqual(job);
    });

    it('returns null when not found', async () => {
      mockSend.mockResolvedValue({});
      const result = await repo.get('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('updates status only when no optional params given', async () => {
      await repo.updateStatus('job-1', 'completed');
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.UpdateExpression).toBe('SET #s = :s, updated_at = :u, completed_at = :ca');
      expect(cmd.input.ExpressionAttributeValues[':s']).toBe('completed');
      expect(cmd.input.ExpressionAttributeValues[':ca']).toBeDefined();
    });

    it('includes progress when provided', async () => {
      await repo.updateStatus('job-1', 'running', 'Scraping day 5 of 30');
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.UpdateExpression).toContain('progress = :p');
      expect(cmd.input.ExpressionAttributeValues[':p']).toBe('Scraping day 5 of 30');
    });

    it('includes result when provided', async () => {
      await repo.updateStatus('job-1', 'completed', undefined, { key: 'test.csv' });
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.UpdateExpression).toContain('#r = :r');
      expect(cmd.input.ExpressionAttributeValues[':r']).toEqual({ key: 'test.csv' });
    });

    it('includes error when provided', async () => {
      await repo.updateStatus('job-1', 'failed', undefined, undefined, 'Something broke');
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.UpdateExpression).toContain('#e = :e');
      expect(cmd.input.ExpressionAttributeValues[':e']).toBe('Something broke');
    });

    it('includes all optional params together', async () => {
      await repo.updateStatus('job-1', 'completed', 'Done', { key: 'x' }, 'warn');
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.UpdateExpression).toContain('progress = :p');
      expect(cmd.input.UpdateExpression).toContain('#r = :r');
      expect(cmd.input.UpdateExpression).toContain('#e = :e');
    });
  });

  describe('updateProgress', () => {
    it('updates progress and updated_at', async () => {
      await repo.updateProgress('job-1', 'Scraping day 3 of 30 (150 torrents)');
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.UpdateExpression).toBe('SET progress = :p, updated_at = :u');
      expect(cmd.input.ExpressionAttributeValues[':p']).toBe('Scraping day 3 of 30 (150 torrents)');
    });
  });

  describe('setCancelling', () => {
    it('sets status to cancelling with progress message', async () => {
      await repo.setCancelling('job-1');
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.ExpressionAttributeValues[':s']).toBe('cancelling');
      expect(cmd.input.ExpressionAttributeValues[':p']).toBe('Cancelling...');
    });
  });

  describe('isCancelling', () => {
    it('returns true when status is cancelling', async () => {
      mockSend.mockResolvedValue({ Item: makeJob({ status: 'cancelling' }) });
      expect(await repo.isCancelling('job-1')).toBe(true);
    });

    it('returns false when status is running', async () => {
      mockSend.mockResolvedValue({ Item: makeJob({ status: 'running' }) });
      expect(await repo.isCancelling('job-1')).toBe(false);
    });

    it('returns false when job not found', async () => {
      mockSend.mockResolvedValue({});
      expect(await repo.isCancelling('nonexistent')).toBe(false);
    });
  });
});
