import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { WILDCARD_PERMISSION } from "../lib/permissions-catalog.ts";
import { useAuthStore } from "./auth-store.ts";
import type { AuthorizedWorkspace, Permission } from "../types/auth.ts";

// ─── Workspace rules ──────────────────────────────────────────────────
// The browser only ever *selects* from the list the API authorised.

export type WorkspaceSelection = number | "all";
export type ShellMode = "personal" | "business" | "all";

export interface WorkspaceScope {
  mode: ShellMode;
  /** The single workspace in view; null in the "all" owner summary. */
  active: AuthorizedWorkspace | null;
  /** The workspaces whose access applies to what is on screen. */
  inScope: readonly AuthorizedWorkspace[];
}

/** The consolidated view is only for someone who owns both kinds of space. */
export function canViewAllSpaces(workspaces: readonly AuthorizedWorkspace[]): boolean {
  const ownsKind = (kind: string) =>
    workspaces.some((workspace) => workspace.kind === kind && workspace.is_owner);
  return ownsKind("personal") && ownsKind("business");
}

/**
 * Turn a stored selection into a real scope. A stored id that is not in the
 * API's list (a removed membership, another user's value) is ignored.
 */
export function resolveWorkspaceScope(
  workspaces: readonly AuthorizedWorkspace[],
  selection: WorkspaceSelection | null,
): WorkspaceScope {
  if (selection === "all" && canViewAllSpaces(workspaces)) {
    return {
      mode: "all",
      active: null,
      inScope: workspaces.filter((workspace) => workspace.is_owner),
    };
  }

  const selected = workspaces.find((workspace) => workspace.id === selection);
  const active =
    selected ?? workspaces.find((workspace) => workspace.kind === "business") ?? workspaces[0] ?? null;

  return {
    mode: active?.kind === "business" ? "business" : "personal",
    active,
    inScope: active ? [active] : [],
  };
}

function workspaceGrants(workspace: AuthorizedWorkspace, permission: Permission): boolean {
  if (workspace.is_owner) return true;
  const granted = workspace.permissions ?? [];
  return granted.includes(WILDCARD_PERMISSION) || granted.includes(permission);
}

/** Access comes only from the workspaces in view, never from another membership. */
export function hasWorkspacePermission(
  scope: WorkspaceScope,
  permission: Permission | readonly Permission[],
  matchAll = false,
): boolean {
  const required: readonly Permission[] = typeof permission === "string" ? [permission] : permission;
  const grantedByScope = (item: Permission) =>
    scope.inScope.some((workspace) => workspaceGrants(workspace, item));
  return matchAll ? required.every(grantedByScope) : required.some(grantedByScope);
}

// ─── Store ────────────────────────────────────────────────────────────

interface WorkspaceState {
  /** Whose selection this is, so it can never carry over to another account on this device. */
  ownerId: number | null;
  selection: WorkspaceSelection | null;
  select: (ownerId: number, selection: WorkspaceSelection) => void;
  clear: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      ownerId: null,
      selection: null,
      select: (ownerId, selection) => set({ ownerId, selection }),
      clear: () => set({ ownerId: null, selection: null }),
    }),
    {
      name: "rekordly-active-workspace",
      // v2: selections are bound to a user; older unbound values are dropped.
      version: 2,
      migrate: () => ({ ownerId: null, selection: null }),
      partialize: (state) => ({ ownerId: state.ownerId, selection: state.selection }),
    },
  ),
);

export interface ActiveWorkspace extends WorkspaceScope {
  workspaces: readonly AuthorizedWorkspace[];
  canViewAll: boolean;
  /** Id for workspace-scoped requests; null in the "all" summary, where writes are not allowed. */
  workspaceId: number | null;
  switchSpace: (space: "personal" | "business" | "all") => void;
  /** Choose an exact workspace; anything the API did not authorise is ignored. */
  selectWorkspace: (selection: WorkspaceSelection) => void;
}

const NO_WORKSPACES: readonly AuthorizedWorkspace[] = [];

/** The one way components learn which workspace they are working in. */
export function useActiveWorkspace(): ActiveWorkspace {
  const user = useAuthStore((state) => state.user);
  const ownerId = useWorkspaceStore((state) => state.ownerId);
  const selection = useWorkspaceStore((state) => state.selection);
  const select = useWorkspaceStore((state) => state.select);

  const workspaces = user?.workspaces ?? NO_WORKSPACES;
  const userId = user?.id ?? null;
  const ownedSelection = ownerId !== null && ownerId === userId ? selection : null;

  return useMemo(() => {
    const scope = resolveWorkspaceScope(workspaces, ownedSelection);
    return {
      ...scope,
      workspaces,
      canViewAll: canViewAllSpaces(workspaces),
      workspaceId: scope.active?.id ?? null,
      switchSpace: (space) => {
        if (userId === null) return;
        if (space === "all") {
          if (canViewAllSpaces(workspaces)) select(userId, "all");
          return;
        }
        const target = workspaces.find((workspace) => workspace.kind === space);
        if (target) select(userId, target.id);
      },
      selectWorkspace: (next) => {
        if (userId === null) return;
        const allowed =
          next === "all"
            ? canViewAllSpaces(workspaces)
            : workspaces.some((workspace) => workspace.id === next);
        if (allowed) select(userId, next);
      },
    };
  }, [ownedSelection, select, userId, workspaces]);
}
