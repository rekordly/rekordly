import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RecordView = "table" | "cards";

interface UIState {
  isSidebarCollapsed: boolean;
  isMobileDrawerOpen: boolean;
  /** How desktop lists are shown. Phones always get cards. */
  recordView: RecordView;
  setRecordView: (view: RecordView) => void;
  toggleSidebar: () => void;
  toggleMobileDrawer: () => void;
  setMobileDrawerOpen: (open: boolean) => void;
}

/** Layout preferences only. The light/dark choice is owned by next-themes. */
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      isSidebarCollapsed: false,
      isMobileDrawerOpen: false,
      recordView: "table",
      setRecordView: (recordView) => set({ recordView }),
      toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
      toggleMobileDrawer: () => set((state) => ({ isMobileDrawerOpen: !state.isMobileDrawerOpen })),
      setMobileDrawerOpen: (open) => set({ isMobileDrawerOpen: open }),
    }),
    {
      name: "rekordly-ui-preferences",
      partialize: (state) => ({
        isSidebarCollapsed: state.isSidebarCollapsed,
        recordView: state.recordView,
      }),
    },
  ),
);
