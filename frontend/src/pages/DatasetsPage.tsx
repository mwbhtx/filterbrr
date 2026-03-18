import { useState } from "react";
import { api } from "../api/client";
import { useDatasets, useDeleteDataset } from "../hooks/useDatasets";
import { useSettings } from "../hooks/useSettings";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import JobRunner from "../components/JobRunner";

const CATEGORIES = ["freeleech", "movies", "tv"];

const inputClass =
  "w-full rounded bg-muted border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50";

const formatDate = (d: string | null) => {
  if (!d) return "\u2014";
  return d.length > 16 ? d.slice(0, 16) : d;
};

export default function DatasetsPage() {
  const { data: datasets = [], refetch } = useDatasets();
  const deleteDataset = useDeleteDataset();
  const { data: settings } = useSettings();
  const trackers = settings?.trackers ?? [];

  // Scrape controls
  const [scrapeCategory, setScrapeCategory] = useState("freeleech");
  const [scrapeDays, setScrapeDays] = useState(30);
  const [scrapeStartPage, setScrapeStartPage] = useState(1);
  const [scrapeTrackerId, setScrapeTrackerId] = useState<string>(() =>
    trackers.length > 0 ? trackers[0].id : ""
  );
  const [scrapeJobId, setScrapeJobId] = useState<string | null>(
    () => localStorage.getItem('active-scrape-job')
  );
  const [scrapeRunning, setScrapeRunning] = useState(() => !!localStorage.getItem('active-scrape-job'));

  const handleDelete = async (filename: string) => {
    deleteDataset.mutate(filename);
  };

  const handleScrape = async () => {
    const trackerId = scrapeTrackerId || (trackers.length > 0 ? trackers[0].id : undefined);
    setScrapeRunning(true);
    try {
      const { job_id } = await api.startScrape({
        category: scrapeCategory,
        days: scrapeDays,
        start_page: scrapeStartPage,
        tracker_id: trackerId || undefined,
      });
      setScrapeJobId(job_id);
      localStorage.setItem('active-scrape-job', job_id);
    } catch {
      setScrapeRunning(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      {/* New Scrape */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle>Scrape</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Tracker</label>
            <select
              value={scrapeTrackerId}
              onChange={(e) => setScrapeTrackerId(e.target.value)}
              disabled={scrapeRunning}
              className={inputClass}
            >
              {trackers.length === 0 && (
                <option value="">No trackers — configure in Settings</option>
              )}
              {trackers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tracker_type}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Category</label>
              <select
                value={scrapeCategory}
                onChange={(e) => setScrapeCategory(e.target.value)}
                disabled={scrapeRunning}
                className={inputClass}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Days</label>
              <select
                value={scrapeDays}
                onChange={(e) => setScrapeDays(Number(e.target.value))}
                disabled={scrapeRunning}
                className={inputClass}
              >
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Start Page</label>
              <input
                type="number"
                value={scrapeStartPage}
                onChange={(e) => setScrapeStartPage(Number(e.target.value))}
                min={1}
                disabled={scrapeRunning}
                className={inputClass}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleScrape}
              disabled={scrapeRunning}
              size="sm"
              className="shrink-0"
            >
              {scrapeRunning ? "Running..." : "Run Scrape"}
            </Button>
            <JobRunner
              jobId={scrapeJobId}
              onComplete={() => {
                setScrapeRunning(false);
                localStorage.removeItem('active-scrape-job');
                refetch();
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Dataset table */}
      <h2 className="text-base font-semibold">Datasets</h2>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Scraped At</TableHead>
                <TableHead className="text-right">Torrents</TableHead>
                <TableHead>Date Range</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {datasets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No datasets found. Run a scrape to get started.
                  </TableCell>
                </TableRow>
              )}
              {datasets.map((ds) => (
                <TableRow key={ds.filename}>
                  <TableCell>
                    <Badge variant="secondary">{ds.category}</Badge>
                  </TableCell>
                  <TableCell className="text-foreground">
                    {ds.scraped_at ?? "Legacy"}
                  </TableCell>
                  <TableCell className="text-right text-foreground">
                    {ds.torrent_count?.toLocaleString() ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {ds.min_date && ds.max_date
                      ? `${formatDate(ds.min_date)} \u2014 ${formatDate(ds.max_date)}`
                      : "\u2014"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="destructive"
                      size="xs"
                      onClick={() => handleDelete(ds.filename)}
                      disabled={deleteDataset.isPending}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
