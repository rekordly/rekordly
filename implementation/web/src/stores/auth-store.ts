import { create } from "zustand";

import {
  authApi,
  AUTH_ROUTES,
  NEUTRAL_PASSWORD_RESET_MESSAGE,
  PROTECTED_APP_ENTRY_ROUTE,
  resolvePostAuthDestination,
  sanitizeReturnToPath,
  type createAuthApi,
  type OtpPurpose,
} from "../lib/auth.ts";
import { ApiClientError, normalizeUnknownError } from "../lib/errors.ts";
import type {
  CreatePasswordFormValues,
  EmailContinueFormValues,
  ForgotPasswordFormValues,
  PasswordSignInFormValues,
  ResetPasswordFormValues,
} from "../lib/schemas/auth.schemas.ts";
import type {
  AuthSessionResponseData,
  EmailContinuationKind,
} from "../types/api.ts";
import type { CurrentUser } from "../types/auth.ts";

export type SessionStatus = "unknown" | "restoring" | "authenticated" | "unauthenticated";

interface AuthState {
  // Signed-in session
  status: SessionStatus;
  user: CurrentUser | null;
  setRestoring: () => void;
  setAuthenticated: (user: CurrentUser) => void;
  setUnauthenticated: () => void;

  // Sign-in in progress
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

const INITIAL_SIGN_IN_STATE = {
  email: "",
  continuation: null as EmailContinuationKind | null,
  preAuthToken: null as string | null,
  returnTo: null as string | null,
};

/**
 * Deliberately memory-only. The profile, workspaces, permissions and pre-auth
 * proof are never written to localStorage, where any injected script could
 * read them and they would outlive the session.
 */
export const useAuthStore = create<AuthState>((set) => ({
  status: "unknown",
  user: null,
  setRestoring: () => set({ status: "restoring" }),
  setAuthenticated: (user) => set({ status: "authenticated", user }),
  setUnauthenticated: () => set({ status: "unauthenticated", user: null }),

  ...INITIAL_SIGN_IN_STATE,
  setEmail: (email) => set({ email: email.trim().toLowerCase() }),
  setEmailContinuation: (email, continuation) =>
    set({ email: email.trim().toLowerCase(), continuation }),
  setPreAuthToken: (token) => set({ preAuthToken: token ? token.trim() : null }),
  clearPreAuthToken: () => set({ preAuthToken: null }),
  setReturnTo: (returnTo) => set({ returnTo: sanitizeReturnToPath(returnTo) }),
  resetAuthFlow: () => set({ ...INITIAL_SIGN_IN_STATE }),
}));

// â”€â”€â”€ Sign-in actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type AuthApiContract = ReturnType<typeof createAuthApi>;

export interface SubmissionGuard {
  isSubmitting: () => boolean;
  run: <TResult>(task: () => Promise<TResult>) => Promise<TResult | undefined>;
}

/**
 * Synchronous in-memory lock that prevents duplicate form submissions
 * even when rapid keyboard Enter presses or double-clicks fire before
 * React re-renders the disabled state.
 */
export function createSubmissionGuard(): SubmissionGuard {
  let active = false;
  return {
    isSubmitting: () => active,
    async run<TResult>(task: () => Promise<TResult>): Promise<TResult | undefined> {
      if (active) {
        return undefined;
      }
      active = true;
      try {
        return await task();
      } finally {
        active = false;
      }
    },
  };
}

export interface EmailContinuationOutcome {
  continuation: EmailContinuationKind;
  email: string;
  nextRoute: string | null;
}

export async function handleEmailContinuationSubmit(
  values: EmailContinueFormValues,
  api: AuthApiContract = authApi,
): Promise<EmailContinuationOutcome> {
  const normalizedEmail = values.email.trim().toLowerCase();
  try {
    const response = await api.continueWithEmail({ email: normalizedEmail });
    useAuthStore.getState().setEmailContinuation(normalizedEmail, response.continuation);
    return {
      continuation: response.continuation,
      email: normalizedEmail,
      nextRoute:
        response.continuation === "password" ? AUTH_ROUTES.LOGIN_PASSWORD : null,
    };
  } catch (error: unknown) {
    throw normalizeUnknownError(error);
  }
}

export interface AuthenticatedRouteOutcome {
  session: AuthSessionResponseData;
  destination: string;
}

export async function handlePasswordSignInSubmit(
  values: PasswordSignInFormValues,
  options?: {
    api?: AuthApiContract;
    returnTo?: string | null;
  },
): Promise<AuthenticatedRouteOutcome> {
  const api = options?.api ?? authApi;
  const normalizedEmail = values.email.trim().toLowerCase();
  try {
    const session = await api.signInWithPassword({
      email: normalizedEmail,
      password: values.password,
    });
    useAuthStore.getState().setEmail(normalizedEmail);
    const returnTo = options?.returnTo ?? useAuthStore.getState().returnTo;
    const destination = resolvePostAuthDestination(session.onboarding_status, returnTo);
    return {
      session,
      destination,
    };
  } catch (error: unknown) {
    throw normalizeUnknownError(error, [values.password]);
  }
}

export interface ForgotPasswordOutcome {
  message: string;
  email: string;
}

export async function handleForgotPasswordSubmit(
  values: ForgotPasswordFormValues,
  api: AuthApiContract = authApi,
): Promise<ForgotPasswordOutcome> {
  const normalizedEmail = values.email.trim().toLowerCase();
  try {
    await api.requestPasswordReset({ email: normalizedEmail });
    useAuthStore.getState().setEmail(normalizedEmail);
    return {
      message: NEUTRAL_PASSWORD_RESET_MESSAGE,
      email: normalizedEmail,
    };
  } catch (error: unknown) {
    throw normalizeUnknownError(error);
  }
}

export function scrubTokenFromBrowserUrl(cleanPathname: string = AUTH_ROUTES.RESET_PASSWORD): void {
  if (typeof window === "undefined" || !window.history?.replaceState) {
    return;
  }
  window.history.replaceState(null, "", cleanPathname);
}

export async function handleResetPasswordCompleteSubmit(
  token: string | null | undefined,
  values: ResetPasswordFormValues,
  options?: {
    api?: AuthApiContract;
    returnTo?: string | null;
    onTokenConsumed?: () => void;
  },
): Promise<AuthenticatedRouteOutcome> {
  const trimmedToken = (token ?? "").trim();
  if (!trimmedToken) {
    throw new ApiClientError({
      code: "INVALID_PROOF",
      message:
        "This password reset link is invalid, expired, or has already been used. Please request a new reset link.",
      status: 401,
    });
  }

  const api = options?.api ?? authApi;
  try {
    const session = await api.completePasswordReset({
      token: trimmedToken,
      password: values.password,
    });

    if (options?.onTokenConsumed) {
      options.onTokenConsumed();
    } else {
      scrubTokenFromBrowserUrl(AUTH_ROUTES.RESET_PASSWORD);
    }

    const returnTo = options?.returnTo ?? useAuthStore.getState().returnTo;
    const destination = resolvePostAuthDestination(session.onboarding_status, returnTo);
    return {
      session,
      destination,
    };
  } catch (error: unknown) {
    throw normalizeUnknownError(error, [trimmedToken, values.password]);
  }
}

/**
 * A passwordless account gets a pre-auth proof instead of a session and must
 * create a password next. The proof stays in memory only.
 */
function destinationAfterProof(
  session: AuthSessionResponseData,
  returnTo?: string | null,
): string {
  if (session.requires_password && session.pre_auth_token) {
    useAuthStore.getState().setPreAuthToken(session.pre_auth_token);
    return AUTH_ROUTES.CREATE_PASSWORD;
  }
  return resolvePostAuthDestination(
    session.onboarding_status,
    returnTo ?? useAuthStore.getState().returnTo,
  );
}

export async function handleOtpVerifySubmit(
  email: string,
  purpose: OtpPurpose,
  code: string,
  api: AuthApiContract = authApi,
): Promise<AuthenticatedRouteOutcome> {
  try {
    const session = await api.verifyOtp(email, purpose, code);
    return { session, destination: destinationAfterProof(session) };
  } catch (error: unknown) {
    throw normalizeUnknownError(error, [code]);
  }
}

export async function handleMagicLinkConfirm(
  token: string,
  api: AuthApiContract = authApi,
): Promise<AuthenticatedRouteOutcome> {
  try {
    const session = await api.confirmMagicLink(token);
    return { session, destination: destinationAfterProof(session) };
  } catch (error: unknown) {
    throw normalizeUnknownError(error, [token]);
  }
}

const GOOGLE_RETURN_KEY = "rekordly-google-return-to";

/** Asks the API for Google's URL, which also sets the signed flow cookie, then goes there. */
export async function startGoogleSignIn(onError: (message: string) => void): Promise<void> {
  try {
    const returnTo = useAuthStore.getState().returnTo ?? PROTECTED_APP_ENTRY_ROUTE;
    window.sessionStorage.setItem(GOOGLE_RETURN_KEY, returnTo);
    window.open(await authApi.startGoogle(returnTo), "_self");
  } catch (error: unknown) {
    onError(normalizeUnknownError(error).message);
  }
}

function takeGoogleReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(GOOGLE_RETURN_KEY);
  window.sessionStorage.removeItem(GOOGLE_RETURN_KEY);
  return sanitizeReturnToPath(value);
}

