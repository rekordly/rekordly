import {
  authApi,
  NEUTRAL_PASSWORD_RESET_MESSAGE,
  type createAuthApi,
} from "../api/auth.ts";
import { ApiClientError, normalizeUnknownError } from "../api/client.ts";
import type {
  AuthSessionResponseData,
  EmailContinuationKind,
} from "../api/types.ts";
import {
  AUTH_ROUTES,
  resolvePostAuthDestination,
} from "./onboarding-routes.ts";
import { useAuthFlowStore } from "./state.ts";
import type {
  CreatePasswordFormValues,
  EmailContinueFormValues,
  ForgotPasswordFormValues,
  PasswordSignInFormValues,
  ResetPasswordFormValues,
} from "./validation.ts";

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
    useAuthFlowStore.getState().setEmailContinuation(normalizedEmail, response.continuation);
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
    useAuthFlowStore.getState().setEmail(normalizedEmail);
    const returnTo = options?.returnTo ?? useAuthFlowStore.getState().returnTo;
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
    useAuthFlowStore.getState().setEmail(normalizedEmail);
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

    const returnTo = options?.returnTo ?? useAuthFlowStore.getState().returnTo;
    const destination = resolvePostAuthDestination(session.onboarding_status, returnTo);
    return {
      session,
      destination,
    };
  } catch (error: unknown) {
    throw normalizeUnknownError(error, [trimmedToken, values.password]);
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
    useAuthFlowStore.getState().clearPreAuthToken();
    const returnTo = options?.returnTo ?? useAuthFlowStore.getState().returnTo;
    const destination = resolvePostAuthDestination(session.onboarding_status, returnTo);
    return {
      session,
      destination,
    };
  } catch (error: unknown) {
    throw normalizeUnknownError(error, [trimmedToken, values.password]);
  }
}
