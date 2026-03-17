import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { Dataset, Tracker } from "../types";
import JobRunner from "./JobRunner";

const CATEGORIES = ["freeleech", "movies", "tv"];

interface DatasetsPageProps {
  trackers: Tracker[];
  onSelectDataset?: (path: string) => void;
}

export default function DatasetsPage({ trackers, onSelectDataset }: DatasetsPageProps) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Scrape controls
  const [scrapeOpen, setScrapeOpen] = useState(false);
  const [scrapeCategory, setScrapeCategory] = useState("freeleech");
  const [scrapeDays, setScrapeDays] = useState(30);
  const [scrapeStartPage, setScrapeStartPage] = useState(1);
  const [scrapeDelay, setScrapeDelay] = useState(1.0);
  const [scrapeTrackerId, setScrapeTrackerId] = useState<string>("");
  const [scrapeJobId, setScrapeJobId] = useState<string | null>(null);
  const [scrapeRunning, setScrapeRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setDatasets(await api.getDatasets());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (trackers.length > 0 && !scrapeTrackerId) {
      setScrapeTrackerId(trackers[0].id);
    }
  }, [trackers]);

  const handleDelete = async (filename: string) => {
    if (!confirm(`Delete ${filename}?`)) return;
    setDeleting(filename);
    try {
      await api.deleteDataset(filename);
      setDatasets((prev) => prev.filter((d) => d.filename !== filename));
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  };

  const handleScrape = async () => {
    setScrapeRunning(true);
    try {
      const { job_id } = await api.startScrape({
        category: scrapeCategory,
        days: scrapeDays,
        start_page: scrapeStartPage,
        delay: scrapeDelay,
        tracker_id: scrapeTrackerId || undefined,
      });
      setScrapeJobId(job_id);
    } catch {
      setScrapeRunning(false);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return "\u2014";
    return d.length > 16 ? d.slice(0, 16) : d;
  };

  const inputClass = "w-full rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100";

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Datasets</h2>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* New Scrape — collapsible */}
      <div className="rounded-lg bg-gray-900 border border-gray-800 overflow-hidden">
        <button
          onClick={() => setScrapeOpen(!scrapeOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-200 hover:bg-gray-800/50 transition-colors"
        >
          <span>New Scrape</span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${scrapeOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {scrapeOpen && (
          <div className="px-4 pb-4 border-t border-gray-800">
            <div className="mb-3 mt-3">
              <label className="block text-xs text-gray-400 mb-1">Tracker</label>
              <select
                value={scrapeTrackerId}
                onChange={(e) => setScrapeTrackerId(e.target.value)}
                disabled={scrapeRunning}
                className={`${inputClass} disabled:opacity-50`}
              >
                {trackers.length === 0 && <option value="">No trackers — configure in Settings</option>}
                {trackers.map((t) => (
                  <option key={t.id} value={t.id}>{t.tracker_type}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Category</label>
                <select
                  value={scrapeCategory}
                  onChange={(e) => setScrapeCategory(e.target.value)}
                  disabled={scrapeRunning}
                  className={`${inputClass} disabled:opacity-50`}
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Days</label>
                <input
                  type="number"
                  value={scrapeDays}
                  onChange={(e) => setScrapeDays(Number(e.target.value))}
                  min={1}
                  disabled={scrapeRunning}
                  className={`${inputClass} disabled:opacity-50`}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Start Page</label>
                <input
                  type="number"
                  value={scrapeStartPage}
                  onChange={(e) => setScrapeStartPage(Number(e.target.value))}
                  min={1}
                  disabled={scrapeRunning}
                  className={`${inputClass} disabled:opacity-50`}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Delay (s)</label>
                <input
                  type="number"
                  value={scrapeDelay}
                  onChange={(e) => setScrapeDelay(Number(e.target.value))}
                  min={0.1}
                  step={0.1}
                  disabled={scrapeRunning}
                  className={`${inputClass} disabled:opacity-50`}
                />
              </div>
            </div>
            <div className="mt-3">
              <button
                onClick={handleScrape}
                disabled={scrapeRunning}
                className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                {scrapeRunning ? "Running..." : "Run Scrape"}
              </button>
            </div>
            <JobRunner
              jobId={scrapeJobId}
              onComplete={() => {
                setScrapeRunning(false);
                load();
              }}
            />
          </div>
        )}
      </div>

      {/* Dataset table */}
      <div className="rounded-lg bg-gray-900 border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-xs text-gray-400 uppercase">
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Scraped At</th>
              <th className="px-4 py-2 text-right">Torrents</th>
              <th className="px-4 py-2">Date Range</th>
              <th className="px-4 py-2 text-right">Size</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {datasets.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No datasets found. Run a scrape to get started.
                </td>
              </tr>
            )}
            {datasets.map((ds) => (
              <tr key={ds.filename} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="px-4 py-2">
                  <span className="text-xs px-2 py-0.5 rounded border bg-blue-900/50 text-blue-300 border-blue-700">
                    {ds.category}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-300">
                  {ds.scraped_at ?? "Legacy"}
                </td>
                <td className="px-4 py-2 text-right text-gray-300">
                  {ds.torrent_count.toLocaleString()}
                </td>
                <td className="px-4 py-2 text-gray-400 text-xs">
                  {ds.min_date && ds.max_date
                    ? `${formatDate(ds.min_date)} \u2014 ${formatDate(ds.max_date)}`
                    : "\u2014"}
                </td>
                <td className="px-4 py-2 text-right text-gray-400">
                  {ds.size_mb < 1 ? `${(ds.size_mb * 1024).toFixed(0)} KB` : `${ds.size_mb} MB`}
                </td>
                <td className="px-4 py-2 text-right space-x-2">
                  {onSelectDataset && (
                    <button
                      onClick={() => onSelectDataset(ds.path)}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Use in Simulator
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(ds.filename)}
                    disabled={deleting === ds.filename}
                    className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    {deleting === ds.filename ? "..." : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
