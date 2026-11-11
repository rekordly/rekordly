import { apiClient, getCsrfToken, setCsrfToken, type RekordlyApiClient } from "./api.ts";
import { ApiClientError } from "./errors.ts";
import { currentUserSchema } from "./schemas/auth.schemas.ts";
import { createIdempotencyKey } from "./utils.ts";
import type {
  AuthSessionResponseData,
  EmailContinueRequest,
  EmailContinueResponseData,
  OnboardingStatus,
  PasswordCreateRequest,
  PasswordResetCompleteRequest,
  PasswordResetRequestPayload,
  PasswordResetRequestResponseData,
  PasswordSignInRequest,
} from "../types/api.ts";
import type { CurrentUser } from "../types/auth.ts";

// ─── Routes ───────────────────────────────────────────────────────────

export const AUTH_ROUTES = {
  LOGIN: "/login",
  LOGIN_PASSWORD: "/login/password",
  FORGOT_PASSWORD: "/forgot-password",
  RESET_PASSWORD: "/reset-password",
  CREATE_PASSWORD: "/create-password",
  // The path the worker puts in sign-in emails.
  MAGIC_LINK: "/auth/magic",
  GOOGLE_CALLBACK: "/auth/google/callback",
} as const;

export const ONBOARDING_ROUTES = {
  ROOT: "/onboarding",
  IDENTITY_VERIFIED: "/onboarding/use-case",
  PREFERENCES_SAVED: "/onboarding/spaces",
  CORE_CREATING: "/onboarding/setup",
} as const;

export const PROTECTED_APP_ENTRY_ROUTE = "/dashboard" as const;

const ALLOWLISTED_RETURN_PREFIXES: readonly string[] = [
  "/dashboard",
  "/onboarding",
  "/accounts",
  "/billing",
  "/budgets",
  "/capture",
  "/customers",
  "/inventory",
  "/invitations",
  "/invoices",
  "/loans",
  "/notifications",
  "/payments",
  "/purchases",
  "/reports",
  "/review",
  "/sales",
  "/settings",
  "/split-payments",
  "/store",
  "/sync",
  "/transactions",
  "/wallets",
];

/**
 * Non-secret "this browser believes it is signed in" flag for the route proxy.
 * The real session cookie belongs to the API host, so the web host cannot see
 * it. This only decides whether to show the login redirect early; every
 * protected request is still authorised by the API.
 */
export const SESSION_MARKER_COOKIE = "rekordly_signed_in";

export function setSessionMarker(expiresAt: string): void {
  if (typeof document === "undefined") return;
  const maxAge = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
  if (!Number.isFinite(maxAge) || maxAge <= 0) {
    clearSessionMarker();
    return;
  }
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SESSION_MARKER_COOKIE}=1; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

