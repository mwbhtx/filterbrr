import { useState, useEffect } from "react";
import { api } from "../api/client";
import { useDatasets } from "../hooks/useDatasets";
import { useFilters, useDeleteFilter } from "../hooks/useFilters";
import type { SimulationResult, AnalysisResults, Filter, Dataset, AutobrrConnectionStatus } from "../types";
import MetricsBar from "../components/MetricsBar";
import FilterBreakdownTable from "../components/FilterBreakdown";
import { UtilizationChart, DailyGrabsChart, GBFlowChart, UploadChart } from "../components/TimeSeriesChart";
import { GrabbedList, SkippedList } from "../components/TorrentList";
import FilterList from "../components/FilterList";
import FilterForm from "../components/FilterForm";
import JobRunner from "../components/JobRunner";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const selectCls =
  "w-full rounded bg-muted border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50";

const genTempId = () => `temp_${Math.random().toString(36).slice(2, 10)}`;

function datasetLabel(ds: Dataset): string {
  let label = ds.scraped_at ?? ds.category;
  if (ds.min_date && ds.max_date) {
    const days = Math.round(
      (new Date(ds.max_date).getTime() - new Date(ds.min_date).getTime()) / 86400000
    ) + 1;
    label += ` · ${days} day${days !== 1 ? "s" : ""}`;
  }
  if (ds.torrent_count != null) {
    label += ` · ${ds.torrent_count} torrents`;
  }
  return label;
}

