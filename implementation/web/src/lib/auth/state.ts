import { create } from "zustand";

import type { EmailContinuationKind, OtpPurpose } from "../api/types.ts";
import { sanitizeReturnToPath } from "./onboarding-routes.ts";

export interface AuthFlowState {
  email: string;
  continuation: EmailContinuationKind | null;
  otpPurpose: OtpPurpose | null;
  otpGeneration: number;
  magicLinkGeneration: number;
  preAuthToken: string | null;
  googleLinkProofToken: string | null;
  returnTo: string | null;
  setEmail: (email: string) => void;
  setEmailContinuation: (email: string, continuation: EmailContinuationKind) => void;
  setOtpContext: (email: string, purpose: OtpPurpose) => void;
  advanceOtpGeneration: () => number;
  advanceMagicLinkGeneration: () => number;
  setPreAuthToken: (token: string | null) => void;
  clearPreAuthToken: () => void;
  setGoogleLinkProofToken: (token: string | null) => void;
  clearGoogleLinkProofToken: () => void;
  setReturnTo: (returnTo: string | null | undefined) => void;
  resetAuthFlow: () => void;
}

const INITIAL_STATE = {
  email: "",
  continuation: null as EmailContinuationKind | null,
  otpPurpose: null as OtpPurpose | null,
  otpGeneration: 0,
  magicLinkGeneration: 0,
  preAuthToken: null as string | null,
  googleLinkProofToken: null as string | null,
  returnTo: null as string | null,
};

/**
 * In-memory authentication flow store.
 * Sensitive proof (`preAuthToken`) is kept strictly in JavaScript memory
 * and is never persisted to localStorage, sessionStorage, IndexedDB, or cookies.
 */
export const useAuthFlowStore = create<AuthFlowState>((set, get) => ({
  ...INITIAL_STATE,

  setEmail: (email: string) =>
    set({
      email: email.trim().toLowerCase(),
    }),

  setEmailContinuation: (email: string, continuation: EmailContinuationKind) =>
    set({
      email: email.trim().toLowerCase(),
      continuation,
      otpPurpose: continuation === "registration" ? "registration" : get().otpPurpose,
    }),

  setOtpContext: (email: string, purpose: OtpPurpose) =>
    set({
      email: email.trim().toLowerCase(),
      otpPurpose: purpose,
    }),

  advanceOtpGeneration: () => {
    const nextGeneration = get().otpGeneration + 1;
    set({
      otpGeneration: nextGeneration,
    });
    return nextGeneration;
  },

  advanceMagicLinkGeneration: () => {
    const nextGeneration = get().magicLinkGeneration + 1;
    set({
      magicLinkGeneration: nextGeneration,
    });
    return nextGeneration;
  },

  setPreAuthToken: (token: string | null) =>
    set({
      preAuthToken: token ? token.trim() : null,
    }),

  clearPreAuthToken: () =>
    set({
      preAuthToken: null,
    }),

  setGoogleLinkProofToken: (token: string | null) =>
    set({
      googleLinkProofToken: token ? token.trim() : null,
    }),

  clearGoogleLinkProofToken: () =>
    set({
      googleLinkProofToken: null,
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