export function clearSessionMarker(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_MARKER_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function sanitizeReturnToPath(candidate: string | null | undefined): string | null {
  if (!candidate) {
    return null;
  }
  const trimmed = candidate.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return null;
  }
  if (trimmed.includes("://") || trimmed.includes("\\") || /[\r\n\t]/.test(trimmed)) {
    return null;
  }

  const pathOnly = trimmed.split("?")[0]?.split("#")[0] ?? "";
  const isAllowlisted = ALLOWLISTED_RETURN_PREFIXES.some(
    (prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`),
  );

  return isAllowlisted ? trimmed : null;
}

export function resolveOnboardingRoute(status: OnboardingStatus): string {
  switch (status) {
    case "identity_verified":
      return ONBOARDING_ROUTES.IDENTITY_VERIFIED;
    case "preferences_saved":
      return ONBOARDING_ROUTES.PREFERENCES_SAVED;
    case "core_creating":
      return ONBOARDING_ROUTES.CORE_CREATING;
    case "core_complete":
    case "activated":
      return PROTECTED_APP_ENTRY_ROUTE;
  }
}

export function isOnboardingComplete(status: OnboardingStatus): boolean {
  return status === "core_complete" || status === "activated";
}

export function resolvePostAuthDestination(
  status: OnboardingStatus,
  returnTo?: string | null,
  currentStep?: string,
): string {
  if (!isOnboardingComplete(status)) {
    if (currentStep === "space_choice_saved") {
      return ONBOARDING_ROUTES.PREFERENCES_SAVED;
    }
    return resolveOnboardingRoute(status);
  }
  const safeReturnTo = sanitizeReturnToPath(returnTo);
  return safeReturnTo ?? PROTECTED_APP_ENTRY_ROUTE;
}

// ─── Sign-in and session API ─────────────────────────────────────────

export const AUTH_ENDPOINTS = {
  EMAIL_CONTINUE: "/api/v1/auth/email/continue",
  PASSWORD_SIGN_IN: "/api/v1/auth/password/sign-in",
  PASSWORD_RESET_REQUEST: "/api/v1/auth/password/reset/request",
  PASSWORD_RESET_COMPLETE: "/api/v1/auth/password/reset/complete",
  PASSWORD_CREATE: "/api/v1/auth/password/create",
  OTP_REQUEST: "/api/v1/auth/otp/request",
  OTP_VERIFY: "/api/v1/auth/otp/verify",
  MAGIC_REQUEST: "/api/v1/auth/magic/request",
  MAGIC_INSPECT: "/api/v1/auth/magic/inspect",
  MAGIC_CONFIRM: "/api/v1/auth/magic/confirm",
  GOOGLE_START: "/api/v1/auth/google/start",
  GOOGLE_CALLBACK: "/api/v1/auth/google/callback",
  GOOGLE_LINK: "/api/v1/auth/google/link/password",
  REFRESH: "/api/v1/auth/refresh",
  LOGOUT: "/api/v1/auth/logout",
  CURRENT_USER: "/api/v1/me",
} as const;

export const NEUTRAL_PASSWORD_RESET_MESSAGE =
  "If the account is eligible, password reset instructions will be sent.";

export const NEUTRAL_MAGIC_LINK_MESSAGE = "If the account is eligible, a sign-in link will be sent.";

export type OtpPurpose = "registration" | "sign_in";

export interface GoogleCallbackResult extends Partial<AuthSessionResponseData> {
  requires_existing_account_proof?: boolean;
  link_proof_token?: string;
  return_to?: string;
}

/** Lets the route proxy see that a session exists; a pre-auth response issues no cookie. */
function markSessionStarted(session: AuthSessionResponseData): AuthSessionResponseData {
  if (!session.requires_password) {
    setSessionMarker(session.expires_at);
  }
  if (session.csrf_token) {
    setCsrfToken(session.csrf_token);
  }
  return session;
}

export function createAuthApi(client: RekordlyApiClient = apiClient) {
  return {
    async continueWithEmail(
      payload: EmailContinueRequest,
    ): Promise<EmailContinueResponseData> {
      const normalizedEmail = payload.email.trim().toLowerCase();
      return client.post<EmailContinueRequest, EmailContinueResponseData>(
        AUTH_ENDPOINTS.EMAIL_CONTINUE,
        { email: normalizedEmail },
      );
    },

    async signInWithPassword(
      payload: PasswordSignInRequest,
    ): Promise<AuthSessionResponseData> {
      const normalizedEmail = payload.email.trim().toLowerCase();
      return markSessionStarted(
        await client.post<PasswordSignInRequest, AuthSessionResponseData>(
          AUTH_ENDPOINTS.PASSWORD_SIGN_IN,
          { email: normalizedEmail, password: payload.password },
          { sensitiveValues: [payload.password] },
        ),
      );
    },

    async requestPasswordReset(
      payload: PasswordResetRequestPayload,
    ): Promise<PasswordResetRequestResponseData> {
      const normalizedEmail = payload.email.trim().toLowerCase();
      await client.post<PasswordResetRequestPayload, PasswordResetRequestResponseData>(
        AUTH_ENDPOINTS.PASSWORD_RESET_REQUEST,
        { email: normalizedEmail },
      );
      return { message: NEUTRAL_PASSWORD_RESET_MESSAGE };
    },

    async completePasswordReset(
      payload: PasswordResetCompleteRequest,
    ): Promise<AuthSessionResponseData> {
      const trimmedToken = payload.token.trim();
      return markSessionStarted(
        await client.post<PasswordResetCompleteRequest, AuthSessionResponseData>(
          AUTH_ENDPOINTS.PASSWORD_RESET_COMPLETE,
          { token: trimmedToken, password: payload.password },
          { sensitiveValues: [trimmedToken, payload.password] },
        ),
      );
    },

    async createFirstPassword(
      preAuthToken: string,
      payload: PasswordCreateRequest,
    ): Promise<AuthSessionResponseData> {
      const trimmedToken = preAuthToken.trim();
      return markSessionStarted(
        await client.post<PasswordCreateRequest, AuthSessionResponseData>(
          AUTH_ENDPOINTS.PASSWORD_CREATE,
          { password: payload.password },
          {
            headers: { "X-Preauth-Token": trimmedToken },
            sensitiveValues: [trimmedToken, payload.password],
          },
        ),
      );
    },

    async requestOtp(email: string, purpose: OtpPurpose): Promise<void> {
      await client.post(AUTH_ENDPOINTS.OTP_REQUEST, {
        email: email.trim().toLowerCase(),
        purpose,
      });
    },

    async verifyOtp(
      email: string,
      purpose: OtpPurpose,
      code: string,
    ): Promise<AuthSessionResponseData> {
      return markSessionStarted(
        await client.post<unknown, AuthSessionResponseData>(
          AUTH_ENDPOINTS.OTP_VERIFY,
          { email: email.trim().toLowerCase(), purpose, code },
          { sensitiveValues: [code] },
        ),
      );
    },

    async requestMagicLink(email: string, returnTo?: string | null): Promise<void> {
      await client.post(AUTH_ENDPOINTS.MAGIC_REQUEST, {
        email: email.trim().toLowerCase(),
        return_to: returnTo ?? undefined,
      });
    },

    async startGoogle(returnTo: string): Promise<string> {
      const result = await client.get<{ authorization_url: string }>(
        `${AUTH_ENDPOINTS.GOOGLE_START}?return_to=${encodeURIComponent(returnTo)}`,
      );
      return result.authorization_url;
    },

    async completeGoogle(code: string, state: string): Promise<GoogleCallbackResult> {
      const result = await client.get<GoogleCallbackResult>(
        `${AUTH_ENDPOINTS.GOOGLE_CALLBACK}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
        { sensitiveValues: [code, state] },
      );
      if (!result.requires_existing_account_proof && result.expires_at) {
        markSessionStarted(result as AuthSessionResponseData);
      }
      return result;
    },

    async linkGoogleWithPassword(linkProofToken: string, password: string): Promise<AuthSessionResponseData> {
      return markSessionStarted(
        await client.post<unknown, AuthSessionResponseData>(
          AUTH_ENDPOINTS.GOOGLE_LINK,
          { link_proof_token: linkProofToken, password },
          { sensitiveValues: [linkProofToken, password] },
        ),
      );
    },

    /** Checks the link without using it, so email scanners cannot burn it. */
    async inspectMagicLink(token: string): Promise<void> {
      await client.get(`${AUTH_ENDPOINTS.MAGIC_INSPECT}?token=${encodeURIComponent(token)}`, {
        sensitiveValues: [token],
      });
    },

    async confirmMagicLink(token: string): Promise<AuthSessionResponseData> {
      return markSessionStarted(
        await client.post<unknown, AuthSessionResponseData>(
          AUTH_ENDPOINTS.MAGIC_CONFIRM,
          { token },
          { sensitiveValues: [token] },
        ),
      );
    },
  };
}

