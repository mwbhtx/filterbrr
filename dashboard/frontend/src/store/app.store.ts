import { create } from 'zustand';

interface AppState {
  activeTab: string;
  selectedDatasetKey: string | null;
  selectedSeedboxId: string | null;
  enabledFilterIds: string[];
  setActiveTab: (tab: string) => void;
  setSelectedDatasetKey: (key: string | null) => void;
  setSelectedSeedboxId: (id: string | null) => void;
  toggleFilter: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: 'simulator',
  selectedDatasetKey: null,
  selectedSeedboxId: null,
  enabledFilterIds: [],
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedDatasetKey: (key) => set({ selectedDatasetKey: key }),
  setSelectedSeedboxId: (id) => set({ selectedSeedboxId: id }),
  toggleFilter: (id) => set((state) => ({
    enabledFilterIds: state.enabledFilterIds.includes(id)
      ? state.enabledFilterIds.filter((f) => f !== id)
      : [...state.enabledFilterIds, id],
  })),
}));
