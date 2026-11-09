"use client";

import { useMemo } from "react";

import {
  hasWorkspacePermission,
  useActiveWorkspace,
} from "@/stores/workspace-store";

import { addActionsFor, navigationFor } from "./navigation";

/** Navigation and add actions for the workspace in view, filtered by its permissions. */
export function useNavigation() {
  const scope = useActiveWorkspace();
  return useMemo(
    () => ({
      scope,
      groups: navigationFor(scope.mode, (permission) => hasWorkspacePermission(scope, permission)),
      addActions: addActionsFor(scope.mode),
    }),
    [scope],
  );
}