export const authApi = createAuthApi();

export type SessionRefreshResult = "refreshed" | "rotated-elsewhere";

const SESSION_REFRESH_LOCK = "rekordly-session-refresh";

export function createSessionApi(client: RekordlyApiClient = apiClient) {
  let refreshInFlight: Promise<SessionRefreshResult> | null = null;

  async function rotate(csrfBeforeLock: string | null): Promise<SessionRefreshResult> {
    try {
      // Another tab may have finished rotating while this one waited for the lock.
      const currentCsrf = await client.syncCsrfToken();
      if (csrfBeforeLock && currentCsrf !== csrfBeforeLock) {
        return "rotated-elsewhere";
      }
      const session = await client.post<Record<string, never>, AuthSessionResponseData>(
        AUTH_ENDPOINTS.REFRESH,
        {},
      );
      markSessionStarted(session);
      return "refreshed";
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.code === "SESSION_ALREADY_ROTATED") {
        return "rotated-elsewhere";
      }
      throw error;
    }
  }

  return {
    async getCurrentUser(): Promise<CurrentUser> {
      const payload = await client.get<unknown>(AUTH_ENDPOINTS.CURRENT_USER);
      const result = currentUserSchema.safeParse(payload);
      if (!result.success) {
        throw new ApiClientError({
          code: "INTERNAL_ERROR",
          message: "Rekordly returned an invalid session response.",
          status: 502,
        });
      }
      const { csrf_token: csrfToken, ...user } = result.data;
      if (csrfToken) {
        setCsrfToken(csrfToken);
      }
      return user;
    },

    /**
     * Rotate the session cookie. The API treats a second use of an already
     * rotated session as token theft and revokes every device, so concurrent
     * refreshes are collapsed here and serialised across tabs with a Web Lock.
     */
    refresh(): Promise<SessionRefreshResult> {
      if (refreshInFlight) {
        return refreshInFlight;
      }
      const csrfBeforeLock = getCsrfToken();
      const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
      const pending: Promise<SessionRefreshResult> = locks
        ? locks.request(SESSION_REFRESH_LOCK, () => rotate(csrfBeforeLock)).then((result) => result)
        : rotate(csrfBeforeLock);
      refreshInFlight = pending.finally(() => {
        refreshInFlight = null;
      });
      return refreshInFlight;
    },

    async logout(): Promise<void> {
      // A stale token would make the API refuse and leave the session alive.
      await client.syncCsrfToken();
      await client.post<Record<string, never>, { logged_out: boolean }>(
        AUTH_ENDPOINTS.LOGOUT,
        {},
      );
      setCsrfToken(null);
      clearSessionMarker();
    },
  };
}

