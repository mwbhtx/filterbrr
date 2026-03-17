import type { Filter, SyncFilterEntry } from "../types";

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
      <button
        key={filter._id}
        onClick={() => onSelect(filter)}
        className={`w-full text-left px-3 py-2.5 transition-colors ${
          isSelected
            ? "bg-gray-800 border-l-2 border-blue-500 pl-[10px]"
            : "border-l-2 border-transparent hover:bg-gray-800/50"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-gray-100 truncate font-medium">
            {filter._source === "temp" && <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-1.5 align-middle" />}
            {isDirty && filter._source !== "temp" && <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-1.5 align-middle" title="Unsaved changes" />}
            {filter.name}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {filter._source === "temp" && onDeleteFilter && (
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); onDeleteFilter(filter._id); }}
                className="text-[10px] text-gray-500 hover:text-red-400 cursor-pointer px-1"
              >
                ✕
              </span>
            )}
            <span
              className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                filter.data.enabled
                  ? "bg-green-900/60 text-green-400"
                  : "bg-gray-700 text-gray-400"
              }`}
            >
              {filter.data.enabled ? "on" : "off"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
          <span>P{filter.data.priority}</span>
          {rateLimit && <span>{rateLimit}</span>}
          {filter.data.delay > 0 && <span>{filter.data.delay}s delay</span>}
          {/* Sync status */}
          {sync && (
            <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${
              sync.source === "both"
                ? "bg-green-900/40 text-green-400"
                : "bg-gray-700 text-gray-500"
            }`}>
              {sync.source === "both" ? "synced" : "local"}
            </span>
          )}
        </div>
        {/* Push/Pull buttons */}
        {onPush && (
          <div className="flex items-center gap-2 mt-1.5" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onPush(filter._id)}
              disabled={isSyncing}
              className="text-[10px] text-blue-400 hover:text-blue-300 disabled:opacity-50"
            >
              {isSyncing ? "..." : "Push"}
            </button>
            {sync?.remote_id != null && onPull && (
              <button
                onClick={() => onPull(sync.remote_id!)}
                disabled={isSyncing}
                className="text-[10px] text-green-400 hover:text-green-300 disabled:opacity-50"
              >
                {isSyncing ? "..." : "Pull"}
              </button>
            )}
            {sync && (
              <span className="text-[10px] text-gray-600 ml-auto">
                {sync.last_synced
                  ? new Date(sync.last_synced).toLocaleDateString()
                  : "never synced"}
              </span>
            )}
          </div>
        )}
      </button>
    );
  };

  const renderGroup = (label: string, items: Filter[], action?: React.ReactNode) => {
    if (items.length === 0) return null;
    return (
      <div>
        <div className="px-3 py-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            {label}
          </span>
          {action}
        </div>
        <div className="flex flex-col">{items.map(renderItem)}</div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full border-r border-gray-800">
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-100">Filters</h2>
        <button
          onClick={onCreateNew}
          className="text-xs font-medium px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          + New
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {filters.length === 0 && (
          <p className="px-3 py-4 text-sm text-gray-500 text-center">
            No filters yet
          </p>
        )}
        {renderGroup("Generated", generatedAndTemp, generatedAndTemp.some(f => f._source === "temp") ? (
          <div className="flex items-center gap-2">
            {onSaveAllTemp && (
              <button
                onClick={onSaveAllTemp}
                className="text-[10px] text-green-400 hover:text-green-300"
              >
                Save All
              </button>
            )}
            {onClearTemp && (
              <button
                onClick={onClearTemp}
                className="text-[10px] text-red-400 hover:text-red-300"
              >
                Dismiss All
              </button>
            )}
          </div>
        ) : undefined)}
        {renderGroup("User", user)}
      </div>
      {/* Bulk sync actions */}
      {(onPushAll || onPullAll) && (
        <div className="px-3 py-2 border-t border-gray-800 flex items-center gap-2">
          {onPushAll && (
            <button
              onClick={onPushAll}
              disabled={syncingId != null}
              className="text-[10px] font-medium px-2 py-1 rounded bg-blue-600/80 hover:bg-blue-500 text-white disabled:opacity-50"
            >
              {syncingId === "all" ? "Syncing..." : "Push All"}
            </button>
          )}
          {onPullAll && (
            <button
              onClick={onPullAll}
              disabled={syncingId != null}
              className="text-[10px] font-medium px-2 py-1 rounded bg-green-700/80 hover:bg-green-600 text-white disabled:opacity-50"
            >
              {syncingId === "all" ? "Syncing..." : "Pull All"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
