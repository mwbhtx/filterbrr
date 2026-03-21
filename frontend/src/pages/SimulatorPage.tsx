import { useState, useEffect } from "react";
import { api } from "../api/client";
import { useDatasets } from "../hooks/useDatasets";
import { useFilters } from "../hooks/useFilters";
import type { SimulationResult, AnalysisResults, Filter, Dataset } from "../types";
import MetricsBar from "../components/MetricsBar";
import FilterBreakdownTable from "../components/FilterBreakdown";
import { UtilizationChart, DailyGrabsChart, GBFlowChart, UploadChart } from "../components/TimeSeriesChart";
import { GrabbedList, SkippedList } from "../components/TorrentList";
import FilterForm from "../components/FilterForm";
import JobRunner from "../components/JobRunner";
import { useIsDemo } from "../auth/useIsDemo";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HelpCircle, ChevronDown } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useToast } from "@/components/Toast";
import { filterDataFromAutobrr } from "../types/autobrr";

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

  // Data context state — restore from localStorage
  const stored = JSON.parse(localStorage.getItem('simulator-settings') ?? '{}');
  const [selectedTracker, setSelectedTracker] = useState(stored.tracker ?? "");
  const [selectedDataset, setSelectedDataset] = useState(stored.dataset ?? "");
  const [storageTb, setStorageTb] = useState(stored.storageTb ?? 4);
  const [maxSeedDays, setMaxSeedDays] = useState(stored.maxSeedDays ?? 10);
  const [avgRatio, setAvgRatio] = useState(stored.avgRatio ?? 0.8);

  // Persist settings to localStorage on change
  useEffect(() => {
    localStorage.setItem('simulator-settings', JSON.stringify({
      tracker: selectedTracker,
      dataset: selectedDataset,
      storageTb,
      maxSeedDays,
      avgRatio,
    }));
  }, [selectedTracker, selectedDataset, storageTb, maxSeedDays, avgRatio]);

  // Derive unique tracker types from datasets
  const trackerTypes = [...new Set(datasets.map(d => d.tracker_type).filter(Boolean))].sort();

  // Auto-select tracker if none selected or current no longer valid
  useEffect(() => {
    if (trackerTypes.length === 0) return;
    if (!selectedTracker || !trackerTypes.includes(selectedTracker)) {
      setSelectedTracker(trackerTypes[0]);
    }
  }, [trackerTypes.join(",")]);

  // All datasets sorted by scraped_at desc, filtered by selected tracker
  const sortedDatasets = [...datasets]
    .filter(d => d.tracker_type === selectedTracker)
    .sort((a, b) => {
      if (a.scraped_at && b.scraped_at) return b.scraped_at.localeCompare(a.scraped_at);
      if (a.scraped_at) return -1;
      if (b.scraped_at) return 1;
      return 0;
    });

  // Auto-select dataset when tracker changes or datasets load
  useEffect(() => {
    const current = sortedDatasets.find(d => d.path === selectedDataset);
    if (!current) {
      const first = sortedDatasets[0];
      if (first) setSelectedDataset(first.path);
      else if (selectedDataset) setSelectedDataset("");
    }
  }, [selectedTracker, datasets]);

  // Reset simulation results when tracker or dataset changes
  const handleTrackerChange = (tracker: string) => {
    setSelectedTracker(tracker);
    setSimResult(null);
    localStorage.removeItem('simulator-last-result');
  };

  const handleDatasetChange = (dataset: string) => {
    setSelectedDataset(dataset);
    setSimResult(null);
    localStorage.removeItem('simulator-last-result');
  };

  // Simulation state
  const [simResult, setSimResult] = useState<SimulationResult | null>(() => {
    const stored = localStorage.getItem('simulator-last-result');
    if (!stored) return null;
    try { return JSON.parse(stored); } catch { return null; }
  });
  const [analysisResults, setAnalysisResults] = useState<AnalysisResults | null>(null);
  const [running, setRunning] = useState(false);

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
  const [pullingId, setPullingId] = useState<string | null>(null);
  const [activeChart, setActiveChart] = useState<"utilization" | "grabs" | "flow" | "upload">("utilization");
  const { toast } = useToast();

  // Combine persistent + temp filters
  const allFilters: Filter[] = [
    ...persistedFilters.map((f) =>
      dirtyMap.has(f._id) ? (dirtyMap.get(f._id) as Filter) : f
    ),
    ...tempFilters,
  ];
  const dirtyIds = new Set(dirtyMap.keys());

  // Filter by selected tracker — show filters that match tracker or have no tracker_type (backwards compat)
  const trackerFilters = allFilters.filter(
    f => !f.tracker_type || f.tracker_type === selectedTracker
  );

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
      const currentIds = new Set(trackerFilters.map(f => f._id));
      const next = new Set<string>();
      for (const f of trackerFilters) {
        if (prev.has(f._id)) {
          next.add(f._id);
        } else if (f.data.enabled) {
          next.add(f._id);
        }
      }
      for (const id of prev) {
        if (!currentIds.has(id)) next.delete(id);
      }
      return next;
    });
  }, [trackerFilters.map(f => f._id).join(",")]);

  // Persist enabled filter IDs to localStorage
  useEffect(() => {
    localStorage.setItem('simulator-enabled-filters', JSON.stringify([...enabledFilterIds]));
  }, [enabledFilterIds]);
  const selectedFilter = trackerFilters.find((f) => f._id === selectedFilterId) ?? null;

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
        tracker_type: selectedTracker || undefined,
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

    const beforeMap = new Map<string, Filter>();
    for (const f of allFilters) {
      beforeMap.set(f._id, f);
    }

    const { data: freshFilters } = await refetchFilters();
    if (selectedDs) {
      api.getAnalysisResults(selectedDs.category).then(setAnalysisResults).catch(() => {});
    }
    if (!freshFilters) return;

    const newDirty = new Map(dirtyMap);
    for (const gen of freshFilters) {
      if (!gen._id.startsWith('gen-')) continue;
      const before = beforeMap.get(gen._id);
      if (before && JSON.stringify(before.data) !== JSON.stringify(gen.data)) {
        newDirty.set(gen._id, { ...before, data: gen.data });
      }
    }
    setDirtyMap(newDirty);
  };

  // Simulation
  const handleRunSimulation = async () => {
    if (!selectedDataset) return;
    setRunning(true);
    setGenerateJobId(null);
    localStorage.removeItem('active-generate-job');
    const minSpin = new Promise(r => setTimeout(r, 1000));
    try {
      const activeFilterIds = trackerFilters
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
      toast(err instanceof Error ? err.message : "Simulation failed", "error");
    } finally {
      setRunning(false);
    }
  };

  const handleFilterSave = async (filter: Filter) => {
    try {
      if (filter._source === "temp") {
        const { _id, _source, version, tracker_type, ...body } = filter;
        void _source; void version; void tracker_type;
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
        const { _id, _source, version, tracker_type, ...body } = filter;
        void _source; void version; void tracker_type;
        await api.updateFilter(_id, body);
        setDirtyMap((prev) => { const next = new Map(prev); next.delete(_id); return next; });
        await refetchFilters();
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Save failed", "error");
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
    try { await api.pushFilter(filterId); toast("Filter pushed to autobrr"); }
    catch (err: unknown) { const msg = err instanceof Error ? err.message : "Push failed"; toast(msg, "error"); }
    finally { setSyncingId(null); }
  };

  const handlePushAll = async () => {
    setSyncingId("all");
    try { await api.pushAll(); toast("All filters pushed to autobrr"); }
    catch (err: unknown) { const msg = err instanceof Error ? err.message : "Push all failed"; toast(msg, "error"); }
    finally { setSyncingId(null); }
  };

  const handleSaveAll = async () => {
    for (const [, filter] of dirtyMap) {
      try {
        const { _id, _source, version, tracker_type, ...body } = filter;
        void _source; void version; void tracker_type;
        await api.updateFilter(_id, body);
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : `Save failed for ${filter.name}`, "error");
        return;
      }
    }
    setDirtyMap(new Map());
    await refetchFilters();
    toast("All filters saved");
  };

  const handlePull = async (filterId: string) => {
    setPullingId(filterId);
    try {
      const remote = await api.pullFilter(filterId);
      const local = allFilters.find((f) => f._id === filterId);
      if (!local) return;
      const pulled: Filter = {
        ...local,
        name: (remote.name as string) ?? local.name,
        data: filterDataFromAutobrr(remote, local.data),
      };
      setDirtyMap((prev) => new Map(prev).set(filterId, pulled));
      toast("Filter pulled from autobrr — review and save");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Pull failed", "error");
    } finally {
      setPullingId(null);
    }
  };

  const handlePullAll = async () => {
    setSyncingId("all");
    try { await api.pullAll(); await refetchFilters(); toast("All filters pulled from autobrr"); }
    catch (err: unknown) { const msg = err instanceof Error ? err.message : "Pull all failed"; toast(msg, "error"); }
    finally { setSyncingId(null); }
  };

  const handleToggleFilter = (id: string) => {
    setSelectedFilterId((prev) => (prev === id ? null : id));
  };

  const formatFilterSummary = (f: Filter) => {
    const parts: string[] = [];
    if (f.data.delay > 0) parts.push(`${f.data.delay}s delay`);
    if (f.data.max_downloads) {
      const unit = f.data.max_downloads_unit === "HOUR" ? "h" : "d";
      parts.push(`${f.data.max_downloads}/${unit}`);
    }
    if (f.data.resolutions.length) parts.push(f.data.resolutions.join(", "));
    if (f.data.freeleech) parts.push("FL");
    return parts.join(" · ") || "No constraints set";
  };

  const r = simResult ?? EMPTY_RESULT;
  const hasResults = simResult !== null;

  return (
    <div className="h-[calc(100vh-4rem)] overflow-y-auto -mx-6 -my-4">
      <div className="px-4 md:px-6 py-4 space-y-4">

        {/* ── Toolbar: Dataset + Seedbox Config ── */}
        <div className="border-b border-border pb-4">
          {datasetsLoading ? (
            <div className="flex items-center gap-2 py-1.5">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
              <span className="text-sm text-muted-foreground">Loading datasets…</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Tracker</label>
                <select
                  value={selectedTracker}
                  onChange={(e) => handleTrackerChange(e.target.value)}
                  disabled={trackerTypes.length === 0}
                  className={selectCls}
                >
                  {trackerTypes.length === 0 && (
                    <option value="">No trackers</option>
                  )}
                  {trackerTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Dataset</label>
                <select
                  value={selectedDataset}
                  onChange={(e) => handleDatasetChange(e.target.value)}
                  disabled={sortedDatasets.length === 0}
                  className={selectCls}
                >
                  {sortedDatasets.length === 0 && (
                    <option value="">No datasets</option>
                  )}
                  {sortedDatasets.map((ds) => (
                    <option key={ds.path} value={ds.path}>{datasetLabel(ds)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                  Storage (TB)
                  <HintIcon tip="Total disk space available for storing downloaded torrents" />
                </label>
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
                <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                  Seed Days
                  <HintIcon tip="Average number of days each torrent is seeded before removal" />
                </label>
                <input
                  type="number"
                  value={maxSeedDays}
                  onChange={(e) => setMaxSeedDays(Number(e.target.value))}
                  min={1}
                  className={selectCls}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                  Avg Ratio
                  <HintIcon tip="Average upload-to-download ratio achieved per torrent" />
                </label>
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
          )}
        </div>

        {/* ── Filters Row ── */}
        <div>
          <div className="flex items-center gap-2 mb-2 h-8">
            <Button
              onClick={handleGenerate}
              disabled={generating || !selectedDataset}
              size="sm"
              className="shrink-0 btn-glow"
            >
              {generating ? "Generating..." : "Generate Filters"}
            </Button>
            {trackerFilters.length > 0 && (
              <>
                <div className="w-px h-5 bg-border mx-1 shrink-0" />
                <button
                  onClick={handlePushAll}
                  disabled={isDemo || syncingId != null}
                  className="text-xs font-medium px-2.5 py-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground disabled:opacity-30 transition-colors shrink-0"
                >
                  {syncingId === "all" ? "..." : "Push All"}
                </button>
                <button
                  onClick={handlePullAll}
                  disabled={isDemo || syncingId != null}
                  className="text-xs font-medium px-2.5 py-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground disabled:opacity-30 transition-colors shrink-0"
                >
                  {syncingId === "all" ? "..." : "Pull All"}
                </button>
                <button
                  onClick={handleSaveAll}
                  disabled={dirtyIds.size === 0}
                  className="text-xs font-medium px-2.5 py-1 rounded bg-primary hover:bg-primary/90 text-primary-foreground transition-colors disabled:opacity-30 shrink-0"
                >
                  Save All
                </button>
                <button
                  onClick={() => setDirtyMap(new Map())}
                  disabled={dirtyIds.size === 0}
                  className="text-xs font-medium px-2.5 py-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground transition-colors disabled:opacity-30 shrink-0"
                >
                  Reset All
                </button>
              </>
            )}
            <JobRunner jobId={generateJobId} onComplete={handleGenerateComplete} onCancel={() => { setGenerateJobId(null); setGenerating(false); localStorage.removeItem('active-generate-job'); }} />
          </div>

          {filtersLoading && trackerFilters.length === 0 ? (
            <div className="flex items-center justify-center py-6 gap-2">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
              <p className="text-xs text-muted-foreground">Loading filters…</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 mt-2">
              {[0, 1, 2].map((idx) => {
                const filter = trackerFilters[idx];
                if (!filter) {
                  return (
                    <div
                      key={`empty-${idx}`}
                      className="rounded-lg border border-dashed border-border/40 bg-muted/20 p-3 flex items-center justify-center min-h-[72px]"
                    >
                      <span className="text-xs text-muted-foreground/30">—</span>
                    </div>
                  );
                }

                const isSelected = filter._id === selectedFilterId;
                const isEnabled = enabledFilterIds.has(filter._id);
                const filterIsDirty = dirtyIds.has(filter._id);

                return (
                  <div
                    key={filter._id}
                    onClick={() => handleToggleFilter(filter._id)}
                    className={`rounded-lg border p-3 cursor-pointer transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : isEnabled
                          ? "border-border bg-card hover:border-muted-foreground/30"
                          : "border-border/50 bg-card/50 opacity-60 hover:opacity-80"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {filterIsDirty && <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0" title="Unsaved changes" />}
                        {filter._source === "temp" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent shrink-0" />}
                        <h3 className="text-sm font-semibold text-foreground truncate">{filter.name}</h3>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleFilterSave(filter); }}
                          disabled={!filterIsDirty}
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground transition-colors disabled:opacity-30"
                        >
                          Save
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDirtyMap(prev => { const next = new Map(prev); next.delete(filter._id); return next; });
                          }}
                          disabled={!filterIsDirty}
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground transition-colors disabled:opacity-30"
                        >
                          Reset
                        </button>
                        {filter._source !== "temp" && (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); handlePush(filter._id); }}
                              disabled={isDemo || syncingId != null || filterIsDirty}
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground transition-colors disabled:opacity-30"
                            >
                              Push
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handlePull(filter._id); }}
                              disabled={isDemo || pullingId != null}
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground transition-colors disabled:opacity-30"
                            >
                              Pull
                            </button>
                          </>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEnabledFilterIds(prev => {
                              const next = new Set(prev);
                              if (next.has(filter._id)) next.delete(filter._id);
                              else next.add(filter._id);
                              return next;
                            });
                          }}
                          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors ${
                            isEnabled
                              ? "bg-pink-600 border-pink-600"
                              : "bg-muted border-border"
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-px ${
                              isEnabled ? "translate-x-4" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-muted-foreground truncate">{formatFilterSummary(filter)}</p>
                      <ChevronDown className={`size-3 text-muted-foreground/40 shrink-0 ml-2 transition-transform ${isSelected ? "rotate-180" : ""}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Expanded Filter Settings ── */}
        {selectedFilter && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{selectedFilter.name} — Settings</CardTitle>
                <button
                  onClick={() => setSelectedFilterId(null)}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <FilterForm
                filter={selectedFilter}
                analysisResults={analysisResults}
                readOnly={false}
                onSave={handleFilterSave}
                onPromote={selectedFilter._source === "temp" ? () => handleFilterSave(selectedFilter) : undefined}
                onChange={handleFilterChange}
                onPush={isDemo ? undefined : handlePush}
                pushing={syncingId === selectedFilter._id || syncingId === "all"}
                onPull={isDemo ? undefined : () => handlePull(selectedFilter._id)}
                pulling={pullingId === selectedFilter._id}
                onCancel={handleFilterCancel}
                isDirty={dirtyIds.has(selectedFilter._id)}
              />
            </CardContent>
          </Card>
        )}

        {/* ── Simulation ── */}
        <div className="border-t border-border pt-4">
          <div className="flex items-center gap-3 mb-4">
            <Button
              onClick={handleRunSimulation}
              disabled={running || !selectedDataset || enabledFilterIds.size === 0}
              size="sm"
              className="shrink-0 btn-glow"
            >
              {running ? "Running..." : "Run Simulation"}
            </Button>
            {!running && enabledFilterIds.size === 0 && trackerFilters.length > 0 && (
              <span className="text-xs text-muted-foreground">Enable at least one filter</span>
            )}
            {!running && trackerFilters.length === 0 && (
              <span className="text-xs text-muted-foreground">Generate or create filters first</span>
            )}
          </div>

          {running ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
              <span className="text-sm text-muted-foreground">Running simulation…</span>
            </div>
          ) : !hasResults ? (
            /* Skeleton preview — ghost of what results will look like */
            <div className="space-y-4 select-none">
              {/* Skeleton metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="rounded-lg border border-border/40 bg-card/50 p-4">
                    <div className="h-3 w-24 rounded bg-gradient-to-r from-white/10 to-white/5 animate-pulse mb-3" />
                    <div className="h-7 w-20 rounded bg-gradient-to-r from-white/8 to-white/4 animate-pulse mb-2" />
                    <div className="h-2.5 w-32 rounded bg-gradient-to-r from-white/6 to-white/3 animate-pulse" />
                  </div>
                ))}
              </div>
              {/* Skeleton chart with centered overlay */}
              <div className="relative rounded-lg border border-border/40 bg-card/50 p-4">
                <div className="flex gap-2 mb-4" aria-hidden="true">
                  {["w-20", "w-16", "w-14", "w-12"].map((w, i) => (
                    <div key={i} className={`h-3 ${w} rounded bg-gradient-to-r from-white/10 to-white/5 animate-pulse`} />
                  ))}
                </div>
                <div className="h-[200px] flex items-end gap-[2px] px-4" aria-hidden="true">
                  {Array.from({ length: 40 }, (_, i) => {
                    const height = 20 + Math.sin(i * 0.4) * 15 + Math.cos(i * 0.7) * 10;
                    return (
                      <div
                        key={i}
                        className="flex-1 rounded-t animate-pulse"
                        style={{
                          height: `${height}%`,
                          animationDelay: `${i * 50}ms`,
                          animationDuration: '2s',
                          background: `linear-gradient(180deg, rgba(255,255,255,${0.08 + (height / 800)}) 0%, rgba(255,255,255,${0.03 + (height / 1200)}) 100%)`,
                        }}
                      />
                    );
                  })}
                </div>
                {/* Centered overlay within chart card */}
                <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-3">
                  <Button
                    onClick={handleRunSimulation}
                    disabled={running || !selectedDataset || enabledFilterIds.size === 0}
                    size="sm"
                    className="btn-glow"
                  >
                    Run Simulation
                  </Button>
                  <p className="text-sm text-muted-foreground/60">Run a simulation to see results</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <MetricsBar result={r} loading={running} />
              <GrabbedList torrents={r.grabbed_torrents} />
              <SkippedList torrents={r.skipped_torrents} />
              <Card>
                <CardHeader><CardTitle>Filter Breakdown</CardTitle></CardHeader>
                <CardContent>
                  <FilterBreakdownTable result={r} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-0">
                  <div className="flex items-center gap-1">
                    {([
                      { key: "utilization", label: "Disk Utilization" },
                      { key: "grabs", label: "Daily Grabs" },
                      { key: "flow", label: "GB Flow" },
                      { key: "upload", label: "Upload" },
                    ] as const).map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveChart(tab.key)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
                          activeChart === tab.key
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </CardHeader>
                <CardContent>
                  {activeChart === "utilization" && <UtilizationChart dailyStats={r.daily_stats} targetPct={80} />}
                  {activeChart === "grabs" && <DailyGrabsChart dailyStats={r.daily_stats} />}
                  {activeChart === "flow" && <GBFlowChart dailyStats={r.daily_stats} />}
                  {activeChart === "upload" && <UploadChart dailyStats={r.daily_stats} />}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