export default function SimulatorPage() {
  const { data: datasets = [] } = useDatasets();
  const { data: persistedFilters = [], refetch: refetchFilters } = useFilters();
  const deleteFilterMutation = useDeleteFilter();

  // Data context state — restore from localStorage
  const stored = JSON.parse(localStorage.getItem('simulator-settings') ?? '{}');
  const [selectedDataset, setSelectedDataset] = useState(stored.dataset ?? "");
  const [storageTb, setStorageTb] = useState(stored.storageTb ?? 4);
  const [maxSeedDays, setMaxSeedDays] = useState(stored.maxSeedDays ?? 10);
  const [avgRatio, setAvgRatio] = useState(stored.avgRatio ?? 0.8);

  // Persist settings to localStorage on change
  useEffect(() => {
    localStorage.setItem('simulator-settings', JSON.stringify({
      dataset: selectedDataset,
      storageTb,
      maxSeedDays,
      avgRatio,
    }));
  }, [selectedDataset, storageTb, maxSeedDays, avgRatio]);

  // Simulation state
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResults | null>(null);
  const [running, setRunning] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [activeChart, setActiveChart] = useState<"utilization" | "grabs" | "flow" | "upload">("utilization");

  // Generate filters state
  const [generateJobId, setGenerateJobId] = useState<string | null>(
    () => localStorage.getItem('active-generate-job')
  );
  const [generating, setGenerating] = useState(() => !!localStorage.getItem('active-generate-job'));

  // Filter state
  const [tempFilters, setTempFilters] = useState<Filter[]>([]);
  const [dirtyMap, setDirtyMap] = useState<Map<string, Filter>>(new Map());
  const [selectedFilterId, setSelectedFilterId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<AutobrrConnectionStatus | null>(null);
  const [checkingConnection, setCheckingConnection] = useState(false);

  // Combine persistent + temp filters
  const allFilters: Filter[] = [
    ...persistedFilters.map((f) =>
      dirtyMap.has(f._id) ? (dirtyMap.get(f._id) as Filter) : f
    ),
    ...tempFilters,
  ];
  const dirtyIds = new Set(dirtyMap.keys());
  const selectedFilter = allFilters.find((f) => f._id === selectedFilterId) ?? null;

  // All datasets sorted by scraped_at desc
  const sortedDatasets = [...datasets].sort((a, b) => {
    if (a.scraped_at && b.scraped_at) return b.scraped_at.localeCompare(a.scraped_at);
    if (a.scraped_at) return -1;
    if (b.scraped_at) return 1;
    return 0;
  });

  // Auto-select dataset: if stored dataset no longer exists, pick first available
  useEffect(() => {
    const current = datasets.find(d => d.path === selectedDataset);
    if (!current) {
      const first = sortedDatasets[0];
      if (first) setSelectedDataset(first.path);
      else if (selectedDataset) setSelectedDataset("");
    }
  }, [datasets]);

  // Generate filters
  const selectedDs = datasets.find(d => d.path === selectedDataset);
  const source = selectedDs?.category ?? "freeleech";

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { job_id } = await api.startAnalyze({
        source,
        storage_tb: storageTb,
        dataset_path: selectedDataset,
        seed_days: maxSeedDays,
      });
      setGenerateJobId(job_id);
      localStorage.setItem('active-generate-job', job_id);
    } catch {
      setGenerating(false);
    }
  };

  const handleGenerateComplete = () => {
    setGenerating(false);
    localStorage.removeItem('active-generate-job');
    refetchFilters();
    if (selectedDs) {
      api.getAnalysisResults(selectedDs.category).then(setAnalysisResults).catch(() => {});
    }
  };

  // Simulation
  const handleRunSimulation = async () => {
    if (!selectedDataset) return;
    setRunning(true);
    setSimError(null);
    try {
      const result = await api.runSimulation({
        dataset_path: selectedDataset,
        storage_tb: storageTb,
        max_seed_days: maxSeedDays,
        avg_ratio: avgRatio,
      });
      setSimResult(result);
    } catch (err: unknown) {
      setSimError(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setRunning(false);
    }
  };

  // Filter handlers
  const handleCreateNew = () => {
    const newFilter: Filter = {
      _id: genTempId(),
      _source: "temp",
      name: "New Filter",
      version: "1",
      data: {
        enabled: true,
        min_size: "",
        max_size: "",
        delay: 0,
        priority: 0,
        max_downloads: 0,
        max_downloads_unit: "DAY",
        except_releases: "",
        announce_types: [],
        freeleech: false,
        resolutions: [],
        sources: [],
        match_categories: "",
        is_auto_updated: false,
        release_profile_duplicate: null,
        match_release_groups: "",
        except_release_groups: "",
      },
    };
    setTempFilters((prev) => [...prev, newFilter]);
    setSelectedFilterId(newFilter._id);
  };

  const handleFilterSave = async (filter: Filter) => {
    setFilterError(null);
    try {
      if (filter._source === "temp") {
        const { _id, _source, ...body } = filter;
        void _source;
        if (_id.startsWith("temp_")) {
          const created = await api.createFilter(body);
          setTempFilters((prev) => prev.filter((f) => f._id !== _id));
          setDirtyMap((prev) => { const next = new Map(prev); next.delete(_id); return next; });
          await refetchFilters();
          setSelectedFilterId(created._id);
        } else {
          await api.promoteFilter(_id);
          await refetchFilters();
          setSelectedFilterId(_id);
        }
      } else if (filter._source === "generated") {
        await api.promoteFilter(filter._id);
        await refetchFilters();
        setSelectedFilterId(filter._id);
      } else {
        const { _id, _source, ...body } = filter;
        void _source;
        await api.updateFilter(_id, body);
        setDirtyMap((prev) => { const next = new Map(prev); next.delete(_id); return next; });
        await refetchFilters();
      }
    } catch (err: unknown) {
      setFilterError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleFilterDelete = async () => {
    if (!selectedFilter) return;
    setFilterError(null);
    try {
      if (selectedFilter._source === "temp") {
        setTempFilters((prev) => prev.filter((f) => f._id !== selectedFilter._id));
        setSelectedFilterId(null);
      } else {
        await deleteFilterMutation.mutateAsync(selectedFilter._id);
        setDirtyMap((prev) => { const next = new Map(prev); next.delete(selectedFilter._id); return next; });
        setSelectedFilterId(null);
      }
    } catch (err: unknown) {
      setFilterError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleDeleteTemp = (id: string) => {
    setTempFilters((prev) => prev.filter((f) => f._id !== id));
    if (selectedFilterId === id) setSelectedFilterId(null);
  };

  const handleClearTemp = () => {
    setTempFilters([]);
    if (selectedFilter?._source === "temp") setSelectedFilterId(null);
  };

  const handleSaveAllTemp = async () => {
    setFilterError(null);
    try {
      await api.saveAllTempFilters();
      setTempFilters([]);
      await refetchFilters();
    } catch (err: unknown) {
      setFilterError(err instanceof Error ? err.message : "Save all failed");
    }
  };

  const handleFilterChange = (updated: Filter) => {
    if (updated._source === "temp") {
      setTempFilters((prev) => prev.map((f) => (f._id === updated._id ? updated : f)));
    } else {
      setDirtyMap((prev) => new Map(prev).set(updated._id, updated));
    }
  };

  const handleFilterCancel = () => {
    if (!selectedFilter) return;
    setDirtyMap((prev) => { const next = new Map(prev); next.delete(selectedFilter._id); return next; });
  };

  const handlePush = async (filterId: string) => {
    setSyncingId(filterId);
    setFilterError(null);
    try { await api.pushFilter(filterId); }
    catch (err: unknown) { setFilterError(err instanceof Error ? err.message : "Push failed"); }
    finally { setSyncingId(null); }
  };

  const handlePushAll = async () => {
    setSyncingId("all");
    setFilterError(null);
    try { await api.pushAll(); }
    catch (err: unknown) { setFilterError(err instanceof Error ? err.message : "Push all failed"); }
    finally { setSyncingId(null); }
  };

  const handlePull = async (remoteId: number) => {
    setSyncingId(String(remoteId));
    setFilterError(null);
    try { await api.pullFilter(remoteId); await refetchFilters(); }
    catch (err: unknown) { setFilterError(err instanceof Error ? err.message : "Pull failed"); }
    finally { setSyncingId(null); }
  };

  const handlePullAll = async () => {
    setSyncingId("all");
    setFilterError(null);
    try { await api.pullAll(); await refetchFilters(); }
    catch (err: unknown) { setFilterError(err instanceof Error ? err.message : "Pull all failed"); }
    finally { setSyncingId(null); }
  };

  const handleCheckConnection = async () => {
    setCheckingConnection(true);
    try {
      const status = await api.getAutobrrStatus();
      setConnectionStatus(status);
    } catch {
      setConnectionStatus({ connected: false, error: "Autobrr not configured" });
    } finally {
      setCheckingConnection(false);
    }
  };

  const isDirty = selectedFilter ? dirtyIds.has(selectedFilter._id) : false;

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden -mx-6 -my-4">
      {/* Column 1: Filters */}
      <div className="w-56 shrink-0 border-r border-border overflow-hidden">
        <FilterList
          filters={allFilters}
          selectedId={selectedFilterId}
          onSelect={(f) => setSelectedFilterId(f._id)}
          onCreateNew={handleCreateNew}
          onClearTemp={handleClearTemp}
          onSaveAllTemp={handleSaveAllTemp}
          onDeleteFilter={handleDeleteTemp}
          dirtyIds={dirtyIds}
          syncingId={syncingId}
          onPush={handlePush}
          onPull={handlePull}
          onPushAll={handlePushAll}
          onPullAll={handlePullAll}
          onCheckConnection={handleCheckConnection}
          connectionStatus={connectionStatus}
          checkingConnection={checkingConnection}
        />
      </div>

      {/* Column 2: Filter Detail (always visible) */}
      <div className="w-80 shrink-0 border-r border-border overflow-y-auto">
        {selectedFilter ? (
          <>
            {filterError && (
              <div className="mx-3 mt-3 px-3 py-2 rounded bg-destructive/20 border border-destructive/50 text-destructive text-sm flex items-center justify-between">
                <span>{filterError}</span>
                <button onClick={() => setFilterError(null)} className="ml-2 text-destructive hover:text-destructive">✕</button>
              </div>
            )}
            <FilterForm
              filter={selectedFilter}
              analysisResults={analysisResults}
              readOnly={
                selectedFilter._source === "generated" &&
                !tempFilters.some((f) => f._id === selectedFilter._id)
              }
              onSave={handleFilterSave}
              onDelete={selectedFilter._source !== "generated" ? handleFilterDelete : undefined}
              onPromote={selectedFilter._source === "temp" ? () => handleFilterSave(selectedFilter) : undefined}
              onChange={handleFilterChange}
              onPush={handlePush}
              pushing={syncingId === selectedFilter._id}
              onCancel={handleFilterCancel}
              isDirty={isDirty}
            />
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Select a filter
          </div>
        )}
      </div>

      {/* Column 3: Controls + Simulation */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {/* Data controls */}
        <Card>
          <CardContent className="py-4 space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Dataset</label>
                <select
                  value={selectedDataset}
                  onChange={(e) => setSelectedDataset(e.target.value)}
                  disabled={sortedDatasets.length === 0}
                  className={selectCls}
                >
                  {sortedDatasets.length === 0 && (
                    <option key="__empty" value="">No datasets — run a scrape first</option>
                  )}
                  {sortedDatasets.map((ds) => (
                    <option key={ds.path} value={ds.path}>{datasetLabel(ds)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Storage (TB)</label>
                <input
                  type="number"
                  value={storageTb}
                  onChange={(e) => setStorageTb(Math.max(0.5, Number(e.target.value)))}
                  min={0.5}
                  step={0.5}
                  className={selectCls}
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Avg Seed Days</label>
                <input
                  type="number"
                  value={maxSeedDays}
                  onChange={(e) => setMaxSeedDays(Number(e.target.value))}
                  min={1}
                  className={selectCls}
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Avg Ratio</label>
                <input
                  type="number"
                  value={avgRatio}
                  onChange={(e) => setAvgRatio(Math.min(10, Math.max(0.2, Number(e.target.value))))}
                  min={0.2}
                  max={10}
                  step={0.1}
                  className={selectCls}
                />
              </div>
            </div>
            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleGenerate}
                disabled={generating || !selectedDataset}
                size="sm"
                variant="outline"
                className="shrink-0"
              >
                {generating ? "Generating..." : "Generate Filters"}
              </Button>
              <Button onClick={handleRunSimulation} disabled={running || !selectedDataset} size="sm" className="shrink-0">
                {running ? "Running..." : "Run Simulation"}
              </Button>
              <JobRunner jobId={generateJobId} onComplete={handleGenerateComplete} />
              {simError && <span className="text-sm text-destructive shrink-0">{simError}</span>}
            </div>
          </CardContent>
        </Card>

        {/* Simulation results */}
        {simResult && (
          <>
            <MetricsBar result={simResult} />
            <Card>
              <CardHeader><CardTitle>Filter Breakdown</CardTitle></CardHeader>
              <CardContent>
                <FilterBreakdownTable result={simResult} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2 flex-wrap">
                  {([
                    { key: "utilization", label: "Disk Utilization" },
                    { key: "grabs", label: "Daily Grabs" },
                    { key: "flow", label: "GB Flow" },
                    { key: "upload", label: "Upload" },
                  ] as const).map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveChart(tab.key)}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        activeChart === tab.key
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {activeChart === "utilization" && <UtilizationChart dailyStats={simResult.daily_stats} targetPct={80} />}
                {activeChart === "grabs" && <DailyGrabsChart dailyStats={simResult.daily_stats} />}
                {activeChart === "flow" && <GBFlowChart dailyStats={simResult.daily_stats} />}
                {activeChart === "upload" && <UploadChart dailyStats={simResult.daily_stats} />}
              </CardContent>
            </Card>
            <GrabbedList torrents={simResult.grabbed_torrents} />
            <SkippedList torrents={simResult.skipped_torrents} />
          </>
        )}
      </div>
    </div>
  );
}
