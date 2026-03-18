import { create } from 'zustand';

interface AppState {
  selectedDatasetKey: string | null;
  selectedSeedboxId: string | null;
  enabledFilterIds: string[];
  setSelectedDatasetKey: (key: string | null) => void;
  setSelectedSeedboxId: (id: string | null) => void;
  toggleFilter: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedDatasetKey: null,
  selectedSeedboxId: null,
  enabledFilterIds: [],
  setSelectedDatasetKey: (key) => set({ selectedDatasetKey: key }),
  setSelectedSeedboxId: (id) => set({ selectedSeedboxId: id }),
  toggleFilter: (id) => set((state) => ({
    enabledFilterIds: state.enabledFilterIds.includes(id)
      ? state.enabledFilterIds.filter((f) => f !== id)
      : [...state.enabledFilterIds, id],
  })),
}));
