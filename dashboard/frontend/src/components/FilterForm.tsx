import { useState, useEffect, useMemo } from "react";
import type { Filter, FilterData, AnalysisResults, ReleaseGroupRanking } from "../types";

interface FilterFormProps {
  filter: Filter | null;
  analysisResults?: AnalysisResults | null;
  readOnly: boolean;
  onSave: (filter: Filter) => void;
  onDelete?: () => void;
  onPromote?: () => void;
  onChange?: (filter: Filter) => void;
  onPush?: (filterId: string) => void;
  pushing?: boolean;
  onCancel?: () => void;
  isDirty?: boolean;
}

const RESOLUTIONS = ["2160p", "1080p", "720p", "480p", "576p"];
const SOURCES = ["WEB-DL", "WEB", "WEBRip", "BluRay", "Remux", "HDTV", "DVDRip"];

const emptyData: FilterData = {
  enabled: true,
  min_size: "",
  max_size: "",
  delay: 0,
  priority: 0,
  max_downloads: 0,
  max_downloads_unit: "DAY",
  except_releases: "",
  announce_types: [],
  freeleech: false,
  resolutions: [],
  sources: [],
  match_categories: "",
  is_auto_updated: false,
  release_profile_duplicate: null,
  match_release_groups: "",
  except_release_groups: "",
};

type ReleaseGroupMode = "allow" | "block";

