import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api/client";
import type { Filter, AutobrrConnectionStatus, SyncFilterEntry } from "../types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/Toast";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

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
    case "both": return "bg-accent/20 text-accent-foreground border-accent";
    case "local_only": return "bg-primary/20 text-primary-foreground border-primary";
    case "remote_only": return "bg-accent/20 text-accent-foreground border-accent";
    default: return "bg-muted text-muted-foreground border-border";
  }
};

export default function SyncPage() {
  const [status, setStatus] = useState<AutobrrConnectionStatus | null>(null);
  const [statusVisible, setStatusVisible] = useState(false);
  const [entries, setEntries] = useState<SyncFilterEntry[]>([]);
  const [localFilters, setLocalFilters] = useState<Filter[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();
  const [hasFetchedRemote, setHasFetchedRemote] = useState(false);
  const statusTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showStatus = (s: AutobrrConnectionStatus) => {
    setStatus(s);
    setStatusVisible(true);
    clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatusVisible(false), 4000);
  };

  // Load local filters instantly on mount
  useEffect(() => {
    api.getFilters().then(setLocalFilters).catch(() => {});
  }, []);

  // Fetch remote sync status (only when user triggers it)
  const refreshRemote = useCallback(async () => {
    setLoading(true);

    try {
      const [statusResult, syncResult] = await Promise.all([
        api.getAutobrrStatus(),
        api.getSyncStatus(),
      ]);
      showStatus(statusResult);
      setEntries(syncResult);
      setHasFetchedRemote(true);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("400")) {
        showStatus({ connected: false, error: "Autobrr not configured — go to Settings" });
        setEntries([]);
      } else {
        toast(err instanceof Error ? err.message : "Failed to load sync status", "error");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadLocal = async () => {
    const filters = await api.getFilters();
    setLocalFilters(filters);
  };

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    const items = hasFetchedRemote ? entries : localFilters;
    const keys = hasFetchedRemote
      ? entries.map((e) => e.name)
      : localFilters.map((f) => f.name);
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(keys));
    }
  };

  const handlePullAll = async () => {
    setSyncing(true);

    try {
      await api.pullAll();
      await refreshRemote();
      await reloadLocal();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Pull failed", "error");
    } finally {
      setSyncing(false);
    }
  };

  const handlePushAll = async () => {
    setSyncing(true);

    try {
      await api.pushAll();
      await refreshRemote();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Push failed", "error");
    } finally {
      setSyncing(false);
    }
  };

  const handlePullOne = async (remoteId: number) => {
    setSyncing(true);

    try {
      await api.pullFilter(String(remoteId));
      await refreshRemote();
      await reloadLocal();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Pull failed", "error");
    } finally {
      setSyncing(false);
    }
  };

  const handlePushOne = async (localId: string) => {
    setSyncing(true);

    try {
      await api.pushFilter(localId);
      await refreshRemote();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Push failed", "error");
    } finally {
      setSyncing(false);
    }
  };

  const showEntries = hasFetchedRemote;
  const allCount = showEntries ? entries.length : localFilters.length;

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handlePullAll}
          disabled={syncing || !status?.connected}
          size="sm"
          variant="secondary"
        >
          {syncing ? "Syncing..." : "Pull All from Autobrr"}
        </Button>
        <Button
          onClick={handlePushAll}
          disabled={syncing || !status?.connected}
          size="sm"
        >
          {syncing ? "Syncing..." : "Push All to Autobrr"}
        </Button>
        <Button
          onClick={refreshRemote}
          disabled={loading}
          size="sm"
          variant="outline"
        >
          {loading ? "Checking..." : "Check Autobrr"}
        </Button>
      </div>

      {/* Filter sync table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={selected.size === allCount && allCount > 0}
                    onChange={selectAll}
                    className="rounded"
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Last Synced</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!showEntries && localFilters.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No local filters. Create filters in the Simulator tab to get started.
                  </TableCell>
                </TableRow>
              )}
              {!showEntries &&
                localFilters.map((f) => (
                  <TableRow key={f._id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selected.has(f.name)}
                        onChange={() => toggleSelect(f.name)}
                        className="rounded"
                      />
                    </TableCell>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell>
                      <span
                        className={`text-xs px-2 py-0.5 rounded border ${sourceBadgeClass("local_only")}`}
                      >
                        Local
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">&mdash;</TableCell>
                    <TableCell className="text-right">
                      <button
                        onClick={() => handlePushOne(f._id)}
                        disabled={syncing || !status?.connected}
                        className="text-xs text-primary hover:text-primary disabled:opacity-50"
                        title="Push to autobrr"
                      >
                        Push
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              {showEntries && entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No filters found locally or in autobrr.
                  </TableCell>
                </TableRow>
              )}
              {showEntries &&
                entries.map((entry) => (
                  <TableRow key={entry.name}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selected.has(entry.name)}
                        onChange={() => toggleSelect(entry.name)}
                        className="rounded"
                      />
                    </TableCell>
                    <TableCell className="font-medium">{entry.name}</TableCell>
                    <TableCell>
                      <span
                        className={`text-xs px-2 py-0.5 rounded border ${sourceBadgeClass(entry.source)}`}
                      >
                        {sourceLabel(entry.source)}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.last_synced
                        ? new Date(entry.last_synced).toLocaleString()
                        : "Never"}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      {entry.remote_id != null && (
                        <button
                          onClick={() => handlePullOne(entry.remote_id!)}
                          disabled={syncing}
                          className="text-xs text-accent-foreground hover:text-accent-foreground disabled:opacity-50"
                          title="Pull from autobrr"
                        >
                          Pull
                        </button>
                      )}
                      {entry.local_id != null && (
                        <button
                          onClick={() => handlePushOne(entry.local_id!)}
                          disabled={syncing}
                          className="text-xs text-primary hover:text-primary disabled:opacity-50"
                          title="Push to autobrr"
                        >
                          Push
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Connection status toast */}
      {status && (
        <div
          className={`px-4 py-2 rounded text-sm transition-opacity duration-500 ${
            statusVisible ? "opacity-100" : "opacity-0"
          } ${
            status.connected
              ? "bg-accent/10 border border-accent text-accent-foreground"
              : "bg-destructive/10 border border-destructive text-destructive"
          }`}
        >
          {status.connected
            ? `Connected to autobrr \u2014 ${status.filter_count} filters`
            : `Not connected: ${status.error}`}
        </div>
      )}
    </div>
  );
}
