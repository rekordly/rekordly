import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RecordView = "table" | "cards";
export type MoneyRecordDirection = "money_in" | "money_out" | "transfer";

interface UIState {
  isSidebarCollapsed: boolean;
  isMobileDrawerOpen: boolean;
  /** The shared quick-record drawer lives in the app shell, not in a route. */
  moneyRecordDirection: MoneyRecordDirection | null;
  /** How desktop lists are shown. Phones always get cards. */
  recordView: RecordView;
  setRecordView: (view: RecordView) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  toggleSidebar: () => void;
  toggleMobileDrawer: () => void;
  setMobileDrawerOpen: (open: boolean) => void;
  openMoneyRecord: (direction?: MoneyRecordDirection) => void;
  closeMoneyRecord: () => void;
}

/** Layout preferences only. The light/dark choice is owned by next-themes. */
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      isSidebarCollapsed: false,
      isMobileDrawerOpen: false,
      moneyRecordDirection: null,
      recordView: "table",
      setRecordView: (recordView) => set({ recordView }),
      pageSize: 25,
      setPageSize: (pageSize) => set({ pageSize }),
      toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
      toggleMobileDrawer: () => set((state) => ({ isMobileDrawerOpen: !state.isMobileDrawerOpen })),
      setMobileDrawerOpen: (open) => set({ isMobileDrawerOpen: open }),
      openMoneyRecord: (direction = "money_out") => set({ moneyRecordDirection: direction }),
      closeMoneyRecord: () => set({ moneyRecordDirection: null }),
    }),
    {
      name: "rekordly-ui-preferences",
      partialize: (state) => ({
        isSidebarCollapsed: state.isSidebarCollapsed,
        recordView: state.recordView,
        pageSize: state.pageSize,
      }),
    },
  ),
);
