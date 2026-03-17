import { useState, useEffect } from "react";
import { api } from "../api/client";
import { useSettings } from "../hooks/useSettings";
import { useDatasets } from "../hooks/useDatasets";
import type { SimulationResult, AnalysisResults } from "../types";
import MetricsBar from "../components/MetricsBar";
import FilterBreakdownTable from "../components/FilterBreakdown";
import { UtilizationChart, DailyGrabsChart, GBFlowChart, UploadChart } from "../components/TimeSeriesChart";
import { GrabbedList, SkippedList } from "../components/TorrentList";
import PipelinePanel from "../components/PipelinePanel";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const selectCls =
  "w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 disabled:opacity-50";

export default function SimulatorPage() {
  const { data: settings } = useSettings();
  const { data: datasets = [] } = useDatasets();

  const trackers = settings?.trackers ?? [];
  const seedboxes = settings?.seedboxes ?? [];

  const [selectedDataset, setSelectedDataset] = useState("");
  const [selectedSeedboxId, setSelectedSeedboxId] = useState("");
  const [storageTb, setStorageTb] = useState(4);
  const [maxSeedDays, setMaxSeedDays] = useState(30);
  const [avgRatio, setAvgRatio] = useState(0);

  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResults | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeChart, setActiveChart] = useState<"utilization" | "grabs" | "flow" | "upload">(
    "utilization"
  );

  // Auto-select first seedbox when settings load
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

  // Update storageTb when seedbox changes
  const handleSeedboxChange = (id: string) => {
    setSelectedSeedboxId(id);
    const sb = seedboxes.find((s) => s.id === id);
    if (sb) setStorageTb(sb.storage_tb);
  };

  const handleRunSimulation = async () => {
    if (!selectedDataset) return;
    setRunning(true);
    setError(null);
    try {
      const result = await api.runSimulation({
        dataset_path: selectedDataset,
        storage_tb: storageTb,
        max_seed_days: maxSeedDays,
        avg_ratio: avgRatio,
      });
      setSimResult(result);

      // Also try to load analysis results for the selected dataset's category
      const ds = datasets.find((d) => d.path === selectedDataset);
      if (ds) {
        try {
          const ar = await api.getAnalysisResults(ds.category);
          setAnalysisResults(ar);
        } catch {
          // analysis results optional
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setRunning(false);
    }
  };

  const missing = trackers.length === 0 || seedboxes.length === 0;

  return (
    <div className="space-y-6">
      {/* Toolbar / controls */}
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
                      <option value="">No datasets — run a scrape first</option>
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
                <Button
                  onClick={handleRunSimulation}
                  disabled={running || !selectedDataset}
                  size="sm"
                >
                  {running ? "Running..." : "Run Simulation"}
                </Button>
                {error && (
                  <span className="text-sm text-red-400">{error}</span>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Pipeline panel (generate filters) */}
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
          // Reload analysis results after new filters are generated
          const ds = datasets.find((d) => d.path === selectedDataset);
          if (ds) {
            api.getAnalysisResults(ds.category).then(setAnalysisResults).catch(() => {});
          }
        }}
        onGoToSettings={() => {}}
      />

      {/* Results */}
      {simResult && (
        <>
          <MetricsBar result={simResult} />

          {/* Filter breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Filter Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <FilterBreakdownTable result={simResult} />
            </CardContent>
          </Card>

          {/* Charts */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 flex-wrap">
                {(
                  [
                    { key: "utilization", label: "Disk Utilization" },
                    { key: "grabs", label: "Daily Grabs" },
                    { key: "flow", label: "GB Flow" },
                    { key: "upload", label: "Upload" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveChart(tab.key)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      activeChart === tab.key
                        ? "bg-blue-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {activeChart === "utilization" && (
                <UtilizationChart dailyStats={simResult.daily_stats} targetPct={80} />
              )}
              {activeChart === "grabs" && (
                <DailyGrabsChart dailyStats={simResult.daily_stats} />
              )}
              {activeChart === "flow" && (
                <GBFlowChart dailyStats={simResult.daily_stats} />
              )}
              {activeChart === "upload" && (
                <UploadChart dailyStats={simResult.daily_stats} />
              )}
            </CardContent>
          </Card>

          {/* Torrent lists */}
          <GrabbedList torrents={simResult.grabbed_torrents} />
          <SkippedList torrents={simResult.skipped_torrents} />
        </>
      )}
    </div>
  );
}
