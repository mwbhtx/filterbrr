import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import type { AutobrrConnectionStatus, SyncFilterEntry } from "../types";

export default function SyncPage() {
  const [status, setStatus] = useState<AutobrrConnectionStatus | null>(null);
  const [entries, setEntries] = useState<SyncFilterEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusResult, syncResult] = await Promise.all([
        api.getAutobrrStatus(),
        api.getSyncStatus(),
      ]);
      setStatus(statusResult);
      setEntries(syncResult);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("400")) {
        setStatus({ connected: false, error: "Autobrr not configured — go to Settings" });
        setEntries([]);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load sync status");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === entries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entries.map((e) => e.name)));
    }
  };

  const entryKey = (e: SyncFilterEntry) => e.name;

  const handlePullAll = async () => {
    setSyncing(true);
    setError(null);
    try {
      await api.pullAll();
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Pull failed");
    } finally {
      setSyncing(false);
    }
  };

  const handlePushAll = async () => {
    setSyncing(true);
    setError(null);
    try {
      await api.pushAll();
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Push failed");
    } finally {
      setSyncing(false);
    }
  };

  const handlePullOne = async (remoteId: number) => {
    setSyncing(true);
    setError(null);
    try {
      await api.pullFilter(remoteId);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Pull failed");
    } finally {
      setSyncing(false);
    }
  };

  const handlePushOne = async (localId: string) => {
    setSyncing(true);
    setError(null);
    try {
      await api.pushFilter(localId);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Push failed");
    } finally {
      setSyncing(false);
    }
  };

  const sourceLabel = (source: string) => {
    switch (source) {
      case "both": return "Both";
      case "local_only": return "Local Only";
      case "remote_only": return "Remote Only";
      default: return source;
    }
  };

  const sourceBadgeClass = (source: string) => {
    switch (source) {
      case "both": return "bg-green-900/50 text-green-300 border-green-700";
      case "local_only": return "bg-blue-900/50 text-blue-300 border-blue-700";
      case "remote_only": return "bg-yellow-900/50 text-yellow-300 border-yellow-700";
      default: return "bg-gray-800 text-gray-400 border-gray-700";
    }
  };

  return (
    <div className="space-y-6">
      {/* Connection status banner */}
      {status && (
        <div
          className={`px-4 py-2 rounded text-sm ${
            status.connected
              ? "bg-green-900/30 border border-green-800 text-green-300"
              : "bg-red-900/30 border border-red-800 text-red-300"
          }`}
        >
          {status.connected
            ? `Connected to autobrr — ${status.filter_count} filters`
            : `Not connected: ${status.error}`}
        </div>
      )}

      {error && (
        <div className="px-4 py-2 rounded bg-red-900/50 border border-red-700 text-red-200 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 ml-2">x</button>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={handlePullAll}
          disabled={syncing || !status?.connected}
          className="rounded bg-green-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
        >
          {syncing ? "Syncing..." : "Pull All from Autobrr"}
        </button>
        <button
          onClick={handlePushAll}
          disabled={syncing || !status?.connected}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {syncing ? "Syncing..." : "Push All to Autobrr"}
        </button>
        <button
          onClick={loadData}
          disabled={loading}
          className="rounded bg-gray-700 px-4 py-1.5 text-sm font-medium text-gray-200 hover:bg-gray-600 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {/* Filter sync table */}
      <div className="rounded-lg bg-gray-900 border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-xs text-gray-400 uppercase">
              <th className="px-4 py-2">
                <input
                  type="checkbox"
                  checked={selected.size === entries.length && entries.length > 0}
                  onChange={selectAll}
                  className="rounded"
                />
              </th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Source</th>
              <th className="px-4 py-2">Last Synced</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  {status?.connected
                    ? "No filters found. Create filters locally or in autobrr to get started."
                    : "Connect to autobrr in Settings to see sync status."}
                </td>
              </tr>
            )}
            {entries.map((entry) => (
              <tr key={entryKey(entry)} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(entryKey(entry))}
                    onChange={() => toggleSelect(entryKey(entry))}
                    className="rounded"
                  />
                </td>
                <td className="px-4 py-2 font-medium text-gray-200">{entry.name}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded border ${sourceBadgeClass(entry.source)}`}>
                    {sourceLabel(entry.source)}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-400">
                  {entry.last_synced
                    ? new Date(entry.last_synced).toLocaleString()
                    : "Never"}
                </td>
                <td className="px-4 py-2 text-right space-x-2">
                  {entry.remote_id != null && (
                    <button
                      onClick={() => handlePullOne(entry.remote_id!)}
                      disabled={syncing}
                      className="text-xs text-green-400 hover:text-green-300 disabled:opacity-50"
                      title="Pull from autobrr"
                    >
                      Pull
                    </button>
                  )}
                  {entry.local_id != null && (
                    <button
                      onClick={() => handlePushOne(entry.local_id!)}
                      disabled={syncing}
                      className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                      title="Push to autobrr"
                    >
                      Push
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
