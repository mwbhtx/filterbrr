import type {
  Filter,
  Dataset,
  AppConfig,
  SimulationRequest,
  SimulationResult,
  ScrapeRequest,
  ParseRequest,
  AnalyzeRequest,
  JobStatus,
  AutobrrSettings,
  AutobrrConnectionStatus,
  SyncFilterEntry,
} from "../types";

const BASE = "/api";

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  getFilters: () => fetchJSON<Filter[]>("/filters"),
  getFilter: (id: string) => fetchJSON<Filter>(`/filters/${id}`),
  createFilter: (filter: Omit<Filter, "_id" | "_source">) =>
    fetchJSON<Filter>("/filters", {
      method: "POST",
      body: JSON.stringify(filter),
    }),
  updateFilter: (id: string, filter: Omit<Filter, "_id" | "_source">) =>
    fetchJSON<Filter>(`/filters/${id}`, {
      method: "PUT",
      body: JSON.stringify(filter),
    }),
  deleteFilter: (id: string) =>
    fetchJSON<{ deleted: boolean }>(`/filters/${id}`, { method: "DELETE" }),
  promoteFilter: (id: string) =>
    fetchJSON<Filter>(`/filters/${id}/promote`, { method: "POST" }),
  clearTempFilters: () =>
    fetchJSON<{ cleared: boolean }>("/pipeline/clear-temp", { method: "POST" }),
  saveAllTempFilters: () =>
    fetchJSON<{ saved: number }>("/pipeline/save-all-temp", { method: "POST" }),

  getDatasets: () => fetchJSON<Dataset[]>("/datasets"),
  getConfig: () => fetchJSON<AppConfig>("/config"),

  runSimulation: (req: SimulationRequest) =>
    fetchJSON<SimulationResult>("/simulation/run", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  startScrape: (req: ScrapeRequest) =>
    fetchJSON<{ job_id: string }>("/pipeline/scrape", {
      method: "POST",
      body: JSON.stringify(req),
    }),
  startParse: (req: ParseRequest) =>
    fetchJSON<{ job_id: string }>("/pipeline/parse", {
      method: "POST",
      body: JSON.stringify(req),
    }),
  startAnalyze: (req: AnalyzeRequest) =>
    fetchJSON<{ job_id: string }>("/pipeline/analyze", {
      method: "POST",
      body: JSON.stringify(req),
    }),
  startReportOnly: (req: AnalyzeRequest) =>
    fetchJSON<{ job_id: string }>("/pipeline/report-only", {
      method: "POST",
      body: JSON.stringify(req),
    }),
  getJobStatus: (jobId: string) =>
    fetchJSON<JobStatus>(`/pipeline/jobs/${jobId}`),

  // Settings
  getSettings: () => fetchJSON<AutobrrSettings>("/settings"),
  updateSettings: (settings: AutobrrSettings) =>
    fetchJSON<AutobrrSettings>("/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),

  // Autobrr Sync
  getAutobrrStatus: () => fetchJSON<AutobrrConnectionStatus>("/autobrr/status"),
  testAutobrrConnection: (settings: AutobrrSettings) =>
    fetchJSON<AutobrrConnectionStatus>("/autobrr/status", {
      method: "POST",
      body: JSON.stringify(settings),
    }),
  getSyncStatus: () => fetchJSON<SyncFilterEntry[]>("/autobrr/filters"),
  pullAll: () => fetchJSON<{ pulled: number }>("/autobrr/pull", { method: "POST" }),
  pullFilter: (remoteId: number) =>
    fetchJSON<Filter>(`/autobrr/pull/${remoteId}`, { method: "POST" }),
  pushAll: () => fetchJSON<{ pushed: number }>("/autobrr/push", { method: "POST" }),
  pushFilter: (localId: string) =>
    fetchJSON<unknown>(`/autobrr/push/${localId}`, { method: "POST" }),
};
