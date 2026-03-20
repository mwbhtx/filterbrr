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
import { useIsDemo } from "../auth/useIsDemo";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

function HintIcon({ tip }: { tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex ml-1 align-middle cursor-help">
          <HelpCircle className="size-3 text-muted-foreground/60" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-56 text-center">{tip}</TooltipContent>
    </Tooltip>
  );
}

const selectCls =
  "w-full rounded bg-muted border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50";

const genTempId = () => `temp_${Math.random().toString(36).slice(2, 10)}`;

const EMPTY_RESULT: SimulationResult = {
  total_seen: 0,
  total_grabbed: 0,
  total_grabbed_gb: 0,
  grab_rate_pct: 0,
  total_days: 0,
  skip_reasons: { no_match: 0, storage_full: 0, rate_limited: 0 },
  daily_stats: [],
  per_filter_stats: {},
  steady_state_avg_utilization: 0,
  steady_state_avg_disk_gb: 0,
  max_storage_gb: 0,
  filters_used: [],
  blackout_days: 0,
  total_upload_gb: 0,
  steady_state_daily_upload_gb: 0,
  avg_ratio: 0,
  grabbed_torrents: [],
  skipped_torrents: [],
};

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
  const isDemo = useIsDemo();
  const { data: datasets = [], isLoading: datasetsLoading } = useDatasets();
  const { data: persistedFilters = [], isLoading: filtersLoading, refetch: refetchFilters } = useFilters();
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
  const [simResult, setSimResult] = useState<SimulationResult | null>(() => {
    const stored = localStorage.getItem('simulator-last-result');
    if (!stored) return null;
    try { return JSON.parse(stored); } catch { return null; }
  });
  const [analysisResults, setAnalysisResults] = useState<AnalysisResults | null>(null);
  const [running, setRunning] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  // Persist simulation result to localStorage on change
  useEffect(() => {
    if (simResult) {
      localStorage.setItem('simulator-last-result', JSON.stringify(simResult));
    }
  }, [simResult]);

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

  // Track which filters are enabled for simulation (restore from localStorage)
  const [enabledFilterIds, setEnabledFilterIds] = useState<Set<string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('simulator-enabled-filters') ?? '[]');
      return new Set(saved);
    } catch { return new Set(); }
  });

  // Keep enabledFilterIds in sync — mirror each filter's data.enabled field for new filters
  useEffect(() => {
    setEnabledFilterIds(prev => {
      const currentIds = new Set(allFilters.map(f => f._id));
      const next = new Set<string>();
      for (const f of allFilters) {
        if (prev.has(f._id)) {
          // Already tracked — keep user's toggle choice
          next.add(f._id);
        } else if (f.data.enabled) {
          // New filter — mirror its enabled state
          next.add(f._id);
        }
      }
      // Remove IDs that no longer exist
      for (const id of prev) {
        if (!currentIds.has(id)) next.delete(id);
      }
      return next;
    });
  }, [allFilters.map(f => f._id).join(",")]);

  // Persist enabled filter IDs to localStorage
  useEffect(() => {
    localStorage.setItem('simulator-enabled-filters', JSON.stringify([...enabledFilterIds]));
  }, [enabledFilterIds]);
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
      const { job_id } = await api.startGenerateFilters({
        source,
        storage_tb: storageTb,
        dataset_path: selectedDataset,
        avg_seed_days: maxSeedDays,
      });
      setGenerateJobId(job_id);
      localStorage.setItem('active-generate-job', job_id);
    } catch {
      setGenerating(false);
    }
  };

  const handleGenerateComplete = async () => {
    setGenerating(false);
    localStorage.removeItem('active-generate-job');

    // Snapshot what filters looked like before re-generate (including unsaved edits)
    const beforeMap = new Map<string, Filter>();
    for (const f of allFilters) {
      beforeMap.set(f._id, f);
    }

    const { data: freshFilters } = await refetchFilters();
    if (selectedDs) {
      api.getAnalysisResults(selectedDs.category).then(setAnalysisResults).catch(() => {});
    }
    if (!freshFilters) return;

    // For re-generated filters (same gen-* ID already existed), mark as dirty
    // so the user must explicitly save. This preserves unsaved edits.
    const newDirty = new Map(dirtyMap);
    for (const gen of freshFilters) {
      if (!gen._id.startsWith('gen-')) continue;
      const before = beforeMap.get(gen._id);
      if (before) {
        // Filter existed before — use the new generated data as a dirty change
        // but keep the filter's identity (id, name, source)
        newDirty.set(gen._id, { ...before, data: gen.data });
      }
    }
    setDirtyMap(newDirty);
  };

  // Simulation
  const handleRunSimulation = async () => {
    if (!selectedDataset) return;
    setRunning(true);
    setSimError(null);
    setGenerateJobId(null);
    localStorage.removeItem('active-generate-job');
    const minSpin = new Promise(r => setTimeout(r, 1000));
    try {
      const activeFilterIds = allFilters
        .filter(f => enabledFilterIds.has(f._id))
        .map(f => f._id);
      const [result] = await Promise.all([
        api.runSimulation({
          dataset_path: selectedDataset,
          filter_ids: activeFilterIds.length > 0 ? activeFilterIds : undefined,
          storage_tb: storageTb,
          avg_seed_days: maxSeedDays,
          avg_ratio: avgRatio,
        }),
        minSpin,
      ]);
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

  const [mobileTab, setMobileTab] = useState<"filters" | "detail" | "simulation">("simulation");

  const filterListContent = (
    <FilterList
      filters={allFilters}
      selectedId={selectedFilterId}
      onSelect={(f) => { setSelectedFilterId(f._id); setMobileTab("detail"); }}
      onCreateNew={() => { handleCreateNew(); setMobileTab("detail"); }}
      loading={filtersLoading}
      onClearTemp={handleClearTemp}
      onSaveAllTemp={handleSaveAllTemp}
      onDeleteFilter={handleDeleteTemp}
      dirtyIds={dirtyIds}
      {...(!isDemo && {
        syncingId,
        onPush: handlePush,
        onPull: handlePull,
        onPushAll: handlePushAll,
        onPullAll: handlePullAll,
        onCheckConnection: handleCheckConnection,
        connectionStatus,
        checkingConnection,
      })}
    />
  );

  const filterDetailContent = (
    <>
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
            readOnly={false}
            onSave={handleFilterSave}
            onDelete={selectedFilter._source !== "generated" ? handleFilterDelete : undefined}
            onPromote={selectedFilter._source === "temp" ? () => handleFilterSave(selectedFilter) : undefined}
            onChange={handleFilterChange}
            onPush={isDemo ? undefined : handlePush}
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
    </>
  );

  const simulationContent = (
    <div className="overflow-y-auto px-4 md:px-6 py-4 space-y-4 flex-1">
      {/* Section 1: Dataset Selection */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Select Dataset<HintIcon tip="Choose a scraped torrent dataset to analyze and simulate against" /></CardTitle></CardHeader>
        <CardContent className="pt-0">
          {datasetsLoading ? (
            <div className="flex items-center gap-2 py-1.5">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
              <span className="text-sm text-muted-foreground">Loading datasets…</span>
            </div>
          ) : (
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
          )}
        </CardContent>
      </Card>

      {/* Section 2: Seedbox Config */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Seedbox Config<HintIcon tip="Your seedbox hardware settings — used by both filter generation and simulation" /></CardTitle></CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Storage (TB)<HintIcon tip="Total disk space available for storing downloaded torrents" /></label>
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
              <label className="block text-xs text-muted-foreground mb-1">Avg Seed Days<HintIcon tip="Average number of days each torrent is seeded before removal" /></label>
              <input
                type="number"
                value={maxSeedDays}
                onChange={(e) => setMaxSeedDays(Number(e.target.value))}
                min={1}
                className={selectCls}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Avg Ratio<HintIcon tip="Average upload-to-download ratio achieved per torrent" /></label>
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
        </CardContent>
      </Card>

      {/* Section 3: Generate Filters */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Generate Filters<HintIcon tip="Analyze the dataset and auto-generate optimized filters based on your seedbox config" /></CardTitle></CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              onClick={handleGenerate}
              disabled={generating || !selectedDataset}
              size="sm"
              className="shrink-0 btn-glow"
            >
              {generating ? "Generating..." : "Generate Filters"}
            </Button>
            <JobRunner jobId={generateJobId} onComplete={handleGenerateComplete} />
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Simulation */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Simulation<HintIcon tip="Back-test your filters against the dataset to see projected grabs, disk usage, and upload" /></CardTitle></CardHeader>
        <CardContent className="pt-0 space-y-3">
          {allFilters.length > 0 ? (
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">
                Filters<HintIcon tip="Toggle which filters are included in the simulation" />
              </label>
              <div className="flex flex-wrap gap-1.5">
                {allFilters.map(f => {
                  const active = enabledFilterIds.has(f._id);
                  return (
                    <button
                      key={f._id}
                      onClick={() => setEnabledFilterIds(prev => {
                        const next = new Set(prev);
                        if (next.has(f._id)) next.delete(f._id);
                        else next.add(f._id);
                        return next;
                      })}
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${
                        active
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted text-muted-foreground border-border opacity-60'
                      }`}
                    >
                      {f.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No filters yet. Generate filters above or create one manually to run a simulation.</p>
          )}
          <div className="flex items-center gap-3 flex-wrap pt-3 border-t border-border">
            <Button onClick={handleRunSimulation} disabled={running || !selectedDataset || enabledFilterIds.size === 0} size="sm" className="shrink-0 btn-glow">
              {running ? "Running..." : "Run Simulation"}
            </Button>
            {!running && enabledFilterIds.size === 0 && allFilters.length > 0 && (
              <span className="text-sm text-muted-foreground">Enable at least one filter to simulate</span>
            )}
            {simError && <span className="text-sm text-destructive shrink-0">{simError}</span>}
          </div>
        </CardContent>
      </Card>

      {(() => {
        const r = simResult ?? EMPTY_RESULT;
        return (
          <>
            <MetricsBar result={r} loading={running} />
            {running ? (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <div className="flex items-center gap-3">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
                    <span className="text-sm text-muted-foreground">Running simulation…</span>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <GrabbedList torrents={r.grabbed_torrents} />
                <SkippedList torrents={r.skipped_torrents} />
                <Card>
                  <CardHeader><CardTitle>Filter Breakdown</CardTitle></CardHeader>
                  <CardContent>
                    <FilterBreakdownTable result={r} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Disk Utilization</CardTitle></CardHeader>
                  <CardContent>
                    <UtilizationChart dailyStats={r.daily_stats} targetPct={80} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Daily Grabs</CardTitle></CardHeader>
                  <CardContent>
                    <DailyGrabsChart dailyStats={r.daily_stats} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>GB Flow</CardTitle></CardHeader>
                  <CardContent>
                    <GBFlowChart dailyStats={r.daily_stats} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Upload</CardTitle></CardHeader>
                  <CardContent>
                    <UploadChart dailyStats={r.daily_stats} />
                  </CardContent>
                </Card>
              </>
            )}
          </>
        );
      })()}
    </div>
  );

  return (
    <>
      {/* Mobile layout */}
      <div className="flex flex-col h-[calc(100vh-4rem)] -mx-6 -my-4 md:hidden">
        <div className="flex border-b border-border shrink-0">
          {([
            { key: "simulation", label: "Simulate" },
            { key: "filters", label: "Filters" },
            { key: "detail", label: "Detail" },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setMobileTab(tab.key)}
              className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
                mobileTab === tab.key
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {mobileTab === "filters" && filterListContent}
          {mobileTab === "detail" && filterDetailContent}
          {mobileTab === "simulation" && simulationContent}
        </div>
      </div>

      {/* Desktop layout */}
      <div className="hidden md:flex h-[calc(100vh-4rem)] overflow-hidden -mx-6 -my-4">
        <div className="w-56 shrink-0 border-r border-border overflow-hidden">
          {filterListContent}
        </div>
        <div className="w-80 shrink-0 border-r border-border overflow-y-auto">
          {filterDetailContent}
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          {simulationContent}
        </div>
      </div>
    </>
  );
}
