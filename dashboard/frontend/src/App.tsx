import { useEffect, useState, useCallback } from "react";
import { api } from "./api/client";
import type { Filter, FilterData, Dataset, AppConfig, SimulationResult } from "./types";
import FilterList from "./components/FilterList";
import FilterForm from "./components/FilterForm";
import MetricsBar from "./components/MetricsBar";
import FilterBreakdown from "./components/FilterBreakdown";
import PipelinePanel from "./components/PipelinePanel";
import SettingsPage from "./components/SettingsPage";
import SyncPage from "./components/SyncPage";
import {
  UtilizationChart,
  DailyGrabsChart,
  GBFlowChart,
  UploadChart,
} from "./components/TimeSeriesChart";

const emptyFilterData: FilterData = {
  enabled: true,
  min_size: "1GB",
  max_size: "30GB",
  delay: 5,
  priority: 1,
  max_downloads: 5,
  max_downloads_unit: "HOUR",
  except_releases: "*Olympics*,*Collection*,*Mega*,*Filmography*",
  announce_types: ["NEW"],
  freeleech: true,
  resolutions: ["1080p"],
  sources: ["WEB-DL", "WEB", "WEBRip"],
  match_categories: "Movies*,TV*",
  is_auto_updated: false,
  release_profile_duplicate: null,
  match_release_groups: "",
  except_release_groups: "",
};

function newFilter(): Filter {
  return { name: "New Filter", version: "1.0", data: { ...emptyFilterData }, _id: "", _source: "saved" };
}

