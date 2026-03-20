import { FilterSimulatorService } from './simulation.service';
import { S3Service } from '../s3/s3.service';
import { FiltersService } from '../filters/filters.service';

describe('FilterSimulatorService', () => {
  it('can be instantiated', () => {
    const service = new FilterSimulatorService({} as S3Service, {} as FiltersService);
    expect(service).toBeDefined();
  });
});
