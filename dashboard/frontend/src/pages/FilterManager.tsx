import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import type { Filter, FilterData } from "../types";
import FilterList from "../components/FilterList";
import FilterForm from "../components/FilterForm";

const emptyFilterData: FilterData = {
  enabled: true,
  min_size: "",
  max_size: "",
  delay: 0,
  priority: 0,
  max_downloads: 0,
  max_downloads_unit: "HOUR",
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

function newFilter(): Filter {
  return { name: "New Filter", version: "1", data: { ...emptyFilterData }, _id: "", _source: "saved" };
}

export default function FilterManager() {
  const [filters, setFilters] = useState<Filter[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftFilter, setDraftFilter] = useState<Filter | null>(null);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFilters = useCallback(async () => {
    try {
      const data = await api.getFilters();
      setFilters(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load filters");
    }
  }, []);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  const selectedFilter = filters.find((f) => f._id === selectedId) ?? null;

  const handleSelect = (filter: Filter) => {
    setSelectedId(filter._id);
    setDraftFilter(null);
    setIsCreateMode(false);
    setError(null);
  };

  const handleCreateNew = () => {
    setSelectedId(null);
    setDraftFilter(newFilter());
    setIsCreateMode(true);
    setError(null);
  };

  const handleSave = async (filter: Filter) => {
    try {
      if (isCreateMode) {
        const created = await api.createFilter(filter);
        await loadFilters();
        setSelectedId(created._id);
        setDraftFilter(null);
        setIsCreateMode(false);
      } else if (selectedId) {
        await api.updateFilter(selectedId, filter);
        await loadFilters();
      }
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save filter");
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    try {
      await api.deleteFilter(selectedId);
      setSelectedId(null);
      await loadFilters();
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete filter");
    }
  };

  const handleDuplicate = () => {
    const source = selectedFilter;
    if (!source) return;
    setDraftFilter({
      name: source.name + "-copy",
      version: source.version,
      data: { ...source.data },
      _id: "",
      _source: "saved",
    });
    setSelectedId(null);
    setIsCreateMode(true);
    setError(null);
  };

  const currentFilter: Filter | null = isCreateMode
    ? draftFilter
      ? { ...draftFilter, _id: "", _source: "saved" as const }
      : null
    : selectedFilter;

  const readOnly = !isCreateMode && selectedFilter?._source === "generated";

  return (
    <div className="flex h-full">
      {/* Left sidebar */}
      <div className="w-72 flex-shrink-0 border-r border-gray-800 overflow-y-auto">
        <FilterList
          filters={filters}
          selectedId={isCreateMode ? null : selectedId}
          onSelect={handleSelect}
          onCreateNew={handleCreateNew}
        />
      </div>

      {/* Main area */}
      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 flex items-center justify-between rounded bg-red-900/50 border border-red-700 px-4 py-2 text-red-200">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-4 text-red-400 hover:text-red-200"
            >
              Dismiss
            </button>
          </div>
        )}

        {currentFilter ? (
          <FilterForm
            filter={currentFilter}
            readOnly={readOnly}
            onSave={handleSave}
            onDelete={!isCreateMode && selectedId ? handleDelete : undefined}
            onDuplicate={!isCreateMode && selectedFilter ? handleDuplicate : undefined}
          />
        ) : (
          <p className="text-gray-500">Select a filter or create a new one.</p>
        )}
      </div>
    </div>
  );
}
