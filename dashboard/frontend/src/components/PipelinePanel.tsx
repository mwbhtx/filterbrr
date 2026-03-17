import { useState } from "react";
import { api } from "../api/client";
import type { Dataset, Seedbox } from "../types";
import JobRunner from "./JobRunner";

interface SimulatorToolbarProps {
  datasets: Dataset[];
  selectedDataset: string;
  onDatasetChange: (path: string) => void;
  seedboxes: Seedbox[];
  selectedSeedboxId: string;
  onSeedboxChange: (id: string) => void;
  onDataChanged: () => void;
  avgSeedDays: number;
}

export default function SimulatorToolbar({
  datasets,
  selectedDataset,
  onDatasetChange,
  seedboxes,
  selectedSeedboxId,
  onSeedboxChange,
  onDataChanged,
  avgSeedDays,
}: SimulatorToolbarProps) {
  const [generateJobId, setGenerateJobId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const selectedDs = datasets.find(d => d.path === selectedDataset);
  const source = selectedDs?.category ?? "freeleech";

  const sortedDatasets = [...datasets].sort((a, b) => {
    if (a.scraped_at && b.scraped_at) return b.scraped_at.localeCompare(a.scraped_at);
    if (a.scraped_at) return -1;
    if (b.scraped_at) return 1;
    return 0;
  });

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

  return (
    <div className="rounded-lg bg-gray-900 border border-gray-800 p-4 mb-6">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <label className="block text-xs text-gray-400 mb-1">Dataset</label>
          <select
            value={selectedDataset}
            onChange={(e) => onDatasetChange(e.target.value)}
            disabled={generating}
            className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 disabled:opacity-50"
          >
            {sortedDatasets.map((ds) => (
              <option key={ds.path} value={ds.path}>
                {ds.filename} ({ds.torrent_count.toLocaleString()} torrents)
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-0">
          <label className="block text-xs text-gray-400 mb-1">Seedbox</label>
          <select
            value={selectedSeedboxId}
            onChange={(e) => onSeedboxChange(e.target.value)}
            disabled={generating}
            className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 disabled:opacity-50"
          >
            {seedboxes.length === 0 && (
              <option value="">No seedboxes — configure in Settings</option>
            )}
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
            disabled={generating || !selectedDataset || !selectedSeedboxId}
            className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
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
    </div>
  );
}
