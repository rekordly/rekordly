import { create } from "zustand";

import type { EmailContinuationKind } from "../api/types.ts";
import { sanitizeReturnToPath } from "./onboarding-routes.ts";

export interface AuthFlowState {
  email: string;
  continuation: EmailContinuationKind | null;
  preAuthToken: string | null;
  returnTo: string | null;
  setEmail: (email: string) => void;
  setEmailContinuation: (email: string, continuation: EmailContinuationKind) => void;
  setPreAuthToken: (token: string | null) => void;
  clearPreAuthToken: () => void;
  setReturnTo: (returnTo: string | null | undefined) => void;
  resetAuthFlow: () => void;
}

const INITIAL_STATE = {
  email: "",
  continuation: null as EmailContinuationKind | null,
  preAuthToken: null as string | null,
  returnTo: null as string | null,
};

/**
 * In-memory authentication flow store.
 * Sensitive proof (`preAuthToken`) is kept strictly in JavaScript memory
 * and is never persisted to localStorage, sessionStorage, IndexedDB, or cookies.
 */
export const useAuthFlowStore = create<AuthFlowState>((set) => ({
  ...INITIAL_STATE,

  setEmail: (email: string) =>
    set({
      email: email.trim().toLowerCase(),
    }),

  setEmailContinuation: (email: string, continuation: EmailContinuationKind) =>
    set({
      email: email.trim().toLowerCase(),
      continuation,
    }),

  setPreAuthToken: (token: string | null) =>
    set({
      preAuthToken: token ? token.trim() : null,
    }),

  clearPreAuthToken: () =>
    set({
      preAuthToken: null,
    }),

  setReturnTo: (returnTo: string | null | undefined) =>
    set({
      returnTo: sanitizeReturnToPath(returnTo),
    }),

  resetAuthFlow: () =>
    set({
      ...INITIAL_STATE,
    }),
}));

export function maskEmailAddress(email: string): string {
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf("@");
  if (atIndex <= 0) {
    return "***";
  }
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  if (!domain) {
    return "***";
  }
  const firstChar = local[0] ?? "*";
  return `${firstChar}***@${domain}`;
}