export const sessionApi = createSessionApi();

// ─── Onboarding API ───────────────────────────────────────────────────

export type OnboardingRole = "personal" | "freelancer" | "small_business" | "general_business";
export type SpaceChoice = "personal" | "business" | "all";

export interface SaveOnboardingPreferencesInput {
  flow_version: number;
  selected_roles: OnboardingRole[];
  space_choice: SpaceChoice;
  preferences: Record<string, unknown>;
}

export interface WorkspaceSetupInput {
  name: string;
  base_currency: string;
  timezone: string;
  business_type?: string;
  country?: string;
}

export interface CreateInitialWorkspacesInput {
  space_choice: SpaceChoice;
  personal?: WorkspaceSetupInput;
  business?: WorkspaceSetupInput;
}

export const onboardingApi = {
  savePreferences(input: SaveOnboardingPreferencesInput) {
    return apiClient.put<SaveOnboardingPreferencesInput, unknown>(
      "/api/v1/me/onboarding/preferences",
      input,
    );
  },
  createInitialWorkspaces(input: CreateInitialWorkspacesInput) {
    return apiClient.post<CreateInitialWorkspacesInput, unknown>(
      "/api/v1/me/onboarding/workspaces",
      input,
      { headers: { "Idempotency-Key": createIdempotencyKey("onboarding") } },
    );
  },
};

// ─── Invitations API ──────────────────────────────────────────────────

export interface InvitationSummary {
  workspace_name: string;
  role_name: string;
  destination: string;
  expires_at: string;
}

export const invitationApi = {
  inspect(token: string) {
    return apiClient.get<{ workspace_name: string; role_name: string; destination: string; expires_at: string }>(
      `/api/v1/invitations/${token}`,
    );
  },
  requestOTP(token: string) {
    return apiClient.post<Record<string, never>, { message: string }>(`/api/v1/invitations/${token}/otp/request`, {});
  },
  verifyOTP(token: string, code: string) {
    return apiClient.post<{ code: string }, { user_id: number; onboarding_status: string; csrf_token?: string }>(
      `/api/v1/invitations/${token}/otp/verify`,
      { code },
    );
  },
  accept(token: string) {
    return apiClient.post<Record<string, never>, { accepted: boolean }>(`/api/v1/invitations/${token}/accept`, {});
  },
};
