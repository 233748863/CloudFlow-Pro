import { create } from 'zustand';

interface UIStateStore {
  isDirty: boolean;
  setDirty: (dirty: boolean) => void;
}

export const useUIStateStore = create<UIStateStore>((set) => ({
  isDirty: false,
  setDirty: (dirty) => set({ isDirty: dirty }),
}));
