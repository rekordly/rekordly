import {
  authApi,
  NEUTRAL_MAGIC_LINK_REQUEST_MESSAGE,
  NEUTRAL_OTP_REQUEST_MESSAGE,
  NEUTRAL_PASSWORD_RESET_MESSAGE,
  type createAuthApi,
} from "../api/auth.ts";
import { ApiClientError, normalizeUnknownError } from "../api/client.ts";
import type {
  AuthSessionResponseData,
  EmailContinuationKind,
  MagicLinkInspectResponseData,
  OtpPurpose,
} from "../api/types.ts";
import {
  AUTH_ROUTES,
  resolvePostAuthDestination,
  sanitizeReturnToPath,
} from "./onboarding-routes.ts";
import { useAuthFlowStore } from "./state.ts";
import type {
  CreatePasswordFormValues,
  EmailContinueFormValues,
  ForgotPasswordFormValues,
  MagicLinkRequestFormValues,
  OtpVerifyFormValues,
  PasswordSignInFormValues,
  ResetPasswordFormValues,
} from "./validation.ts";

export type AuthApiContract = ReturnType<typeof createAuthApi>;

export const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;

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
    if (response.continuation === "registration") {
      useAuthFlowStore.getState().setOtpContext(normalizedEmail, "registration");
    }
    return {
      continuation: response.continuation,
      email: normalizedEmail,
      nextRoute:
        response.continuation === "password" ? AUTH_ROUTES.LOGIN_PASSWORD : null,
    };
  } catch (error: unknown) {
    throw normalizeUnknownError(error, [normalizedEmail]);
  }
}

export interface AuthenticatedRouteOutcome {
  session: AuthSessionResponseData;
  destination: string;
  requiresPassword: boolean;
}

export function resolveSessionOutcome(
  session: AuthSessionResponseData,
  returnTo?: string | null,
): AuthenticatedRouteOutcome {
  const preAuthToken = (session.pre_auth_token ?? "").trim();
  if (session.requires_password && preAuthToken.length > 0) {
    useAuthFlowStore.getState().setPreAuthToken(preAuthToken);
    return {
      session,
      destination: AUTH_ROUTES.CREATE_PASSWORD,
      requiresPassword: true,
    };
  }

  useAuthFlowStore.getState().clearPreAuthToken();
  const effectiveReturnTo = returnTo ?? useAuthFlowStore.getState().returnTo;
  const destination = resolvePostAuthDestination(session.onboarding_status, effectiveReturnTo);
  return {
    session,
    destination,
    requiresPassword: false,
  };
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
    return resolveSessionOutcome(session, options?.returnTo);
  } catch (error: unknown) {
    throw normalizeUnknownError(error, [normalizedEmail, values.password]);
  }
}

export interface OtpRequestOutcome {
  email: string;
  purpose: OtpPurpose;
  generation: number;
  cooldownSeconds: number;
  message: string;
}

export async function handleOtpRequestSubmit(
  values: {
    email: string;
    purpose: OtpPurpose;
  },
  api: AuthApiContract = authApi,
): Promise<OtpRequestOutcome> {
  const normalizedEmail = values.email.trim().toLowerCase();
  try {
    await api.requestOtp({
      email: normalizedEmail,
      purpose: values.purpose,
    });
    const store = useAuthFlowStore.getState();
    store.setOtpContext(normalizedEmail, values.purpose);
    const generation = store.advanceOtpGeneration();
    return {
      email: normalizedEmail,
      purpose: values.purpose,
      generation,
      cooldownSeconds: DEFAULT_RESEND_COOLDOWN_SECONDS,
      message: NEUTRAL_OTP_REQUEST_MESSAGE,
    };
  } catch (error: unknown) {
    throw normalizeUnknownError(error, [normalizedEmail]);
  }
}

export async function handleOtpVerifySubmit(
  values: OtpVerifyFormValues,
  options?: {
    api?: AuthApiContract;
    returnTo?: string | null;
  },
): Promise<AuthenticatedRouteOutcome> {
  const api = options?.api ?? authApi;
  const normalizedEmail = values.email.trim().toLowerCase();
  const trimmedCode = values.code.trim();
  try {
    const session = await api.verifyOtp({
      email: normalizedEmail,
      purpose: values.purpose,
      code: trimmedCode,
    });
    useAuthFlowStore.getState().setEmail(normalizedEmail);
    return resolveSessionOutcome(session, options?.returnTo);
  } catch (error: unknown) {
    throw normalizeUnknownError(error, [normalizedEmail, trimmedCode]);
  }
}