export default function FilterForm({
  filter,
  analysisResults,
  readOnly,
  onSave,
  onDelete,
  onPromote,
  onChange,
  onPush,
  pushing,
  onCancel,
  isDirty,
}: FilterFormProps) {
  const [name, setName] = useState("");
  const [data, setData] = useState<FilterData>({ ...emptyData });
  const [releaseGroupMode, setReleaseGroupMode] =
    useState<ReleaseGroupMode>("allow");

  // Sync from props
  useEffect(() => {
    if (filter) {
      setName(filter.name);
      setData({ ...filter.data });
      setReleaseGroupMode(
        filter.data.except_release_groups ? "block" : "allow"
      );
    } else {
      setName("");
      setData({ ...emptyData });
      setReleaseGroupMode("allow");
    }
  }, [filter]);

  const notifyChange = (newName: string, newData: FilterData) => {
    if (filter && onChange) {
      onChange({ ...filter, name: newName, data: newData });
    }
  };

  const updateName = (newName: string) => {
    setName(newName);
    notifyChange(newName, data);
  };

  const update = <K extends keyof FilterData>(key: K, value: FilterData[K]) => {
    const newData = { ...data, [key]: value };
    setData(newData);
    notifyChange(name, newData);
  };

  const toggleArrayItem = (
    key: "resolutions" | "sources",
    item: string
  ) => {
    const arr = data[key];
    const newData = {
      ...data,
      [key]: arr.includes(item)
        ? arr.filter((v) => v !== item)
        : [...arr, item],
    };
    setData(newData);
    notifyChange(name, newData);
  };

  const handleSave = () => {
    const result: Filter = {
      _id: filter?._id ?? "",
      _source: filter?._source ?? "saved",
      name,
      version: filter?.version ?? "1",
      data,
    };
    onSave(result);
  };

  // Release group slider logic
  const sortedGroups = useMemo((): ReleaseGroupRanking[] => {
    if (!analysisResults?.release_groups.length) return [];
    const groups = [...analysisResults.release_groups];
    if (releaseGroupMode === "allow") {
      groups.sort((a, b) => b.score - a.score); // best first
    } else {
      groups.sort((a, b) => a.score - b.score); // worst first
    }
    return groups;
  }, [analysisResults, releaseGroupMode]);

  const sliderValue = useMemo(() => {
    const field = releaseGroupMode === "allow" ? data.match_release_groups : data.except_release_groups;
    if (!field.trim() || !sortedGroups.length) return 0;
    const current = new Set(field.split(",").map(s => s.trim()).filter(Boolean));
    let count = 0;
    for (const g of sortedGroups) {
      if (current.has(g.name)) count++;
      else break;
    }
    return count;
  }, [data.match_release_groups, data.except_release_groups, releaseGroupMode, sortedGroups]);

  const handleSliderChange = (val: number) => {
    const names = sortedGroups.slice(0, val).map(g => g.name).join(",");
    const field = releaseGroupMode === "allow" ? "match_release_groups" : "except_release_groups";
    update(field, names);
  };

  const inputCls =
    "w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed";
  const labelCls = "block text-xs font-medium text-gray-400 mb-1";
  const sectionCls = "space-y-1";

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {filter?._source === "temp" && (
        <div className="mx-4 mt-4 px-3 py-2 rounded bg-yellow-900/40 border border-yellow-700/50 text-yellow-300 text-sm">
          Unsaved filter from analysis
        </div>
      )}

      <div className="p-4 space-y-5">
        {/* Name */}
        <div className={sectionCls}>
          <label className={labelCls}>Name</label>
          <input
            type="text"
            className={inputCls}
            value={name}
            onChange={(e) => updateName(e.target.value)}
            disabled={readOnly}
            placeholder="Filter name"
          />
        </div>

        {/* Enabled + Freeleech */}
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-gray-100">
            <input
              type="checkbox"
              checked={data.enabled}
              onChange={(e) => update("enabled", e.target.checked)}
              disabled={readOnly}
              className="rounded border-gray-700 bg-gray-800 text-blue-500 focus:ring-blue-500"
            />
            Enabled
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-100">
            <input
              type="checkbox"
              checked={data.freeleech}
              onChange={(e) => update("freeleech", e.target.checked)}
              disabled={readOnly}
              className="rounded border-gray-700 bg-gray-800 text-blue-500 focus:ring-blue-500"
            />
            Freeleech
          </label>
        </div>

        {/* Priority + Delay */}
        <div className="grid grid-cols-2 gap-4">
          <div className={sectionCls}>
            <label className={labelCls}>Priority</label>
            <input
              type="number"
              className={inputCls}
              value={data.priority}
              onChange={(e) => update("priority", Number(e.target.value))}
              disabled={readOnly}
            />
          </div>
          <div className={sectionCls}>
            <label className={labelCls}>Delay (seconds)</label>
            <input
              type="number"
              className={inputCls}
              value={data.delay}
              onChange={(e) => update("delay", Number(e.target.value))}
              disabled={readOnly}
              min={0}
            />
          </div>
        </div>

        {/* Size range */}
        <div className="grid grid-cols-2 gap-4">
          <div className={sectionCls}>
            <label className={labelCls}>Min size</label>
            <input
              type="text"
              className={inputCls}
              value={data.min_size}
              onChange={(e) => update("min_size", e.target.value)}
              disabled={readOnly}
              placeholder="e.g. 1GB"
            />
          </div>
          <div className={sectionCls}>
            <label className={labelCls}>Max size</label>
            <input
              type="text"
              className={inputCls}
              value={data.max_size}
              onChange={(e) => update("max_size", e.target.value)}
              disabled={readOnly}
              placeholder="e.g. 30GB"
            />
          </div>
        </div>

        {/* Max downloads + unit */}
        <div className="grid grid-cols-2 gap-4">
          <div className={sectionCls}>
            <label className={labelCls}>Max downloads</label>
            <input
              type="number"
              className={inputCls}
              value={data.max_downloads}
              onChange={(e) => update("max_downloads", Number(e.target.value))}
              disabled={readOnly}
              min={0}
            />
          </div>
          <div className={sectionCls}>
            <label className={labelCls}>Per</label>
            <select
              className={inputCls}
              value={data.max_downloads_unit}
              onChange={(e) => update("max_downloads_unit", e.target.value)}
              disabled={readOnly}
            >
              <option value="HOUR">Hour</option>
              <option value="DAY">Day</option>
            </select>
          </div>
        </div>

        {/* Resolutions */}
        <div className={sectionCls}>
          <label className={labelCls}>Resolutions</label>
          <div className="flex flex-wrap gap-2">
            {RESOLUTIONS.map((res) => (
              <label
                key={res}
                className={`flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded border cursor-pointer select-none transition-colors ${
                  data.resolutions.includes(res)
                    ? "bg-blue-600/20 border-blue-500/50 text-blue-300"
                    : "bg-gray-800 border-gray-700 text-gray-300"
                } ${readOnly ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={data.resolutions.includes(res)}
                  onChange={() => toggleArrayItem("resolutions", res)}
                  disabled={readOnly}
                  className="sr-only"
                />
                {res}
              </label>
            ))}
          </div>
        </div>

        {/* Sources */}
        <div className={sectionCls}>
          <label className={labelCls}>Sources</label>
          <div className="flex flex-wrap gap-2">
            {SOURCES.map((src) => (
              <label
                key={src}
                className={`flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded border cursor-pointer select-none transition-colors ${
                  data.sources.includes(src)
                    ? "bg-blue-600/20 border-blue-500/50 text-blue-300"
                    : "bg-gray-800 border-gray-700 text-gray-300"
                } ${readOnly ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={data.sources.includes(src)}
                  onChange={() => toggleArrayItem("sources", src)}
                  disabled={readOnly}
                  className="sr-only"
                />
                {src}
              </label>
            ))}
          </div>
        </div>

        {/* Match categories */}
        <div className={sectionCls}>
          <label className={labelCls}>Match categories (comma-separated globs)</label>
          <input
            type="text"
            className={inputCls}
            value={data.match_categories}
            onChange={(e) => update("match_categories", e.target.value)}
            disabled={readOnly}
            placeholder="e.g. tv*, movies*"
          />
        </div>

        {/* Release groups */}
        <div className={sectionCls}>
          <label className={labelCls}>Release groups</label>
          <div className="flex items-center gap-4 mb-2">
            <label className="flex items-center gap-1.5 text-sm text-gray-300">
              <input
                type="radio"
                name="releaseGroupMode"
                checked={releaseGroupMode === "allow"}
                onChange={() => {
                  setReleaseGroupMode("allow");
                }}
                disabled={readOnly}
                className="text-blue-500 focus:ring-blue-500"
              />
              Allowlist
            </label>
            <label className="flex items-center gap-1.5 text-sm text-gray-300">
              <input
                type="radio"
                name="releaseGroupMode"
                checked={releaseGroupMode === "block"}
                onChange={() => {
                  setReleaseGroupMode("block");
                }}
                disabled={readOnly}
                className="text-blue-500 focus:ring-blue-500"
              />
              Blocklist
            </label>
          </div>
          {analysisResults && analysisResults.release_groups.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">
                  Score-based selection ({sliderValue} of {sortedGroups.length} groups)
                </span>
              </div>
              <div className="relative h-6">
                <div className="absolute inset-0 rounded-full h-2 top-2" style={{
                  background: 'linear-gradient(to right, #22c55e, #eab308, #ef4444)'
                }} />
                <input
                  type="range"
                  min={0}
                  max={sortedGroups.length}
                  value={sliderValue}
                  onChange={(e) => handleSliderChange(Number(e.target.value))}
                  disabled={readOnly}
                  className="absolute inset-0 w-full appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-gray-400 [&::-webkit-slider-thumb]:shadow"
                />
              </div>
              {sliderValue > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {sortedGroups.slice(0, sliderValue).map((g) => (
                    <span
                      key={g.name}
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        g.tier === "high" ? "bg-green-900/50 text-green-300" :
                        g.tier === "medium" ? "bg-yellow-900/50 text-yellow-300" :
                        g.tier === "low" ? "bg-red-900/50 text-red-300" :
                        "bg-gray-800 text-gray-400"
                      }`}
                    >
                      {g.name} ({g.score})
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          <textarea
            key={releaseGroupMode}
            className={`${inputCls} min-h-[80px] resize-y`}
            value={
              releaseGroupMode === "allow"
                ? data.match_release_groups
                : data.except_release_groups
            }
            onChange={(e) =>
              update(
                releaseGroupMode === "allow"
                  ? "match_release_groups"
                  : "except_release_groups",
                e.target.value
              )
            }
            disabled={readOnly}
            placeholder={
              releaseGroupMode === "allow"
                ? "Groups to allow (one per line)"
                : "Groups to block (one per line)"
            }
          />
        </div>

        {/* Exclude patterns */}
        <div className={sectionCls}>
          <label className={labelCls}>Exclude patterns (except_releases)</label>
          <input
            type="text"
            className={inputCls}
            value={data.except_releases}
            onChange={(e) => update("except_releases", e.target.value)}
            disabled={readOnly}
            placeholder="e.g. *REMUX*, *HDR*"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2 border-t border-gray-700">
          {onPromote && (
            <button
              onClick={onPromote}
              className="px-4 py-2 text-sm font-medium rounded bg-green-700 hover:bg-green-600 text-white transition-colors"
            >
              Save Filter
            </button>
          )}
          {!readOnly && !onPromote && (
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
            >
              Save
            </button>
          )}
          {onCancel && isDirty && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 transition-colors"
            >
              Cancel
            </button>
          )}
          {onPush && filter?._id && (
            <button
              onClick={() => onPush(filter._id)}
              disabled={pushing}
              className="px-4 py-2 text-sm font-medium rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors disabled:opacity-50"
            >
              {pushing ? "Pushing..." : "Push to Autobrr"}
            </button>
          )}
          {onDelete && !readOnly && (
            <button
              onClick={onDelete}
              className="px-4 py-2 text-sm font-medium rounded bg-red-900/60 hover:bg-red-800 text-red-300 transition-colors ml-auto"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
