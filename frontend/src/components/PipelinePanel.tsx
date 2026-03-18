import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { Dataset, Seedbox, Tracker } from "../types";
import JobRunner from "./JobRunner";

interface SimulatorToolbarProps {
  datasets: Dataset[];
  trackers: Tracker[];
  selectedDataset: string;
  onDatasetChange: (path: string) => void;
  seedboxes: Seedbox[];
  selectedSeedboxId: string;
  onSeedboxChange: (id: string) => void;
  onDataChanged: () => void;
  onGoToSettings: () => void;
  avgSeedDays: number;
}

export default function SimulatorToolbar({
  datasets,
  trackers,
  selectedDataset,
  onDatasetChange,
  seedboxes,
  selectedSeedboxId,
  onSeedboxChange,
  onDataChanged,
  onGoToSettings,
  avgSeedDays,
}: SimulatorToolbarProps) {
  const [generateJobId, setGenerateJobId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [selectedTrackerType, setSelectedTrackerType] = useState<string>("");

  // Initialise tracker selection from first configured tracker
  useEffect(() => {
    if (trackers.length > 0 && !selectedTrackerType) {
      setSelectedTrackerType(trackers[0].tracker_type);
    }
  }, [trackers]);

  // Datasets filtered to the selected tracker, sorted newest first
  const filteredDatasets = [...datasets]
    .filter(ds => !selectedTrackerType || ds.tracker_type === selectedTrackerType)
    .sort((a, b) => {
      if (a.scraped_at && b.scraped_at) return b.scraped_at.localeCompare(a.scraped_at);
      if (a.scraped_at) return -1;
      if (b.scraped_at) return 1;
      return 0;
    });

  // Auto-select first dataset when tracker changes and current selection no longer matches
  useEffect(() => {
    const current = datasets.find(d => d.path === selectedDataset);
    if (current && current.tracker_type !== selectedTrackerType) {
      const first = filteredDatasets[0];
      if (first) onDatasetChange(first.path);
    } else if (!selectedDataset && filteredDatasets.length > 0) {
      onDatasetChange(filteredDatasets[0].path);
    }
  }, [selectedTrackerType]);

  const selectedDs = datasets.find(d => d.path === selectedDataset);
  const source = selectedDs?.category ?? "freeleech";

  const datasetDays = (ds: Dataset): string => {
    if (ds.min_date && ds.max_date) {
      const diff = Math.round(
        (new Date(ds.max_date).getTime() - new Date(ds.min_date).getTime()) / 86400000
      ) + 1;
      return `${diff} day${diff !== 1 ? "s" : ""}`;
    }
    return ds.category;
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const selectedSb = seedboxes.find(sb => sb.id === selectedSeedboxId);
      const storageTb = selectedSb?.storage_tb ?? 4;
      const { job_id } = await api.startAnalyze({
        source,
        storage_tb: storageTb,
        dataset_path: selectedDataset,
        seed_days: avgSeedDays,
      });
      setGenerateJobId(job_id);
    } catch {
      setGenerating(false);
    }
  };

  const selectCls = "w-full rounded bg-muted border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50";

  const missing = trackers.length === 0 || seedboxes.length === 0;

  return (
    <div className="rounded-lg bg-card border border-border p-4 mb-6">
      <h2 className="text-base font-semibold mb-3">Generate Autobrr Filters</h2>
      {missing ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {trackers.length === 0 && seedboxes.length === 0
              ? "You must add a tracker and seedbox in settings to get started."
              : trackers.length === 0
              ? "You must add a tracker in settings to get started."
              : "You must add a seedbox in settings to get started."}
          </p>
          <button
            onClick={onGoToSettings}
            className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go to Settings
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            {/* Tracker */}
            <div className="flex-1 min-w-0">
              <label className="block text-xs text-muted-foreground mb-1">Tracker</label>
              <select
                value={selectedTrackerType}
                onChange={(e) => setSelectedTrackerType(e.target.value)}
                disabled={generating}
                className={selectCls}
              >
                {trackers.map((t) => (
                  <option key={t.id} value={t.tracker_type}>
                    {t.tracker_type}
                  </option>
                ))}
              </select>
            </div>

            {/* Dataset — filtered by selected tracker */}
            <div className="flex-1 min-w-0">
              <label className="block text-xs text-muted-foreground mb-1">Dataset</label>
              <select
                value={selectedTrackerType ? selectedDataset : ""}
                onChange={(e) => onDatasetChange(e.target.value)}
                disabled={generating || !selectedTrackerType || filteredDatasets.length === 0}
                className={selectCls}
              >
                {!selectedTrackerType && (
                  <option key="__placeholder" value="">— select a tracker first —</option>
                )}
                {selectedTrackerType && filteredDatasets.length === 0 && (
                  <option key="__empty" value="">No datasets — run a scrape first</option>
                )}
                {filteredDatasets.map((ds) => (
                  <option key={ds.path} value={ds.path}>
                    {ds.scraped_at ?? ds.category} · {datasetDays(ds)}
                  </option>
                ))}
              </select>
            </div>

            {/* Seedbox */}
            <div className="flex-1 min-w-0">
              <label className="block text-xs text-muted-foreground mb-1">Seedbox</label>
              <select
                value={selectedSeedboxId}
                onChange={(e) => onSeedboxChange(e.target.value)}
                disabled={generating}
                className={selectCls}
              >
                {seedboxes.map((sb) => (
                  <option key={sb.id} value={sb.id}>
                    {sb.name} ({sb.storage_tb} TB)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-shrink-0 self-end">
              <button
                onClick={handleGenerate}
                disabled={generating || !selectedDataset || !selectedSeedboxId || !selectedTrackerType}
                className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {generating ? "Generating..." : "Generate Filters"}
              </button>
            </div>
          </div>
          <JobRunner
            jobId={generateJobId}
            onComplete={() => {
              setGenerating(false);
              onDataChanged();
            }}
          />
        </>
      )}
    </div>
  );
}
