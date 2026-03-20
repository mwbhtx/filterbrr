export * from './types';

import { NormalizedTorrent, FilterData, FilterDef, SimulationConfig, SimulationResult } from './types';

// Stubs — implemented in Task 2
export function parseSizeStr(s: string): number { return 0; }
export function torrentMatchesFilter(torrent: NormalizedTorrent, filterData: FilterData): boolean { return false; }
export function runSimulation(torrents: NormalizedTorrent[], filters: FilterDef[], config: SimulationConfig): SimulationResult {
  return {} as SimulationResult;
}
