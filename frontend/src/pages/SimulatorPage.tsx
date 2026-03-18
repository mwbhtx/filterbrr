import { useState, useEffect } from "react";
import { api } from "../api/client";
import { useSettings } from "../hooks/useSettings";
import { useDatasets } from "../hooks/useDatasets";
import { useFilters, useDeleteFilter } from "../hooks/useFilters";
import type { SimulationResult, AnalysisResults, Filter, AutobrrConnectionStatus } from "../types";
import MetricsBar from "../components/MetricsBar";
import FilterBreakdownTable from "../components/FilterBreakdown";
import { UtilizationChart, DailyGrabsChart, GBFlowChart, UploadChart } from "../components/TimeSeriesChart";
import { GrabbedList, SkippedList } from "../components/TorrentList";
import PipelinePanel from "../components/PipelinePanel";
import FilterList from "../components/FilterList";
import FilterForm from "../components/FilterForm";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const selectCls =
  "w-full rounded bg-muted border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50";

const genTempId = () => `temp_${Math.random().toString(36).slice(2, 10)}`;

export default function SimulatorPage() {
  const { data: settings } = useSettings();
  const { data: datasets = [] } = useDatasets();
  const { data: persistedFilters = [], refetch: refetchFilters } = useFilters();
  const deleteFilterMutation = useDeleteFilter();

  const trackers = settings?.trackers ?? [];
  const seedboxes = settings?.seedboxes ?? [];

  // Simulator state
  const [selectedDataset, setSelectedDataset] = useState("");
  const [selectedSeedboxId, setSelectedSeedboxId] = useState("");
  const [storageTb, setStorageTb] = useState(4);
  const [maxSeedDays, setMaxSeedDays] = useState(30);
  const [avgRatio, setAvgRatio] = useState(0);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResults | null>(null);
  const [running, setRunning] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [activeChart, setActiveChart] = useState<"utilization" | "grabs" | "flow" | "upload">("utilization");

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

  // Auto-select first seedbox
  useEffect(() => {
    if (seedboxes.length > 0 && !selectedSeedboxId) {
      const first = seedboxes[0];
      setSelectedSeedboxId(first.id);
      setStorageTb(first.storage_tb);
    }
  }, [seedboxes]);

  // Auto-select first dataset
  useEffect(() => {
    if (datasets.length > 0 && !selectedDataset) {
      setSelectedDataset(datasets[0].path);
    }
  }, [datasets]);

  const handleSeedboxChange = (id: string) => {
    setSelectedSeedboxId(id);
    const sb = seedboxes.find((s) => s.id === id);
    if (sb) setStorageTb(sb.storage_tb);
  };

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
      const ds = datasets.find((d) => d.path === selectedDataset);
      if (ds) {
        try {
          const ar = await api.getAnalysisResults(ds.category);
          setAnalysisResults(ar);
        } catch { /* optional */ }
      }
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
    try {
      await api.pushFilter(filterId);
    } catch (err: unknown) {
      setFilterError(err instanceof Error ? err.message : "Push failed");
    } finally {
      setSyncingId(null);
    }
  };

  const handlePushAll = async () => {
    setSyncingId("all");
    setFilterError(null);
    try {
      await api.pushAll();
    } catch (err: unknown) {
      setFilterError(err instanceof Error ? err.message : "Push all failed");
    } finally {
      setSyncingId(null);
    }
  };

  const handlePull = async (remoteId: number) => {
    setSyncingId(String(remoteId));
    setFilterError(null);
    try {
      await api.pullFilter(remoteId);
      await refetchFilters();
    } catch (err: unknown) {
      setFilterError(err instanceof Error ? err.message : "Pull failed");
    } finally {
      setSyncingId(null);
    }
  };

  const handlePullAll = async () => {
    setSyncingId("all");
    setFilterError(null);
    try {
      await api.pullAll();
      await refetchFilters();
    } catch (err: unknown) {
      setFilterError(err instanceof Error ? err.message : "Pull all failed");
    } finally {
      setSyncingId(null);
    }
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

  const missing = trackers.length === 0 || seedboxes.length === 0;
  const isDirty = selectedFilter ? dirtyIds.has(selectedFilter._id) : false;

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-0 overflow-hidden -mx-6 -my-4">
      {/* Left column — filter list */}
      <div className="w-56 shrink-0 overflow-hidden border-r border-border">
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

      {/* Right area — simulator + optional filter detail */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main simulator content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Pipeline panel */}
          <PipelinePanel
            datasets={datasets}
            trackers={trackers}
            seedboxes={seedboxes}
            selectedDataset={selectedDataset}
            onDatasetChange={setSelectedDataset}
            selectedSeedboxId={selectedSeedboxId}
            onSeedboxChange={handleSeedboxChange}
            avgSeedDays={maxSeedDays}
            onDataChanged={() => {
              const ds = datasets.find((d) => d.path === selectedDataset);
              if (ds) api.getAnalysisResults(ds.category).then(setAnalysisResults).catch(() => {});
            }}
            onGoToSettings={() => {}}
          />

          {/* Simulator controls */}
          <Card>
            <CardHeader>
              <CardTitle>Simulator</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {missing ? (
                <p className="text-sm text-muted-foreground">
                  {trackers.length === 0 && seedboxes.length === 0
                    ? "Add a tracker and seedbox in Settings to get started."
                    : trackers.length === 0
                    ? "Add a tracker in Settings to get started."
                    : "Add a seedbox in Settings to get started."}
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Dataset</label>
                      <select
                        value={selectedDataset}
                        onChange={(e) => setSelectedDataset(e.target.value)}
                        disabled={running || datasets.length === 0}
                        className={selectCls}
                      >
                        {datasets.length === 0 && (
                          <option key="__empty" value="">No datasets — run a scrape first</option>
                        )}
                        {datasets.map((ds) => (
                          <option key={ds.path} value={ds.path}>
                            {ds.scraped_at ?? ds.category}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Seedbox</label>
                      <select
                        value={selectedSeedboxId}
                        onChange={(e) => handleSeedboxChange(e.target.value)}
                        disabled={running}
                        className={selectCls}
                      >
                        {seedboxes.map((sb) => (
                          <option key={sb.id} value={sb.id}>
                            {sb.name} ({sb.storage_tb} TB)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Max Seed Days</label>
                      <input
                        type="number"
                        value={maxSeedDays}
                        onChange={(e) => setMaxSeedDays(Number(e.target.value))}
                        min={1}
                        disabled={running}
                        className={selectCls}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">
                        Avg Ratio (0 = skip upload est.)
                      </label>
                      <input
                        type="number"
                        value={avgRatio}
                        onChange={(e) => setAvgRatio(Number(e.target.value))}
                        min={0}
                        step={0.1}
                        disabled={running}
                        className={selectCls}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button onClick={handleRunSimulation} disabled={running || !selectedDataset} size="sm">
                      {running ? "Running..." : "Run Simulation"}
                    </Button>
                    {simError && <span className="text-sm text-destructive">{simError}</span>}
                  </div>
                </>
              )}
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

        {/* Filter detail panel — shown when a filter is selected */}
        {selectedFilter && (
          <div className="w-96 shrink-0 border-l border-border overflow-y-auto">
            {filterError && (
              <div className="mx-4 mt-4 px-3 py-2 rounded bg-destructive/20 border border-destructive/50 text-destructive text-sm flex items-center justify-between">
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
          </div>
        )}
      </div>
    </div>
  );
}
