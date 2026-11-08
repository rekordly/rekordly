import { create } from "zustand";

import type { CurrentUser } from "./session-schema";

export type SessionStatus =
  | "unknown"
  | "restoring"
  | "authenticated"
  | "unauthenticated";

interface SessionState {
  status: SessionStatus;
  user: CurrentUser | null;
  setRestoring: () => void;
  setAuthenticated: (user: CurrentUser) => void;
  setUnauthenticated: () => void;
  hasPermission: (permission: string | readonly string[], matchAll?: boolean) => boolean;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  status: "unknown",
  user: null,

  setRestoring: () => set({ status: "restoring" }),
  setAuthenticated: (user) => set({ status: "authenticated", user }),
  setUnauthenticated: () => set({ status: "unauthenticated", user: null }),

  hasPermission: (permission, matchAll = false) => {
    const user = get().user;
    if (!user) return false;

    const required = Array.isArray(permission) ? permission : [permission];
    const granted = new Set([
      ...(user.permissions ?? []),
      ...user.workspaces.flatMap((workspace) => workspace.permissions ?? []),
    ]);

    if (user.workspaces.some((workspace) => workspace.is_owner) || granted.has("*")) {
      return true;
    }
    return matchAll
      ? required.every((item) => granted.has(item))
      : required.some((item) => granted.has(item));
  },
}));
