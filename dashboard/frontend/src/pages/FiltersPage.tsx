import { useState } from "react";
import { api } from "../api/client";
import { useFilters, useDeleteFilter } from "../hooks/useFilters";
import type { Filter, AnalysisResults } from "../types";
import FilterList from "../components/FilterList";
import FilterForm from "../components/FilterForm";
import { Button } from "@/components/ui/button";

const genTempId = () => `temp_${Math.random().toString(36).slice(2, 10)}`;

export default function FiltersPage() {
  const { data: persistedFilters = [], refetch } = useFilters();
  const deleteFilterMutation = useDeleteFilter();

  // Temp filters: generated-but-not-yet-saved
  const [tempFilters, setTempFilters] = useState<Filter[]>([]);
  // Dirty (edited-but-not-saved) filter state: id -> unsaved Filter
  const [dirtyMap, setDirtyMap] = useState<Map<string, Filter>>(new Map());

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [analysisResults] = useState<AnalysisResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Combine persistent + temp filters
  const allFilters: Filter[] = [
    ...persistedFilters.map((f) =>
      dirtyMap.has(f._id) ? (dirtyMap.get(f._id) as Filter) : f
    ),
    ...tempFilters,
  ];

  const dirtyIds = new Set(dirtyMap.keys());

  const selectedFilter =
    allFilters.find((f) => f._id === selectedId) ?? null;

  const handleSelect = (filter: Filter) => setSelectedId(filter._id);

  const handleCreateNew = () => {
    const newFilter: Filter = {
      _id: genTempId(),
      _source: "temp",
      name: "New Filter",
      version: "1",
      data: {
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
      },
    };
    setTempFilters((prev) => [...prev, newFilter]);
    setSelectedId(newFilter._id);
  };

  const handleSave = async (filter: Filter) => {
    setError(null);
    try {
      if (filter._source === "temp" || filter._source === "generated") {
        // Promote to saved
        const { _id, _source, ...body } = filter;
        void _source;
        if (_source === "temp" && _id.startsWith("temp_")) {
          // Create new
          const created = await api.createFilter(body);
          setTempFilters((prev) => prev.filter((f) => f._id !== _id));
          setDirtyMap((prev) => {
            const next = new Map(prev);
            next.delete(_id);
            return next;
          });
          await refetch();
          setSelectedId(created._id);
        } else {
          // It's a generated filter stored server-side — promote it
          await api.promoteFilter(_id);
          await refetch();
          setSelectedId(_id);
        }
      } else {
        // Update existing saved filter
        const { _id, _source, ...body } = filter;
        void _source;
        await api.updateFilter(_id, body);
        setDirtyMap((prev) => {
          const next = new Map(prev);
          next.delete(_id);
          return next;
        });
        await refetch();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handlePromote = async () => {
    if (!selectedFilter) return;
    setError(null);
    try {
      await api.promoteFilter(selectedFilter._id);
      setTempFilters((prev) => prev.filter((f) => f._id !== selectedFilter._id));
      await refetch();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Promote failed");
    }
  };

  const handleDelete = async () => {
    if (!selectedFilter) return;
    if (!confirm(`Delete "${selectedFilter.name}"?`)) return;
    setError(null);
    try {
      if (selectedFilter._source === "temp") {
        setTempFilters((prev) => prev.filter((f) => f._id !== selectedFilter._id));
        setSelectedId(null);
      } else {
        await deleteFilterMutation.mutateAsync(selectedFilter._id);
        setDirtyMap((prev) => {
          const next = new Map(prev);
          next.delete(selectedFilter._id);
          return next;
        });
        setSelectedId(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleDeleteTemp = (id: string) => {
    setTempFilters((prev) => prev.filter((f) => f._id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleClearTemp = () => {
    setTempFilters([]);
    if (selectedFilter?._source === "temp") setSelectedId(null);
  };

  const handleSaveAllTemp = async () => {
    setError(null);
    try {
      await api.saveAllTempFilters();
      setTempFilters([]);
      await refetch();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save all failed");
    }
  };

  const handleChange = (updated: Filter) => {
    if (updated._source === "temp") {
      setTempFilters((prev) =>
        prev.map((f) => (f._id === updated._id ? updated : f))
      );
    } else {
      setDirtyMap((prev) => new Map(prev).set(updated._id, updated));
    }
  };

  const handleCancel = () => {
    if (!selectedFilter) return;
    setDirtyMap((prev) => {
      const next = new Map(prev);
      next.delete(selectedFilter._id);
      return next;
    });
  };

  const handlePush = async (filterId: string) => {
    setSyncingId(filterId);
    setError(null);
    try {
      await api.pushFilter(filterId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Push failed");
    } finally {
      setSyncingId(null);
    }
  };

  const handlePushAll = async () => {
    setSyncingId("all");
    setError(null);
    try {
      await api.pushAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Push all failed");
    } finally {
      setSyncingId(null);
    }
  };

  const isReadOnly =
    selectedFilter?._source === "generated" &&
    !selectedFilter?._source.startsWith("temp");
  const isDirty = selectedFilter
    ? dirtyIds.has(selectedFilter._id)
    : false;

  return (
    <div className="flex h-[calc(100vh-10rem)] overflow-hidden rounded-xl border border-border">
      {/* Left sidebar — filter list */}
      <div className="w-64 shrink-0 overflow-hidden">
        <FilterList
          filters={allFilters}
          selectedId={selectedId}
          onSelect={handleSelect}
          onCreateNew={handleCreateNew}
          onClearTemp={handleClearTemp}
          onSaveAllTemp={handleSaveAllTemp}
          onDeleteFilter={handleDeleteTemp}
          dirtyIds={dirtyIds}
          syncingId={syncingId}
          onPush={handlePush}
          onPushAll={handlePushAll}
        />
      </div>

      {/* Right panel — filter form */}
      <div className="flex-1 overflow-hidden border-l border-border">
        {error && (
          <div className="mx-4 mt-4 px-3 py-2 rounded bg-red-900/40 border border-red-700/50 text-red-300 text-sm flex items-center justify-between">
            <span>{error}</span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-200"
            >
              x
            </Button>
          </div>
        )}
        {selectedFilter ? (
          <FilterForm
            filter={selectedFilter}
            analysisResults={analysisResults}
            readOnly={
              selectedFilter._source === "generated" &&
              !tempFilters.some((f) => f._id === selectedFilter._id)
            }
            onSave={handleSave}
            onDelete={
              selectedFilter._source !== "generated" ? handleDelete : undefined
            }
            onPromote={
              selectedFilter._source === "temp" ? handlePromote : undefined
            }
            onChange={handleChange}
            onPush={handlePush}
            pushing={syncingId === selectedFilter._id}
            onCancel={handleCancel}
            isDirty={isDirty}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Select a filter or create a new one
          </div>
        )}
      </div>
    </div>
  );
}
