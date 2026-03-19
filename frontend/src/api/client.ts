import type {
  Filter,
  Dataset,
  Settings,
  SimulationRequest,
  SimulationResult,
  ScrapeRequest,
  ParseRequest,
  AnalyzeRequest,
  AutobrrConnectionStatus,
  SyncFilterEntry,
  AnalysisResults,
} from "../types";
import { getIdToken, refreshSession, logout, clearSession } from '../auth/auth';
import { isDemoUser } from '../auth/useIsDemo';

const BASE = "/api";

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getIdToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${url}`, { ...init, headers });

  if (res.status === 401) {
    // Demo tokens can't be refreshed — redirect to login
    if (isDemoUser()) {
      clearSession();
      window.location.href = '/login';
      throw new Error('Demo session expired');
    }
    try {
      await refreshSession();
      const retryToken = getIdToken();
      const retryHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (retryToken) retryHeaders['Authorization'] = `Bearer ${retryToken}`;
      const retry = await fetch(`${BASE}${url}`, { ...init, headers: retryHeaders });
      if (!retry.ok) {
        logout();
        window.location.href = '/login';
        throw new Error('Session expired');
      }
      return retry.json();
    } catch (err) {
      if ((err as Error).message === 'Session expired') throw err;
      logout();
      window.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T;
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
  deleteDataset: (filename: string) =>
    fetchJSON<{ deleted: string }>(`/datasets/${encodeURIComponent(filename)}`, {
      method: "DELETE",
    }),
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
  getJob: (jobId: string) =>
    fetchJSON<{ id: string; command: string; status: string; progress: string; started_at?: string; result?: Record<string, unknown>; error?: string }>(`/pipeline/jobs/${jobId}`),
  cancelJob: (jobId: string) =>
    fetchJSON<{ cancelled: string }>(`/pipeline/jobs/${jobId}`, { method: 'DELETE' }),

  // Settings
  getSettings: () => fetchJSON<Settings>("/settings"),
  updateSettings: (settings: Settings) =>
    fetchJSON<Settings>("/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),
  verifyTracker: (tracker: { tracker_type: string; username: string; password: string }) =>
    fetchJSON<{ success: boolean; error?: string }>("/settings/trackers/verify", {
      method: "POST",
      body: JSON.stringify(tracker),
    }),

  // Autobrr Sync
  getAutobrrStatus: () => fetchJSON<AutobrrConnectionStatus>("/autobrr/status"),
  testAutobrrConnection: (settings: { autobrr_url: string; autobrr_api_key: string }) =>
    fetchJSON<AutobrrConnectionStatus>("/autobrr/test", {
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

  // Analysis
  getAnalysisResults: (source: string) =>
    fetchJSON<AnalysisResults>(`/analysis/${source}`),
};
