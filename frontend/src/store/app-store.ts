import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Folder } from "@/types";

type Theme = "light" | "dark" | "system";

interface AppStore {
  sidebarOpen: boolean;
  currentFolder: Folder | null;
  selectedDocuments: number[];
  theme: Theme;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setCurrentFolder: (folder: Folder | null) => void;
  toggleDocument: (id: number) => void;
  selectDocument: (id: number) => void;
  deselectDocument: (id: number) => void;
  clearSelection: () => void;
  selectAll: (ids: number[]) => void;
  setTheme: (theme: Theme) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      currentFolder: null,
      selectedDocuments: [],
      theme: "system",

      toggleSidebar: () =>
        set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      setCurrentFolder: (folder) =>
        set({ currentFolder: folder, selectedDocuments: [] }),

      toggleDocument: (id) =>
        set((state) => {
          const exists = state.selectedDocuments.includes(id);
          return {
            selectedDocuments: exists
              ? state.selectedDocuments.filter((did) => did !== id)
              : [...state.selectedDocuments, id],
          };
        }),

      selectDocument: (id) =>
        set((state) => ({
          selectedDocuments: state.selectedDocuments.includes(id)
            ? state.selectedDocuments
            : [...state.selectedDocuments, id],
        })),

      deselectDocument: (id) =>
        set((state) => ({
          selectedDocuments: state.selectedDocuments.filter(
            (did) => did !== id
          ),
        })),

      clearSelection: () => set({ selectedDocuments: [] }),

      selectAll: (ids) => set({ selectedDocuments: ids }),

      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "app-storage",
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        theme: state.theme,
      }),
    }
  )
);
