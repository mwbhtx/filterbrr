import type { GeneratedFilter } from './types';
import type { NormalizedTorrent as EngineNormalizedTorrent, SimulationResult, FilterDef, SimulationConfig } from 'filter-engine';
import { runSimulation } from 'filter-engine';
import { TARGET_UTILIZATION_PCT } from './tiers';

// Re-export for use by other modules
export { matchExceptReleases } from 'filter-engine';

/**
 * Calibrate the low-tier filter to fill remaining budget after high+medium.
 *
 * Sweeps max_size (15GB-30GB) and max_downloads/hour (1-10).
 * Returns the best settings and the corresponding simulation result.
 */
export function calibrateLowTier(
  filterJsons: GeneratedFilter[],
  matureTorrents: EngineNormalizedTorrent[],
  storageTb: number,
  targetUtilizationPct: number = TARGET_UTILIZATION_PCT,
): { bestSettings: { rate: number; maxSize: string }; bestSim: SimulationResult } {
  // Find the low-tier filter index
  let lowFilterIdx: number | null = null;
  for (let i = 0; i < filterJsons.length; i++) {
    if (filterJsons[i].name.includes('low')) {
      lowFilterIdx = i;
      break;
    }
  }

  const config: SimulationConfig = { storageTb, avgSeedDays: 7, avgRatio: 1 };
  const asFilterDefs = (fjs: GeneratedFilter[]): FilterDef[] =>
    fjs.map(f => ({ name: f.name, data: f.data as any }));

  if (lowFilterIdx === null) {
    return {
      bestSettings: { rate: 0, maxSize: '30GB' },
      bestSim: runSimulation(matureTorrents as any[], asFilterDefs(filterJsons), config),
    };
  }

  let bestSettings = { rate: 1, maxSize: '30GB' };
  let bestSim: SimulationResult | null = null;
  let bestDiff = Infinity;

  const sizeCaps = ['15GB', '20GB', '25GB', '30GB'];
  const rates = Array.from({ length: 10 }, (_, i) => i + 1);

  for (const maxSize of sizeCaps) {
    for (const rate of rates) {
      const testJsons: GeneratedFilter[] = filterJsons.map((fj, i) => {
        const dataCopy = { ...fj.data };
        if (i === lowFilterIdx) {
          dataCopy.max_downloads = rate;
          dataCopy.max_size = maxSize;
          dataCopy.enabled = true;
        }
        return { name: fj.name, version: fj.version, data: dataCopy };
      });

      const sim = runSimulation(matureTorrents as any[], asFilterDefs(testJsons), config);
      const util = sim.steady_state_avg_utilization;
      const blackouts = sim.blackout_days;
      let diff = Math.abs(util - targetUtilizationPct);

      // Penalize blackout days heavily
      if (blackouts > 0) {
        diff += blackouts * 5;
      }

      if (diff < bestDiff) {
        bestDiff = diff;
        bestSettings = { rate, maxSize };
        bestSim = sim;
      }

      // If this rate already overshoots with blackouts, larger rates will be worse
      if (blackouts > 0) {
        break;
      }
    }
  }

  return {
    bestSettings,
    bestSim: bestSim ?? runSimulation(matureTorrents as any[], asFilterDefs(filterJsons), config),
  };
}
