import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "./api/client";
import type { Filter, FilterData, Dataset, Seedbox, Tracker, SimulationResult, SyncFilterEntry, AnalysisResults } from "./types";
import FilterList from "./components/FilterList";
import FilterForm from "./components/FilterForm";
import MetricsBar from "./components/MetricsBar";
import FilterBreakdown from "./components/FilterBreakdown";
import SimulatorToolbar from "./components/PipelinePanel";
import SettingsPage from "./components/SettingsPage";
import DatasetsPage from "./components/DatasetsPage";
import {
  UtilizationChart,
  DailyGrabsChart,
  GBFlowChart,
  UploadChart,
} from "./components/TimeSeriesChart";
import { GrabbedList, SkippedList } from "./components/TorrentList";

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
  const [originalFilter, setOriginalFilter] = useState<Filter | null>(null);

  // --- Simulation state ---
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>("");
  const [seedboxes, setSeedboxes] = useState<Seedbox[]>([]);
  const [selectedSeedboxId, setSelectedSeedboxId] = useState<string>("");
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [avgSeedDays, setAvgSeedDays] = useState<number>(10);
  const [avgRatio, setAvgRatio] = useState<number>(1.0);

  const selectedSeedbox = seedboxes.find(sb => sb.id === selectedSeedboxId);
  const storageTb = selectedSeedbox?.storage_tb ?? 4;
  const [enabledFilterIds, setEnabledFilterIds] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"simulator" | "datasets" | "settings">("simulator");

  // --- Sync state ---
  const [syncEntries, setSyncEntries] = useState<SyncFilterEntry[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncToast, setSyncToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const syncToastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [dirtyFilterIds, setDirtyFilterIds] = useState<Set<string>>(new Set());

  // --- Analysis state ---
  const [analysisResults, setAnalysisResults] = useState<AnalysisResults | null>(null);

  // --- Load all data ---
  const loadData = useCallback(async () => {
    try {
      const [filtersData, datasetsData, settingsData] = await Promise.all([
        api.getFilters(),
        api.getDatasets(),
        api.getSettings(),
      ]);
      setFilters(filtersData);
      setDatasets(datasetsData);
      setSeedboxes(settingsData.seedboxes);
      setTrackers(settingsData.trackers);
      if (settingsData.seedboxes.length > 0 && !selectedSeedboxId) {
        setSelectedSeedboxId(settingsData.seedboxes[0].id);
      }
      if (datasetsData.length > 0 && !selectedDataset) {
        setSelectedDataset(datasetsData[0].path);
      }
      // Re-fetch analysis results for current dataset
      const currentDs = selectedDataset || (datasetsData.length > 0 ? datasetsData[0].path : "");
      const ds = datasetsData.find(d => d.path === currentDs);
      if (ds?.category) {
        api.getAnalysisResults(ds.category)
          .then(setAnalysisResults)
          .catch(() => setAnalysisResults(null));
      }
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
    refreshSyncStatus();
  }, [loadData]);

  // Fetch analysis results when dataset changes
  useEffect(() => {
    const ds = datasets.find(d => d.path === selectedDataset);
    if (ds?.category) {
      api.getAnalysisResults(ds.category)
        .then(setAnalysisResults)
        .catch(() => setAnalysisResults(null));
    }
  }, [selectedDataset, datasets]);

  // --- Filter handlers ---
  const selectedFilter = filters.find((f) => f._id === selectedId) ?? null;

  const handleSelectFilter = (filter: Filter) => {
    setSelectedId(filter._id);
    setOriginalFilter(JSON.parse(JSON.stringify(filter)));
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
        setDirtyFilterIds((prev) => { const next = new Set(prev); next.delete(selectedId); return next; });
      }
      await loadData();
      setOriginalFilter(null);
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

  // --- Sync helpers ---
  const showSyncToast = (type: "success" | "error", text: string) => {
    setSyncToast({ type, text });
    clearTimeout(syncToastTimer.current);
    syncToastTimer.current = setTimeout(() => setSyncToast(null), 4000);
  };

  const refreshSyncStatus = async () => {
    try {
      const entries = await api.getSyncStatus();
      setSyncEntries(entries);
    } catch {
      // Autobrr not configured — silently ignore
      setSyncEntries([]);
    }
  };

  const handlePushFilter = async (filterId: string) => {
    setSyncingId(filterId);
    try {
      await api.pushFilter(filterId);
      await refreshSyncStatus();
      setDirtyFilterIds((prev) => { const next = new Set(prev); next.delete(filterId); return next; });
      showSyncToast("success", "Pushed to autobrr");
    } catch (err: unknown) {
      showSyncToast("error", err instanceof Error ? err.message : "Push failed");
    } finally {
      setSyncingId(null);
    }
  };

  const handlePullFilter = async (remoteId: number) => {
    setSyncingId(String(remoteId));
    try {
      await api.pullFilter(remoteId);
      await Promise.all([loadData(), refreshSyncStatus()]);
      showSyncToast("success", "Pulled from autobrr");
    } catch (err: unknown) {
      showSyncToast("error", err instanceof Error ? err.message : "Pull failed");
    } finally {
      setSyncingId(null);
    }
  };

  const handlePushAll = async () => {
    setSyncingId("all");
    try {
      await api.pushAll();
      await refreshSyncStatus();
      setDirtyFilterIds(new Set());
      showSyncToast("success", "All filters pushed to autobrr");
    } catch (err: unknown) {
      showSyncToast("error", err instanceof Error ? err.message : "Push all failed");
    } finally {
      setSyncingId(null);
    }
  };

  const handlePullAll = async () => {
    setSyncingId("all");
    try {
      await api.pullAll();
      await Promise.all([loadData(), refreshSyncStatus()]);
      showSyncToast("success", "All filters pulled from autobrr");
    } catch (err: unknown) {
      showSyncToast("error", err instanceof Error ? err.message : "Pull all failed");
    } finally {
      setSyncingId(null);
    }
  };

  // Build sync lookup: filter name -> sync entry
  const syncByName = new Map(syncEntries.map((e) => [e.name, e]));

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
        max_seed_days: avgSeedDays,
        avg_ratio: avgRatio,
      });
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setRunning(false);
    }
  };

  const targetPct = 85;

  return (
    <div className="h-screen bg-gray-950 text-gray-100 flex flex-col overflow-hidden">
      <header className="border-b border-gray-800 px-6 py-3 flex items-center gap-8 flex-shrink-0">
        <h1 className="text-lg font-semibold">Torrent Filter Simulator</h1>
        <nav className="flex gap-1">
          {(["simulator", "datasets", "settings"] as const).map((tab) => (
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
              syncByName={syncByName}
              dirtyIds={dirtyFilterIds}
              syncingId={syncingId}
              onPush={handlePushFilter}
              onPull={handlePullFilter}
              onPushAll={handlePushAll}
              onPullAll={handlePullAll}
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
                      // Restore original filter state if we were editing
                      if (originalFilter && selectedId) {
                        setFilters((prev) =>
                          prev.map((f) => (f._id === originalFilter._id ? originalFilter : f))
                        );
                        setDirtyFilterIds((prev) => { const next = new Set(prev); next.delete(selectedId); return next; });
                      }
                      setShowFilterForm(false);
                      setSelectedId(null);
                      setDraftFilter(null);
                      setIsCreateMode(false);
                      setOriginalFilter(null);
                    }}
                    className="text-gray-500 hover:text-gray-300 text-sm"
                  >
                    Cancel
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
                    analysisResults={analysisResults}
                    readOnly={readOnly ?? false}
                    onSave={handleSave}
                    onDelete={!isCreateMode && selectedId ? handleDelete : undefined}
                    onPromote={!isCreateMode && selectedFilter?._source === "temp" ? handlePromote : undefined}
                    onPush={!isCreateMode && selectedId ? handlePushFilter : undefined}
                    pushing={syncingId === selectedId}
                    onCancel={!isCreateMode && selectedId ? () => {
                      if (originalFilter) {
                        setFilters((prev) =>
                          prev.map((f) => (f._id === originalFilter._id ? originalFilter : f))
                        );
                        setDirtyFilterIds((prev) => { const next = new Set(prev); next.delete(selectedId); return next; });
                        setOriginalFilter(JSON.parse(JSON.stringify(originalFilter)));
                      }
                    } : undefined}
                    isDirty={selectedId ? dirtyFilterIds.has(selectedId) : false}
                    onChange={(updated) => {
                      setFilters((prev) =>
                        prev.map((f) => (f._id === updated._id ? updated : f))
                      );
                      if (updated._id) {
                        setDirtyFilterIds((prev) => new Set([...prev, updated._id]));
                      }
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
            <SimulatorToolbar
              datasets={datasets}
              trackers={trackers}
              selectedDataset={selectedDataset}
              onDatasetChange={setSelectedDataset}
              seedboxes={seedboxes}
              selectedSeedboxId={selectedSeedboxId}
              onSeedboxChange={setSelectedSeedboxId}
              onDataChanged={loadData}
              onGoToSettings={() => setActiveTab("settings")}
              avgSeedDays={avgSeedDays}
            />

            {/* Simulation setup */}
            <div className="rounded-lg bg-gray-900 border border-gray-800 p-5 space-y-4 mb-6">
              <h2 className="text-base font-semibold">Simulation Setup</h2>
              {(trackers.length === 0 || seedboxes.length === 0) && (
                <p className="text-sm text-gray-500 italic">
                  Simulation requires a tracker and seedbox — configure them in Settings.
                </p>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <label className="text-xs text-gray-400">Avg. Seed Days</label>
                    <div className="relative group">
                      <svg className="w-3.5 h-3.5 text-gray-500 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 hidden group-hover:block z-10 pointer-events-none">
                        <div className="bg-gray-800 border border-gray-700 rounded p-2.5 text-xs text-gray-300 shadow-lg">
                          How long torrents typically occupy disk space before your client removes them. Some torrents get deleted in hours after hitting ratio; others sit the full minimum seed time. Use your real average — this directly determines how much storage the simulation budgets per torrent.
                        </div>
                      </div>
                    </div>
                  </div>
                  <input
                    type="number"
                    value={avgSeedDays}
                    onChange={(e) => setAvgSeedDays(Number(e.target.value))}
                    min={1}
                    step={1}
                    className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <label className="text-xs text-gray-400">Avg Ratio</label>
                    <div className="relative group">
                      <svg className="w-3.5 h-3.5 text-gray-500 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 hidden group-hover:block z-10 pointer-events-none">
                        <div className="bg-gray-800 border border-gray-700 rounded p-2.5 text-xs text-gray-300 shadow-lg">
                          Your typical upload-to-download ratio per torrent. A ratio of 1.0 means you upload as much as you download; 2.0 means you upload twice as much. The simulation uses this to estimate total upload across all grabbed torrents — check your client stats for a realistic value.
                        </div>
                      </div>
                    </div>
                  </div>
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
                disabled={running || enabledFilterIds.size === 0 || trackers.length === 0 || seedboxes.length === 0 || !selectedDataset}
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
                <GrabbedList torrents={result.grabbed_torrents} />
                <SkippedList torrents={result.skipped_torrents} />
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "datasets" && (
        <div className="flex-1 overflow-y-auto p-6">
          <DatasetsPage
            trackers={trackers}
            onSelectDataset={(path) => {
              setSelectedDataset(path);
              setActiveTab("simulator");
            }}
          />
        </div>
      )}

      {activeTab === "settings" && (
        <div className="flex-1 overflow-y-auto p-6">
          <SettingsPage />
        </div>
      )}

      {/* Sync toast */}
      {syncToast && (
        <div className={`fixed bottom-4 right-4 px-4 py-2 rounded text-sm shadow-lg transition-opacity ${
          syncToast.type === "success"
            ? "bg-green-900/90 border border-green-700 text-green-200"
            : "bg-red-900/90 border border-red-700 text-red-200"
        }`}>
          {syncToast.text}
        </div>
      )}
    </div>
  );
}

export default App;
