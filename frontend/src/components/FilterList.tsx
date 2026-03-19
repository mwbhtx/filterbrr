import type { Filter, SyncFilterEntry, AutobrrConnectionStatus } from "../types";

interface FilterListProps {
  filters: Filter[];
  selectedId: string | null;
  onSelect: (filter: Filter) => void;
  onCreateNew: () => void;
  onClearTemp?: () => void;
  onSaveAllTemp?: () => void;
  onDeleteFilter?: (id: string) => void;
  syncByName?: Map<string, SyncFilterEntry>;
  dirtyIds?: Set<string>;
  syncingId?: string | null;
  onPush?: (filterId: string) => void;
  onPull?: (remoteId: number) => void;
  onPushAll?: () => void;
  onPullAll?: () => void;
  onCheckConnection?: () => void;
  connectionStatus?: AutobrrConnectionStatus | null;
  checkingConnection?: boolean;
  loading?: boolean;
}

export default function FilterList({
  filters,
  selectedId,
  onSelect,
  onCreateNew,
  onClearTemp,
  onSaveAllTemp,
  onDeleteFilter,
  syncByName,
  dirtyIds,
  syncingId,
  onPush,
  onPull,
  onPushAll,
  onPullAll,
  onCheckConnection,
  connectionStatus,
  checkingConnection,
  loading,
}: FilterListProps) {
  const generatedAndTemp = filters.filter((f) => f._source === "generated" || f._source === "temp");
  const user = filters.filter((f) => f._source === "saved");

  const formatRateLimit = (f: Filter) => {
    if (!f.data.max_downloads) return null;
    const unit = f.data.max_downloads_unit === "HOUR" ? "h" : "d";
    return `${f.data.max_downloads}/${unit}`;
  };

  const renderItem = (filter: Filter) => {
    const isSelected = filter._id === selectedId;
    const rateLimit = formatRateLimit(filter);
    const sync = syncByName?.get(filter.name);
    const isDirty = dirtyIds?.has(filter._id);
    const isSyncing = syncingId === filter._id || syncingId === "all";

    return (
      <div
        key={filter._id}
        onClick={() => onSelect(filter)}
        className={`w-full text-left px-3 py-2.5 transition-colors cursor-pointer ${
          isSelected
            ? "bg-muted border-l-2 border-primary pl-[10px]"
            : "border-l-2 border-transparent hover:bg-muted/50"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-foreground truncate font-medium">
            {filter._source === "temp" && <span className="inline-block w-2 h-2 rounded-full bg-accent mr-1.5 align-middle" />}
            {isDirty && filter._source !== "temp" && <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1.5 align-middle" title="Unsaved changes" />}
            {filter.name}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {filter._source === "temp" && onDeleteFilter && (
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); onDeleteFilter(filter._id); }}
                className="text-[10px] text-muted-foreground hover:text-destructive cursor-pointer px-1"
              >
                ✕
              </span>
            )}
            <span
              className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                filter.data.enabled
                  ? "bg-accent/20 text-accent-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {filter.data.enabled ? "on" : "off"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span>P{filter.data.priority}</span>
          {rateLimit && <span>{rateLimit}</span>}
          {filter.data.delay > 0 && <span>{filter.data.delay}s delay</span>}
          {sync && (
            <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${
              sync.source === "both"
                ? "bg-accent/20 text-accent-foreground"
                : "bg-muted text-muted-foreground"
            }`}>
              {sync.source === "both" ? "synced" : "local"}
            </span>
          )}
        </div>
        {(onPush || onPull) && (
          <div className="flex items-center gap-2 mt-1.5" onClick={(e) => e.stopPropagation()}>
            {onPush && (
              <button
                onClick={() => onPush(filter._id)}
                disabled={isSyncing}
                className="text-[10px] text-primary hover:text-primary disabled:opacity-50"
              >
                {isSyncing ? "..." : "Push"}
              </button>
            )}
            {sync?.remote_id != null && onPull && (
              <button
                onClick={() => onPull(sync.remote_id!)}
                disabled={isSyncing}
                className="text-[10px] text-accent-foreground hover:text-accent-foreground disabled:opacity-50"
              >
                {isSyncing ? "..." : "Pull"}
              </button>
            )}
            {sync && (
              <span className="text-[10px] text-muted-foreground ml-auto">
                {sync.last_synced
                  ? new Date(sync.last_synced).toLocaleDateString()
                  : "never synced"}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderGroup = (label: string, items: Filter[], action?: React.ReactNode) => {
    if (items.length === 0) return null;
    return (
      <div>
        <div className="px-3 py-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          {action}
        </div>
        <div className="flex flex-col">{items.map(renderItem)}</div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Filters</h2>
        <button
          onClick={onCreateNew}
          className="text-xs font-medium px-2.5 py-1 rounded bg-primary hover:bg-primary/90 text-primary-foreground transition-colors"
        >
          + New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {loading && filters.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
            <p className="text-xs text-muted-foreground">Loading filters…</p>
          </div>
        )}
        {!loading && filters.length === 0 && (
          <p className="px-3 py-4 text-sm text-muted-foreground text-center">
            No filters yet
          </p>
        )}
        {renderGroup("Generated", generatedAndTemp, generatedAndTemp.some(f => f._source === "temp") ? (
          <div className="flex items-center gap-2">
            {onSaveAllTemp && (
              <button onClick={onSaveAllTemp} className="text-[10px] text-accent-foreground hover:text-accent-foreground">
                Save All
              </button>
            )}
            {onClearTemp && (
              <button onClick={onClearTemp} className="text-[10px] text-destructive hover:text-destructive">
                Dismiss
              </button>
            )}
          </div>
        ) : undefined)}
        {renderGroup("User", user)}
      </div>

      {/* Autobrr sync footer */}
      <div className="border-t border-border px-3 py-2 space-y-2">
        {/* Connection status */}
        {connectionStatus && (
          <div className={`text-[10px] px-2 py-1 rounded ${
            connectionStatus.connected
              ? "bg-accent/10 text-accent-foreground"
              : "bg-destructive/10 text-destructive"
          }`}>
            {connectionStatus.connected
              ? `autobrr: ${connectionStatus.filter_count} filters`
              : `autobrr: ${connectionStatus.error ?? "not connected"}`}
          </div>
        )}
        {/* Bulk actions */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {onCheckConnection && (
            <button
              onClick={onCheckConnection}
              disabled={checkingConnection}
              className="text-[10px] font-medium px-2 py-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground disabled:opacity-50"
            >
              {checkingConnection ? "Checking..." : "Check"}
            </button>
          )}
          {onPullAll && (
            <button
              onClick={onPullAll}
              disabled={syncingId != null || !connectionStatus?.connected}
              className="text-[10px] font-medium px-2 py-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground disabled:opacity-50"
            >
              {syncingId === "all" ? "..." : "Pull All"}
            </button>
          )}
          {onPushAll && (
            <button
              onClick={onPushAll}
              disabled={syncingId != null || !connectionStatus?.connected}
              className="text-[10px] font-medium px-2 py-1 rounded bg-primary/80 hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
            >
              {syncingId === "all" ? "..." : "Push All"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