export type GoogleCallbackOutcome =
  | { kind: "signed-in"; destination: string }
  | { kind: "link-required"; linkProofToken: string; returnTo: string | null };

export async function handleGoogleCallback(
  code: string,
  state: string,
  api: AuthApiContract = authApi,
): Promise<GoogleCallbackOutcome> {
  const returnTo = takeGoogleReturnTo();
  try {
    const result = await api.completeGoogle(code, state);
    if (result.requires_existing_account_proof && result.link_proof_token) {
      return { kind: "link-required", linkProofToken: result.link_proof_token, returnTo };
    }
    return { kind: "signed-in", destination: destinationAfterProof(result as AuthSessionResponseData, returnTo) };
  } catch (error: unknown) {
    throw normalizeUnknownError(error, [code, state]);
  }
}

export async function handleGoogleLinkSubmit(
  linkProofToken: string,
  password: string,
  returnTo: string | null,
  api: AuthApiContract = authApi,
): Promise<string> {
  try {
    const session = await api.linkGoogleWithPassword(linkProofToken, password);
    return destinationAfterProof(session, returnTo);
  } catch (error: unknown) {
    throw normalizeUnknownError(error, [linkProofToken, password]);
  }
}

export async function handleCreateFirstPasswordSubmit(
  preAuthToken: string | null | undefined,
  values: CreatePasswordFormValues,
  options?: {
    api?: AuthApiContract;
    returnTo?: string | null;
  },
): Promise<AuthenticatedRouteOutcome> {
  const trimmedToken = (preAuthToken ?? "").trim();
  if (!trimmedToken) {
    throw new ApiClientError({
      code: "INVALID_PROOF",
      message:
        "Your verification session is no longer active. Please restart verification to set your password.",
      status: 401,
    });
  }

  const api = options?.api ?? authApi;
  try {
    const session = await api.createFirstPassword(trimmedToken, {
      password: values.password,
    });
    useAuthStore.getState().clearPreAuthToken();
    const returnTo = options?.returnTo ?? useAuthStore.getState().returnTo;
    const destination = resolvePostAuthDestination(session.onboarding_status, returnTo);
    return {
      session,
      destination,
    };
  } catch (error: unknown) {
    throw normalizeUnknownError(error, [trimmedToken, values.password]);
  }
}
