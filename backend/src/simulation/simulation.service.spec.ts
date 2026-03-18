import { SimulationService } from './simulation.service';
import { S3Service } from '../s3/s3.service';

describe('SimulationService.simulate', () => {
  let service: SimulationService;

  beforeEach(() => {
    service = new SimulationService({} as S3Service);
  });

  it('returns zero grabs for empty dataset', () => {
    const result = service.simulate([], {
      datasetKey: '',
      storageTb: 4,
      seedDays: 10,
      filterIds: [],
      avgRatio: 2,
    });
    expect(result.total_grabbed).toBe(0);
    expect(result.grab_rate_pct).toBe(0);
  });

  it('grabs all torrents within storage limit', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      date: '2026-03-17',
      size: '1 GB',
      name: `T${i}`,
      seeders: 10,
    }));
    const result = service.simulate(rows, {
      datasetKey: '',
      storageTb: 4,
      seedDays: 10,
      filterIds: [],
      avgRatio: 2,
    });
    expect(result.total_grabbed).toBe(10);
  });

  it('grab rate is 100 when all torrents fit', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ date: '2026-03-17', size: '1 GB', name: `T${i}`, seeders: 5 }));
    const result = service.simulate(rows, { datasetKey: '', storageTb: 10, seedDays: 10, filterIds: [], avgRatio: 2 });
    expect(result.grab_rate_pct).toBe(100);
  });
});
