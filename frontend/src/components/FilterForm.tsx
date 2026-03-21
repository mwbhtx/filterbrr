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
  onPull?: () => void;
  pulling?: boolean;
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
  onPull,
  pulling,
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

  const fldCls =
    "w-full rounded bg-input border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed";
  const lblCls = "block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5";

  const chipCls = (active: boolean) =>
    `flex items-center text-xs px-2.5 py-1.5 rounded border cursor-pointer select-none transition-colors ${
      active ? "bg-primary/20 border-primary/50 text-foreground" : "bg-muted border-border text-foreground/60"
    } ${readOnly ? "opacity-50 cursor-not-allowed" : ""}`;

  const toggleCls = (on: boolean) =>
    `relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 transition-colors cursor-pointer ${
      on ? "bg-purple-600 border-purple-600" : "bg-muted border-border"
    }`;
  const toggleDotCls = (on: boolean) =>
    `inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0"}`;

  const [activeTab, setActiveTab] = useState<"general" | "movies" | "music" | "advanced">("general");

  const tabs = [
    { key: "general" as const, label: "General" },
    { key: "movies" as const, label: "Movies and TV" },
    { key: "music" as const, label: "Music" },
    { key: "advanced" as const, label: "Advanced" },
  ];

  // Advanced tab accordion state
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const toggleSection = (key: string) => setExpandedSection(prev => prev === key ? null : key);

  const AccordionItem = ({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) => (
    <div className="border-b border-border/50 last:border-b-0">
      <button onClick={() => toggleSection(id)} className="w-full flex items-center gap-3 py-4 px-1 text-left hover:bg-muted/30 rounded transition-colors">
        <svg className={`size-4 text-muted-foreground shrink-0 transition-transform ${expandedSection === id ? "rotate-90" : ""}`} viewBox="0 0 6 10" fill="none">
          <path d="M1 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </button>
      {expandedSection === id && <div className="pb-4 px-1">{children}</div>}
    </div>
  );

  return (
    <div>
      {/* Tabs — matching autobrr */}
      <div className="flex border-b border-border px-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm transition-colors relative ${
              activeTab === tab.key
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {activeTab === tab.key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-6">

        {/* ── General ── */}
        {activeTab === "general" && (
          <div className="space-y-6">
            {/* Filter Name — half width like autobrr */}
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className={lblCls}>Filter Name</label>
                <input type="text" className={fldCls} value={name} onChange={(e) => updateName(e.target.value)} disabled={readOnly} placeholder="Filter name" />
              </div>
            </div>

            {/* Rules */}
            <div className="pt-2">
              <h3 className="text-base font-bold text-foreground">Rules</h3>
              <p className="text-sm text-muted-foreground mt-0.5 mb-5">Specify rules on how torrents should be handled/selected.</p>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className={lblCls}>Min Size</label>
                    <input type="text" className={fldCls} value={data.min_size} onChange={(e) => update("min_size", e.target.value)} disabled={readOnly} placeholder="eg. 100MiB, 80GB" />
                  </div>
                  <div>
                    <label className={lblCls}>Max Size</label>
                    <input type="text" className={fldCls} value={data.max_size} onChange={(e) => update("max_size", e.target.value)} disabled={readOnly} placeholder="eg. 100MiB, 80GB" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className={lblCls}>Delay</label>
                    <input type="number" className={fldCls} value={data.delay} onChange={(e) => update("delay", Number(e.target.value))} disabled={readOnly} min={0} placeholder="Number of seconds to delay actions" />
                  </div>
                  <div>
                    <label className={lblCls}>Priority</label>
                    <input type="number" className={fldCls} value={data.priority} onChange={(e) => update("priority", Number(e.target.value))} disabled={readOnly} placeholder="0" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className={lblCls}>Max Downloads</label>
                    <input type="number" className={fldCls} value={data.max_downloads} onChange={(e) => update("max_downloads", Number(e.target.value))} disabled={readOnly} min={0} placeholder="Takes any number (0 is infinite)" />
                  </div>
                  <div>
                    <label className={lblCls}>Max Downloads Per</label>
                    <select className={fldCls} value={data.max_downloads_unit} onChange={(e) => update("max_downloads_unit", e.target.value)} disabled={readOnly}>
                      <option value="">Select unit</option>
                      <option value="HOUR">Hour</option>
                      <option value="DAY">Day</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Enabled toggle — matching autobrr style */}
              <div className="mt-6 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Enabled</p>
                  <p className="text-xs text-muted-foreground">Enable or disable this filter.</p>
                </div>
                <button onClick={() => update("enabled", !data.enabled)} disabled={readOnly} className={toggleCls(data.enabled)}>
                  <span className={toggleDotCls(data.enabled)} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Movies and TV ── */}
        {activeTab === "movies" && (
          <div className="space-y-6">
            {/* Quality section — like autobrr */}
            <div>
              <h3 className="text-base font-bold text-foreground">Quality</h3>
              <p className="text-sm text-muted-foreground mt-0.5 mb-5">Set resolution, source, codec and related match constraints.</p>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className={lblCls}>Resolutions</label>
                    <div className="flex flex-wrap gap-1.5">
                      {RESOLUTIONS.map((res) => (
                        <label key={res} className={chipCls(data.resolutions.includes(res))}>
                          <input type="checkbox" checked={data.resolutions.includes(res)} onChange={() => toggleArrayItem("resolutions", res)} disabled={readOnly} className="sr-only" />
                          {res}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={lblCls}>Sources</label>
                    <div className="flex flex-wrap gap-1.5">
                      {SOURCES.map((src) => (
                        <label key={src} className={chipCls(data.sources.includes(src))}>
                          <input type="checkbox" checked={data.sources.includes(src)} onChange={() => toggleArrayItem("sources", src)} disabled={readOnly} className="sr-only" />
                          {src}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className={lblCls}>Except Releases</label>
                  <input type="text" className={fldCls} value={data.except_releases} onChange={(e) => update("except_releases", e.target.value)} disabled={readOnly} placeholder="eg. *REMUX*, *HDR*" />
                </div>
              </div>
            </div>

            {/* Match Categories */}
            <div>
              <label className={lblCls}>Match Categories</label>
              <input type="text" className={fldCls} value={data.match_categories} onChange={(e) => update("match_categories", e.target.value)} disabled={readOnly} placeholder="tv*, movies*" />
            </div>

            {/* Release Groups with score slider */}
            <div>
              <div className="flex items-center gap-4 mb-2">
                <label className={lblCls + " mb-0"}>Release Groups</label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input type="radio" name="releaseGroupMode" checked={releaseGroupMode === "allow"} onChange={() => setReleaseGroupMode("allow")} disabled={readOnly} className="text-primary focus:ring-ring" />
                  Allowlist
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input type="radio" name="releaseGroupMode" checked={releaseGroupMode === "block"} onChange={() => setReleaseGroupMode("block")} disabled={readOnly} className="text-primary focus:ring-ring" />
                  Blocklist
                </label>
              </div>
              {analysisResults && analysisResults.release_groups.length > 0 && (
                <div className="mb-3">
                  <span className="text-xs text-muted-foreground">
                    Score-based selection ({sliderValue} of {sortedGroups.length} groups)
                  </span>
                  <div className="relative h-6 mt-1">
                    <div className="absolute inset-0 rounded-full h-2 top-2" style={{ background: 'linear-gradient(to right, #22c55e, #eab308, #ef4444)' }} />
                    <input
                      type="range" min={0} max={sortedGroups.length} value={sliderValue}
                      onChange={(e) => handleSliderChange(Number(e.target.value))} disabled={readOnly}
                      className="absolute inset-0 w-full appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-gray-400 [&::-webkit-slider-thumb]:shadow"
                    />
                  </div>
                  {sliderValue > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {sortedGroups.slice(0, sliderValue).map((g) => (
                        <span key={g.name} className={`text-[10px] px-1.5 py-0.5 rounded ${
                          g.tier === "low" ? "bg-destructive/20 text-destructive" : "bg-accent/20 text-accent-foreground"
                        }`}>{g.name} ({g.score})</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <textarea
                key={releaseGroupMode}
                className={`${fldCls} min-h-[80px] resize-y`}
                value={releaseGroupMode === "allow" ? data.match_release_groups : data.except_release_groups}
                onChange={(e) => update(releaseGroupMode === "allow" ? "match_release_groups" : "except_release_groups", e.target.value)}
                disabled={readOnly}
                placeholder={releaseGroupMode === "allow" ? "Groups to allow (comma-separated)" : "Groups to block (comma-separated)"}
              />
            </div>
          </div>
        )}

        {/* ── Music ── */}
        {activeTab === "music" && (
          <div className="space-y-6">
            {/* Quality section scaffold */}
            <div>
              <h3 className="text-base font-bold text-foreground">Quality</h3>
              <p className="text-sm text-muted-foreground mt-0.5 mb-5">Format, source, log, etc.</p>

              <div className="grid grid-cols-3 gap-5">
                <div>
                  <label className={lblCls}>Format</label>
                  <select className={fldCls} disabled><option value="">Select...</option></select>
                </div>
                <div>
                  <label className={lblCls}>Quality</label>
                  <select className={fldCls} disabled><option value="">Select...</option></select>
                </div>
                <div>
                  <label className={lblCls}>Media</label>
                  <select className={fldCls} disabled><option value="">Select...</option></select>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground/50 italic">Music filter fields are not yet managed by filterbrr. Coming soon.</p>
          </div>
        )}

        {/* ── Advanced — accordion sections like autobrr ── */}
        {activeTab === "advanced" && (
          <div>
            <AccordionItem id="release-names" title="Release Names" description="Match only certain release names and/or ignore other release names.">
              <div>
                <label className={lblCls}>Except Releases</label>
                <input type="text" className={fldCls} value={data.except_releases} onChange={(e) => update("except_releases", e.target.value)} disabled={readOnly} placeholder="eg. *REMUX*, *HDR*" />
              </div>
            </AccordionItem>

            <AccordionItem id="groups" title="Groups" description="Match only certain groups and/or ignore other groups.">
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input type="radio" name="releaseGroupModeAdv" checked={releaseGroupMode === "allow"} onChange={() => setReleaseGroupMode("allow")} disabled={readOnly} className="text-primary focus:ring-ring" />
                    Allowlist
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input type="radio" name="releaseGroupModeAdv" checked={releaseGroupMode === "block"} onChange={() => setReleaseGroupMode("block")} disabled={readOnly} className="text-primary focus:ring-ring" />
                    Blocklist
                  </label>
                </div>
                <textarea
                  key={`adv-${releaseGroupMode}`}
                  className={`${fldCls} min-h-[60px] resize-y`}
                  value={releaseGroupMode === "allow" ? data.match_release_groups : data.except_release_groups}
                  onChange={(e) => update(releaseGroupMode === "allow" ? "match_release_groups" : "except_release_groups", e.target.value)}
                  disabled={readOnly}
                  placeholder={releaseGroupMode === "allow" ? "Groups to allow (comma-separated)" : "Groups to block (comma-separated)"}
                />
              </div>
            </AccordionItem>

            <AccordionItem id="categories" title="Categories" description="Match or exclude categories (if announced).">
              <div>
                <label className={lblCls}>Match Categories</label>
                <input type="text" className={fldCls} value={data.match_categories} onChange={(e) => update("match_categories", e.target.value)} disabled={readOnly} placeholder="tv*, movies*" />
              </div>
            </AccordionItem>

            <AccordionItem id="freeleech" title="Freeleech" description="Match based off freeleech (if announced).">
              <div className="flex items-center justify-between py-1">
                <p className="text-xs text-muted-foreground">Only match freeleech torrents.</p>
                <button onClick={() => update("freeleech", !data.freeleech)} disabled={readOnly} className={toggleCls(data.freeleech)}>
                  <span className={toggleDotCls(data.freeleech)} />
                </button>
              </div>
            </AccordionItem>
          </div>
        )}
      </div>

      {/* Actions — bottom row: delete left, reset+save right (matching autobrr) */}
      <div className="flex items-center justify-between px-6 py-3 border-t border-border">
        <div className="flex items-center gap-2">
          {onDelete && !readOnly && (
            <button onClick={onDelete} className="px-4 py-2 text-sm font-medium rounded bg-destructive hover:bg-destructive/80 text-white transition-colors">
              Delete Filter
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onPull && filter?._id && (
            <button onClick={onPull} disabled={pulling}
              className="px-4 py-2 text-sm font-medium rounded bg-muted hover:bg-muted/80 text-foreground border border-border transition-colors disabled:opacity-50">
              {pulling ? "Pulling..." : "Pull from Autobrr"}
            </button>
          )}
          {onPush && filter?._id && (
            <button onClick={() => onPush(filter._id)} disabled={pushing || isDirty} title={isDirty ? "Save changes before pushing" : undefined}
              className="px-4 py-2 text-sm font-medium rounded bg-muted hover:bg-muted/80 text-foreground border border-border transition-colors disabled:opacity-50">
              {pushing ? "Pushing..." : "Push to Autobrr"}
            </button>
          )}
          {onCancel && isDirty && (
            <button onClick={onCancel} className="px-4 py-2 text-sm font-medium rounded bg-muted hover:bg-muted/80 text-foreground border border-border transition-colors">
              Reset
            </button>
          )}
          {onPromote && (
            <button onClick={onPromote} className="px-4 py-2 text-sm font-medium rounded bg-primary hover:bg-primary/90 text-primary-foreground transition-colors">
              Save
            </button>
          )}
          {!readOnly && !onPromote && (
            <button onClick={handleSave} className="px-4 py-2 text-sm font-medium rounded bg-primary hover:bg-primary/90 text-primary-foreground transition-colors">
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
