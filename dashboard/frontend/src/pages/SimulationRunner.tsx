import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import type { Filter, Dataset, AppConfig, SimulationResult } from "../types";
import MetricsBar from "../components/MetricsBar";
import FilterBreakdown from "../components/FilterBreakdown";
import {
  UtilizationChart,
  DailyGrabsChart,
  GBFlowChart,
} from "../components/TimeSeriesChart";

export default function SimulationRunner() {
  const [filters, setFilters] = useState<Filter[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);

  const [selectedDataset, setSelectedDataset] = useState<string>("");
  const [storageTb, setStorageTb] = useState<number>(0);
  const [maxSeedDays, setMaxSeedDays] = useState<number>(0);
  const [enabledFilterIds, setEnabledFilterIds] = useState<Set<string>>(new Set());

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [filtersData, datasetsData, configData] = await Promise.all([
        api.getFilters(),
        api.getDatasets(),
        api.getConfig(),
      ]);
      setFilters(filtersData);
      setDatasets(datasetsData);
      setConfig(configData);

      if (datasetsData.length > 0) {
        setSelectedDataset(datasetsData[0].path);
      }
      setStorageTb(configData.storage_tb);
      setMaxSeedDays(configData.max_seed_days);

      // Pre-select enabled filters
      const enabled = new Set(
        filtersData.filter((f) => f.data.enabled).map((f) => f._id)
      );
      setEnabledFilterIds(enabled);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sortedFilters = [...filters].sort(
    (a, b) => b.data.priority - a.data.priority
  );

  const toggleFilter = (id: string) => {
    setEnabledFilterIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.runSimulation({
        dataset_path: selectedDataset,
        filter_ids: Array.from(enabledFilterIds),
        storage_tb: storageTb,
        max_seed_days: maxSeedDays,
      });
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setRunning(false);
    }
  };

  const targetPct = config?.target_utilization_pct ?? 80;

  return (
    <div className="space-y-6">
      {/* Setup section */}
      <div className="rounded-lg bg-gray-900 p-6 space-y-4">
        <h2 className="text-lg font-semibold">Simulation Setup</h2>

        {/* Dataset selector */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Dataset</label>
          <select
            value={selectedDataset}
            onChange={(e) => setSelectedDataset(e.target.value)}
            className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-gray-100"
          >
            {datasets.map((ds) => (
              <option key={ds.path} value={ds.path}>
                {ds.name} ({ds.size_mb.toFixed(1)} MB)
              </option>
            ))}
          </select>
        </div>

        {/* Storage + Max seed days */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Max Storage (TB)
            </label>
            <input
              type="number"
              value={storageTb}
              onChange={(e) => setStorageTb(Number(e.target.value))}
              min={0}
              step={0.1}
              className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Avg. Seed Days
            </label>
            <input
              type="number"
              value={maxSeedDays}
              onChange={(e) => setMaxSeedDays(Number(e.target.value))}
              min={1}
              step={1}
              className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-gray-100"
            />
          </div>
        </div>

        {/* Filter checklist */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">
            Filters ({enabledFilterIds.size} selected)
          </label>
          <div className="max-h-48 overflow-y-auto space-y-1 rounded bg-gray-800 border border-gray-700 p-2">
            {sortedFilters.map((f) => (
              <label
                key={f._id}
                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-700 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={enabledFilterIds.has(f._id)}
                  onChange={() => toggleFilter(f._id)}
                  className="rounded border-gray-600"
                />
                <span className="text-sm text-gray-200 truncate">
                  {f.name}
                </span>
                <span className="ml-auto text-xs text-gray-500">
                  P{f.data.priority}
                </span>
              </label>
            ))}
            {sortedFilters.length === 0 && (
              <p className="text-sm text-gray-500 px-2 py-1">
                No filters available
              </p>
            )}
          </div>
        </div>

        {/* Run button */}
        <button
          onClick={handleRun}
          disabled={running || enabledFilterIds.size === 0}
          className="rounded bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {running ? "Running..." : "Run Simulation"}
        </button>

        {error && (
          <div className="flex items-center justify-between rounded bg-red-900/50 border border-red-700 px-4 py-2 text-red-200">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-4 text-red-400 hover:text-red-200"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Results section */}
      {result && (
        <div className="space-y-6">
          <MetricsBar result={result} targetUtilization={targetPct} />
          <FilterBreakdown result={result} />
          <UtilizationChart
            dailyStats={result.daily_stats}
            targetPct={targetPct}
          />
          <div className="grid grid-cols-2 gap-6">
            <DailyGrabsChart dailyStats={result.daily_stats} />
            <GBFlowChart dailyStats={result.daily_stats} />
          </div>
        </div>
      )}
    </div>
  );
}