export interface MagicLinkRequestOutcome {
  email: string;
  generation: number;
  cooldownSeconds: number;
  message: string;
}

export async function handleMagicLinkRequestSubmit(
  values: MagicLinkRequestFormValues,
  options?: {
    api?: AuthApiContract;
    returnTo?: string | null;
  },
): Promise<MagicLinkRequestOutcome> {
  const api = options?.api ?? authApi;
  const normalizedEmail = values.email.trim().toLowerCase();
  const safeReturnTo = sanitizeReturnToPath(
    options?.returnTo ?? useAuthFlowStore.getState().returnTo,
  );
  try {
    await api.requestMagicLink({
      email: normalizedEmail,
      return_to: safeReturnTo ?? undefined,
    });
    const store = useAuthFlowStore.getState();
    store.setEmail(normalizedEmail);
    const generation = store.advanceMagicLinkGeneration();
    return {
      email: normalizedEmail,
      generation,
      cooldownSeconds: DEFAULT_RESEND_COOLDOWN_SECONDS,
      message: NEUTRAL_MAGIC_LINK_REQUEST_MESSAGE,
    };
  } catch (error: unknown) {
    throw normalizeUnknownError(error, [normalizedEmail]);
  }
}

export async function handleMagicLinkInspect(
  token: string | null | undefined,
  options?: {
    api?: AuthApiContract;
    cleanPathname?: string;
    onTokenScrubbed?: () => void;
  },
): Promise<MagicLinkInspectResponseData> {
  const trimmedToken = (token ?? "").trim();
  if (options?.onTokenScrubbed) {
    options.onTokenScrubbed();
  } else {
    scrubTokenFromBrowserUrl(options?.cleanPathname ?? AUTH_ROUTES.AUTH_MAGIC);
  }

  if (!trimmedToken) {
    throw new ApiClientError({
      code: "INVALID_PROOF",
      message:
        "This sign-in link is invalid, expired, or has already been used. Please request a new sign-in link.",
      status: 401,
    });
  }

  const api = options?.api ?? authApi;
  try {
    const result = await api.inspectMagicLink(trimmedToken);
    if (!result.valid) {
      throw new ApiClientError({
        code: "INVALID_PROOF",
        message:
          "This sign-in link is invalid, expired, or has already been used. Please request a new sign-in link.",
        status: 401,
      });
    }
    return result;
  } catch (error: unknown) {
    throw normalizeUnknownError(error, [trimmedToken]);
  }
}

export async function handleMagicLinkConfirmSubmit(
  token: string | null | undefined,
  options?: {
    api?: AuthApiContract;
    returnTo?: string | null;
    cleanPathname?: string;
    onTokenConsumed?: () => void;
  },
): Promise<AuthenticatedRouteOutcome> {
  const trimmedToken = (token ?? "").trim();
  if (!trimmedToken) {
    throw new ApiClientError({
      code: "INVALID_PROOF",
      message:
        "This sign-in link is invalid, expired, or has already been used. Please request a new sign-in link.",
      status: 401,
    });
  }

  const api = options?.api ?? authApi;
  try {
    const session = await api.confirmMagicLink({
      token: trimmedToken,
    });
    if (options?.onTokenConsumed) {
      options.onTokenConsumed();
    } else {
      scrubTokenFromBrowserUrl(options?.cleanPathname ?? AUTH_ROUTES.AUTH_MAGIC);
    }
    return resolveSessionOutcome(session, options?.returnTo);
  } catch (error: unknown) {
    throw normalizeUnknownError(error, [trimmedToken]);
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
    throw normalizeUnknownError(error, [normalizedEmail]);
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

    return resolveSessionOutcome(session, options?.returnTo);
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
    return resolveSessionOutcome(session, options?.returnTo);
  } catch (error: unknown) {
    throw normalizeUnknownError(error, [trimmedToken, values.password]);
  }
}
