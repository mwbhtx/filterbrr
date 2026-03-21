import { useState, useEffect } from "react";
import { api } from "../api/client";
import { SUPPORTED_TRACKERS } from "../types";
import type { TrackerType } from "../types";
import { useDatasets, useDeleteDataset } from "../hooks/useDatasets";
import { useSettings, useUpdateSettings } from "../hooks/useSettings";
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
import { useToast } from "@/components/Toast";

const CATEGORIES = ["freeleech", "movies", "tv"];

const inputClass =
  "w-full rounded bg-muted border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50";


export default function DatasetsPage() {
  const { data: datasets = [], refetch } = useDatasets();
  const deleteDataset = useDeleteDataset();
  const { data: settings } = useSettings();
  const updateSettingsMutation = useUpdateSettings();

  // Tracker selection + credentials
  const [selectedTracker, setSelectedTracker] = useState<TrackerType>(SUPPORTED_TRACKERS[0]);
  const existingTracker = settings?.trackers?.find(t => t.tracker_type === selectedTracker);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Sync credentials from settings when tracker changes
  useEffect(() => {
    if (existingTracker) {
      setUsername(existingTracker.username);
      setPassword(existingTracker.password);
    } else {
      setUsername("");
      setPassword("");
    }
  }, [selectedTracker, existingTracker?.username, existingTracker?.password]);

  // Scrape controls
  const [scrapeCategory, setScrapeCategory] = useState("freeleech");
  const [scrapeDays, setScrapeDays] = useState(30);
  const [scrapeStartPage, setScrapeStartPage] = useState(1);
  const [scrapeJobId, setScrapeJobId] = useState<string | null>(
    () => localStorage.getItem('active-scrape-job')
  );
  const [scrapeRunning, setScrapeRunning] = useState(() => !!localStorage.getItem('active-scrape-job'));
  const { toast } = useToast();

  const handleDelete = async (filename: string) => {
    deleteDataset.mutate(filename);
  };

  const handleScrape = async () => {
    setScrapeRunning(true);
    try {
      // Save credentials to settings before scraping
      const trackerId = existingTracker?.id ?? Math.random().toString(36).slice(2, 10);
      const trackerEntry = {
        id: trackerId,
        tracker_type: selectedTracker,
        username,
        password,
      };
      // Upsert this tracker, keep others
      const otherTrackers = (settings?.trackers ?? []).filter(t => t.tracker_type !== selectedTracker);
      const updatedSettings = {
        ...(settings ?? { autobrr_url: "", autobrr_api_key: "", seedboxes: [] }),
        trackers: [...otherTrackers, trackerEntry],
      };
      await updateSettingsMutation.mutateAsync(updatedSettings);

      const { job_id } = await api.startScrape({
        category: scrapeCategory,
        days: scrapeDays,
        start_page: scrapeStartPage,
        tracker_id: trackerId,
      });
      setScrapeJobId(job_id);
      localStorage.setItem('active-scrape-job', job_id);
    } catch (err) {
      setScrapeRunning(false);
      toast(err instanceof Error ? err.message : 'Scrape failed', "error");
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      {/* New Scrape */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle>Scrape <span className="text-sm font-normal text-muted-foreground ml-2">Enter credentials and time range to build a dataset</span></CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Tracker</label>
            <select
              value={selectedTracker}
              onChange={(e) => setSelectedTracker(e.target.value as TrackerType)}
              disabled={scrapeRunning}
              className={inputClass}
            >
              {SUPPORTED_TRACKERS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={scrapeRunning}
                className={inputClass}
                placeholder="TorrentLeech username"
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={scrapeRunning}
                className={inputClass}
                placeholder="TorrentLeech password"
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
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
                onChange={(e) => setScrapeStartPage(Math.max(1, Number(e.target.value)))}
                min={1}
                disabled={scrapeRunning}
                className={inputClass}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleScrape}
              disabled={scrapeRunning || !username || !password}
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
        <CardContent className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Scraped At</TableHead>
                <TableHead className="text-right">Torrents</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {datasets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
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
                    {ds.torrent_count?.toLocaleString() ?? "\u2014"}
                  </TableCell>
                  <TableCell className="text-foreground text-xs">
                    {ds.min_date ? ds.min_date.slice(0, 10) : "\u2014"}
                  </TableCell>
                  <TableCell className="text-foreground text-xs">
                    {ds.max_date ? ds.max_date.slice(0, 10) : "\u2014"}
                  </TableCell>
                  <TableCell className="text-right text-foreground text-xs">
                    {ds.min_date && ds.max_date
                      ? Math.round((new Date(ds.max_date).getTime() - new Date(ds.min_date).getTime()) / 86400000) + 1
                      : "\u2014"}
                  </TableCell>
                  <TableCell className="text-right text-foreground text-xs">
                    {ds.scrape_duration_sec != null
                      ? ds.scrape_duration_sec >= 60
                        ? `${Math.floor(ds.scrape_duration_sec / 60)}m ${ds.scrape_duration_sec % 60}s`
                        : `${ds.scrape_duration_sec}s`
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