function App() {
  // --- Filter state ---
  const [filters, setFilters] = useState<Filter[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftFilter, setDraftFilter] = useState<Filter | null>(null);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [showFilterForm, setShowFilterForm] = useState(false);

  // --- Simulation state ---
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<string>("");
  const [storageTb, setStorageTb] = useState<number>(4);
  const [maxSeedDays, setMaxSeedDays] = useState<number>(10);
  const [avgRatio, setAvgRatio] = useState<number>(1.0);
  const [enabledFilterIds, setEnabledFilterIds] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"simulator" | "sync" | "settings">("simulator");

  // --- Load all data ---
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
      if (datasetsData.length > 0 && !selectedDataset) {
        setSelectedDataset(datasetsData[0].path);
      }
      setStorageTb(configData.storage_tb);
      setMaxSeedDays(configData.max_seed_days);
      // Pre-select enabled filters
      setEnabledFilterIds((prev) => {
        if (prev.size > 0) return prev;
        return new Set(filtersData.filter((f) => f.data.enabled).map((f) => f._id));
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    }
  }, [selectedDataset]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- Filter handlers ---
  const selectedFilter = filters.find((f) => f._id === selectedId) ?? null;

  const handleSelectFilter = (filter: Filter) => {
    setSelectedId(filter._id);
    setDraftFilter(null);
    setIsCreateMode(false);
    setShowFilterForm(true);
    setError(null);
  };

  const handleCreateNew = () => {
    setSelectedId(null);
    setDraftFilter(newFilter());
    setIsCreateMode(true);
    setShowFilterForm(true);
    setError(null);
  };

  const handleSave = async (filter: Filter) => {
    try {
      if (isCreateMode) {
        const created = await api.createFilter(filter);
        setSelectedId(created._id);
        setDraftFilter(null);
        setIsCreateMode(false);
        // Auto-enable newly created filter in simulation
        setEnabledFilterIds((prev) => new Set([...prev, created._id]));
      } else if (selectedId) {
        await api.updateFilter(selectedId, filter);
      }
      await loadData();
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save filter");
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    try {
      await api.deleteFilter(selectedId);
      setSelectedId(null);
      setShowFilterForm(false);
      setEnabledFilterIds((prev) => {
        const next = new Set(prev);
        next.delete(selectedId);
        return next;
      });
      await loadData();
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete filter");
    }
  };

  const handleDuplicate = () => {
    const source = selectedFilter;
    if (!source) return;
    setDraftFilter({
      name: source.name + "-copy",
      version: source.version,
      data: { ...source.data },
      _id: "",
      _source: "saved",
    });
    setSelectedId(null);
    setIsCreateMode(true);
    setError(null);
  };

  const handlePromote = async () => {
    if (!selectedId) return;
    try {
      const saved = await api.promoteFilter(selectedId);
      setSelectedId(saved._id);
      await loadData();
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save filter");
    }
  };

  const handleClearTemp = async () => {
    try {
      await api.clearTempFilters();
      // If we had a temp filter selected, deselect it
      if (selectedFilter?._source === "temp") {
        setSelectedId(null);
        setShowFilterForm(false);
      }
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to clear temp filters");
    }
  };

  const handleSaveAllTemp = async () => {
    try {
      await api.saveAllTempFilters();
      if (selectedFilter?._source === "temp") {
        setSelectedId(null);
        setShowFilterForm(false);
      }
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save temp filters");
    }
  };

  const currentFilter: Filter | null = isCreateMode
    ? draftFilter
    : selectedFilter;

  const readOnly = false;

  // --- Simulation handlers ---
  const sortedFilters = [...filters].sort((a, b) => b.data.priority - a.data.priority);

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
      const enabledFilters = filters
        .filter((f) => enabledFilterIds.has(f._id))
        .map(({ name, version, data }) => ({ name, version, data }));
      const res = await api.runSimulation({
        dataset_path: selectedDataset,
        filters_inline: enabledFilters,
        storage_tb: storageTb,
        max_seed_days: maxSeedDays,
        avg_ratio: avgRatio,
      });
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setRunning(false);
    }
  };

  const targetPct = config?.target_utilization_pct ?? 85;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <header className="border-b border-gray-800 px-6 py-3 flex items-center gap-8 flex-shrink-0">
        <h1 className="text-lg font-semibold">Torrent Filter Simulator</h1>
        <nav className="flex gap-1">
          {(["simulator", "sync", "settings"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </header>

      {activeTab === "simulator" && (
        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar — filter list */}
          <div className="w-64 flex-shrink-0 border-r border-gray-800 overflow-y-auto">
            <FilterList
              filters={filters}
              selectedId={isCreateMode ? null : selectedId}
              onSelect={handleSelectFilter}
              onCreateNew={handleCreateNew}
              onClearTemp={handleClearTemp}
              onSaveAllTemp={handleSaveAllTemp}
              onDeleteFilter={async (id) => {
                try {
                  await api.deleteFilter(id);
                  if (selectedId === id) { setSelectedId(null); setShowFilterForm(false); }
                  await loadData();
                } catch {}
              }}
            />
          </div>

          {/* Filter form panel — slides in when editing */}
          {showFilterForm && (
            <div className="w-96 flex-shrink-0 border-r border-gray-800 overflow-y-auto bg-gray-950">
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
                    {isCreateMode ? "New Filter" : "Edit Filter"}
                  </h2>
                  <button
                    onClick={() => {
                      setShowFilterForm(false);
                      setSelectedId(null);
                      setDraftFilter(null);
                      setIsCreateMode(false);
                    }}
                    className="text-gray-500 hover:text-gray-300 text-sm"
                  >
                    Close
                  </button>
                </div>

                {error && (
                  <div className="mb-4 flex items-center justify-between rounded bg-red-900/50 border border-red-700 px-3 py-2 text-red-200 text-sm">
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-200">
                      x
                    </button>
                  </div>
                )}

                {currentFilter && (
                  <FilterForm
                    filter={currentFilter}
                    readOnly={readOnly ?? false}
                    onSave={handleSave}
                    onDelete={!isCreateMode && selectedId ? handleDelete : undefined}
                    onPromote={!isCreateMode && selectedFilter?._source === "temp" ? handlePromote : undefined}
                    onChange={(updated) => {
                      setFilters((prev) =>
                        prev.map((f) => (f._id === updated._id ? updated : f))
                      );
                    }}
                  />
                )}
              </div>
            </div>
          )}

          {/* Main content — simulation setup + results */}
          <div className="flex-1 overflow-y-auto p-6">
            {!showFilterForm && error && (
              <div className="mb-4 flex items-center justify-between rounded bg-red-900/50 border border-red-700 px-4 py-2 text-red-200">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="ml-4 text-red-400 hover:text-red-200">Dismiss</button>
              </div>
            )}

            {/* Data Pipeline */}
            <PipelinePanel storageTb={storageTb} onDataChanged={loadData} />

            {/* Simulation setup */}
            <div className="rounded-lg bg-gray-900 border border-gray-800 p-5 space-y-4 mb-6">
              <h2 className="text-base font-semibold">Simulation Setup</h2>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Dataset</label>
                  <select
                    value={selectedDataset}
                    onChange={(e) => setSelectedDataset(e.target.value)}
                    className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100"
                  >
                    {datasets.map((ds) => (
                      <option key={ds.path} value={ds.path}>
                        {ds.filename} ({ds.size_mb} MB)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Storage (TB)</label>
                  <input
                    type="number"
                    value={storageTb}
                    onChange={(e) => setStorageTb(Number(e.target.value))}
                    min={0}
                    step={0.5}
                    className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Max Seed Days</label>
                  <input
                    type="number"
                    value={maxSeedDays}
                    onChange={(e) => setMaxSeedDays(Number(e.target.value))}
                    min={1}
                    step={1}
                    className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Avg Ratio</label>
                  <input
                    type="number"
                    value={avgRatio}
                    onChange={(e) => setAvgRatio(Number(e.target.value))}
                    min={0}
                    step={0.1}
                    className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100"
                  />
                </div>
              </div>

              {/* Filter toggles — compact inline */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Active Filters ({enabledFilterIds.size} of {filters.length})
                </label>
                <div className="flex flex-wrap gap-2">
                  {sortedFilters.map((f) => (
                    <button
                      key={f._id}
                      onClick={() => toggleFilter(f._id)}
                      className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                        enabledFilterIds.has(f._id)
                          ? "bg-blue-900/50 border-blue-600 text-blue-300"
                          : "bg-gray-800 border-gray-700 text-gray-500"
                      }`}
                    >
                      {f.name} (P{f.data.priority})
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleRun}
                disabled={running || enabledFilterIds.size === 0}
                className="rounded bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {running ? "Running..." : "Run Simulation"}
              </button>
            </div>

            {/* Results */}
            {result && (
              <div className="space-y-6">
                <MetricsBar result={result} />
                <FilterBreakdown result={result} />
                <UtilizationChart dailyStats={result.daily_stats} targetPct={targetPct} />
                <div className="grid grid-cols-2 gap-6">
                  <DailyGrabsChart dailyStats={result.daily_stats} />
                  <GBFlowChart dailyStats={result.daily_stats} />
                </div>
                {result.avg_ratio > 0 && (
                  <UploadChart dailyStats={result.daily_stats} />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "sync" && (
        <div className="flex-1 overflow-y-auto p-6">
          <SyncPage />
        </div>
      )}

      {activeTab === "settings" && (
        <div className="flex-1 overflow-y-auto p-6">
          <SettingsPage />
        </div>
      )}
    </div>
  );
}

export default App;
