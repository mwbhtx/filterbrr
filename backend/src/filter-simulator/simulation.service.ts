import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { S3Service } from '../s3/s3.service';
import { FiltersService } from '../filters/filters.service';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import {
  runSimulation,
  NormalizedTorrent,
  FilterDef,
  SimulationConfig,
  SimulationResult,
} from 'filter-engine';

interface SimulatorRequest {
  datasetKey: string;
  storageTb: number;
  avgSeedDays: number;
  filterIds: string[];
  avgRatio: number;
  filtersInline?: FilterDef[];
}

@Injectable()
export class FilterSimulatorService {
  constructor(
    private readonly s3: S3Service,
    private readonly filters: FiltersService,
  ) {}

  async run(userId: string, req: SimulatorRequest): Promise<SimulationResult> {
    // Security: validate dataset ownership
    const allowedPrefix = userId.startsWith('demo-') ? 'demo/datasets/' : `${userId}/datasets/`;
    if (!req.datasetKey.startsWith(allowedPrefix)) {
      throw new ForbiddenException('Access denied to this dataset');
    }

    const obj = await this.s3.client.send(
      new GetObjectCommand({ Bucket: this.s3.bucket, Key: req.datasetKey })
    );
    const text = await (obj.Body as { transformToString: () => Promise<string> }).transformToString();

    const parsed = JSON.parse(text);
    const raw = (Array.isArray(parsed) ? parsed : (parsed.torrents ?? [])) as Array<Record<string, unknown>>;

    // Normalize torrents
    const torrents: NormalizedTorrent[] = raw.map((t, i) => ({
      torrent_id: Number(t.torrent_id ?? t.id ?? i),
      name: String(t.name ?? ''),
      date: String(t.date ?? ''),
      size_gb: parseSizeToGb(String(t.size_bytes ?? t.size ?? '0')),
      seeders: Number(t.seeders ?? 0),
      category: String(t.category ?? ''),
      resolution: String(t.resolution ?? ''),
      source: String(t.source ?? ''),
      release_group: String(t.release_group ?? ''),
    }));

    // Load filters from DB if filter_ids provided and no inline filters
    let filterDefs: FilterDef[] = req.filtersInline ?? [];
    if (req.filterIds.length > 0 && filterDefs.length === 0) {
      const allFilters = await this.filters.list(userId);
      const idSet = new Set(req.filterIds);
      filterDefs = allFilters
        .filter((f) => idSet.has(f.filter_id as string))
        .map((f) => ({
          name: f.name as string,
          data: f.data as any,
        }));
    }

    if (filterDefs.length === 0) {
      throw new BadRequestException('At least one filter is required to run a simulation');
    }

    const config: SimulationConfig = {
      storageTb: req.storageTb,
      avgSeedDays: req.avgSeedDays,
      avgRatio: req.avgRatio,
    };

    return runSimulation(torrents, filterDefs, config);
  }
}

function parseSizeToGb(size: string): number {
  if (!size) return 0;
  const match = size.trim().match(/^([\d.]+)\s*(TB|GB|MB|KB)?$/i);
  if (!match) {
    // Plain number — treat as bytes
    const n = parseFloat(size);
    return isNaN(n) ? 0 : n / 1e9;
  }
  const n = parseFloat(match[1]);
  if (isNaN(n)) return 0;
  switch ((match[2] ?? '').toUpperCase()) {
    case 'TB': return n * 1024;
    case 'GB': return n;
    case 'MB': return n / 1024;
    case 'KB': return n / (1024 * 1024);
    default: return n / 1e9; // bare number = bytes
  }
}
