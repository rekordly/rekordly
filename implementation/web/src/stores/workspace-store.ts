import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WorkspaceSelection = number | "all";

interface WorkspaceState {
  activeWorkspace: WorkspaceSelection | null;
  setActiveWorkspace: (workspace: WorkspaceSelection) => void;
  clearActiveWorkspace: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      activeWorkspace: null,
      setActiveWorkspace: (activeWorkspace) => set({ activeWorkspace }),
      clearActiveWorkspace: () => set({ activeWorkspace: null }),
    }),
    { name: "rekordly-active-workspace" },
  ),
);
