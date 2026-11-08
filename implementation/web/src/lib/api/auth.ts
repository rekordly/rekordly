import { sanitizeReturnToPath } from "../auth/onboarding-routes.ts";
import { apiClient, type RekordlyApiClient } from "./client.ts";
import type {
  AuthSessionResponseData,
  EmailContinueRequest,
  EmailContinueResponseData,
  GoogleCallbackParams,
  GoogleCallbackResponseData,
  GoogleLinkPasswordRequest,
  GoogleStartResponseData,
  MagicLinkConfirmRequestPayload,
  MagicLinkInspectResponseData,
  MagicLinkRequestPayload,
  MagicLinkRequestResponseData,
  OtpRequestPayload,
  OtpRequestResponseData,
  OtpVerifyRequestPayload,
  PasswordCreateRequest,
  PasswordResetCompleteRequest,
  PasswordResetRequestPayload,
  PasswordResetRequestResponseData,
  PasswordSignInRequest,
} from "./types.ts";

export const AUTH_ENDPOINTS = {
  EMAIL_CONTINUE: "/api/v1/auth/email/continue",
  PASSWORD_SIGN_IN: "/api/v1/auth/password/sign-in",
  PASSWORD_RESET_REQUEST: "/api/v1/auth/password/reset/request",
  PASSWORD_RESET_COMPLETE: "/api/v1/auth/password/reset/complete",
  PASSWORD_CREATE: "/api/v1/auth/password/create",
  OTP_REQUEST: "/api/v1/auth/otp/request",
  OTP_VERIFY: "/api/v1/auth/otp/verify",
  MAGIC_LINK_REQUEST: "/api/v1/auth/magic/request",
  MAGIC_LINK_INSPECT: "/api/v1/auth/magic/inspect",
  MAGIC_LINK_CONFIRM: "/api/v1/auth/magic/confirm",
  GOOGLE_START: "/api/v1/auth/google/start",
  GOOGLE_CALLBACK: "/api/v1/auth/google/callback",
  GOOGLE_LINK_PASSWORD: "/api/v1/auth/google/link/password",
} as const;

export const NEUTRAL_PASSWORD_RESET_MESSAGE =
  "If the account is eligible, password reset instructions will be sent.";

export const NEUTRAL_OTP_REQUEST_MESSAGE =
  "If the request is eligible, a verification code will be sent.";

export const NEUTRAL_MAGIC_LINK_REQUEST_MESSAGE =
  "If the account is eligible, a sign-in link will be sent.";

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
      return client.post<PasswordSignInRequest, AuthSessionResponseData>(
        AUTH_ENDPOINTS.PASSWORD_SIGN_IN,
        {
          email: normalizedEmail,
          password: payload.password,
        },
        {
          sensitiveValues: [payload.password],
        },
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
      return {
        message: NEUTRAL_PASSWORD_RESET_MESSAGE,
      };
    },

    async completePasswordReset(
      payload: PasswordResetCompleteRequest,
    ): Promise<AuthSessionResponseData> {
      const trimmedToken = payload.token.trim();
      return client.post<PasswordResetCompleteRequest, AuthSessionResponseData>(
        AUTH_ENDPOINTS.PASSWORD_RESET_COMPLETE,
        {
          token: trimmedToken,
          password: payload.password,
        },
        {
          sensitiveValues: [trimmedToken, payload.password],
        },
      );
    },

    async createFirstPassword(
      preAuthToken: string,
      payload: PasswordCreateRequest,
    ): Promise<AuthSessionResponseData> {
      const trimmedToken = preAuthToken.trim();
      return client.post<PasswordCreateRequest, AuthSessionResponseData>(
        AUTH_ENDPOINTS.PASSWORD_CREATE,
        {
          password: payload.password,
        },
        {
          headers: {
            "X-Preauth-Token": trimmedToken,
          },
          sensitiveValues: [trimmedToken, payload.password],
        },
      );
    },

    async requestOtp(payload: OtpRequestPayload): Promise<OtpRequestResponseData> {
      const normalizedEmail = payload.email.trim().toLowerCase();
      await client.post<OtpRequestPayload, OtpRequestResponseData>(
        AUTH_ENDPOINTS.OTP_REQUEST,
        {
          email: normalizedEmail,
          purpose: payload.purpose,
        },
        {
          sensitiveValues: [normalizedEmail],
        },
      );
      return {
        message: NEUTRAL_OTP_REQUEST_MESSAGE,
      };
    },

    async verifyOtp(payload: OtpVerifyRequestPayload): Promise<AuthSessionResponseData> {
      const normalizedEmail = payload.email.trim().toLowerCase();
      const trimmedCode = payload.code.trim();
      return client.post<OtpVerifyRequestPayload, AuthSessionResponseData>(
        AUTH_ENDPOINTS.OTP_VERIFY,
        {
          email: normalizedEmail,
          purpose: payload.purpose,
          code: trimmedCode,
        },
        {
          sensitiveValues: [normalizedEmail, trimmedCode],
        },
      );
    },

    async requestMagicLink(
      payload: MagicLinkRequestPayload,
    ): Promise<MagicLinkRequestResponseData> {
      const normalizedEmail = payload.email.trim().toLowerCase();
      const safeReturnTo = sanitizeReturnToPath(payload.return_to) ?? undefined;
      await client.post<MagicLinkRequestPayload, MagicLinkRequestResponseData>(
        AUTH_ENDPOINTS.MAGIC_LINK_REQUEST,
        {
          email: normalizedEmail,
          ...(safeReturnTo ? { return_to: safeReturnTo } : {}),
        },
        {
          sensitiveValues: [normalizedEmail],
        },
      );
      return {
        message: NEUTRAL_MAGIC_LINK_REQUEST_MESSAGE,
      };
    },

    async inspectMagicLink(token: string): Promise<MagicLinkInspectResponseData> {
      const trimmedToken = token.trim();
      return client.get<MagicLinkInspectResponseData>(AUTH_ENDPOINTS.MAGIC_LINK_INSPECT, {
        params: {
          token: trimmedToken,
        },
        sensitiveValues: [trimmedToken],
      });
    },

    async confirmMagicLink(
      payload: MagicLinkConfirmRequestPayload,
    ): Promise<AuthSessionResponseData> {
      const trimmedToken = payload.token.trim();
      return client.post<MagicLinkConfirmRequestPayload, AuthSessionResponseData>(
        AUTH_ENDPOINTS.MAGIC_LINK_CONFIRM,
        {
          token: trimmedToken,
        },
        {
          sensitiveValues: [trimmedToken],
        },
      );
    },

    async startGoogleAuth(returnTo?: string | null): Promise<GoogleStartResponseData> {
      const safeReturnTo = sanitizeReturnToPath(returnTo) ?? undefined;
      return client.get<GoogleStartResponseData>(AUTH_ENDPOINTS.GOOGLE_START, {
        params: safeReturnTo ? { return_to: safeReturnTo } : undefined,
      });
    },

    async completeGoogleCallback(
      params: GoogleCallbackParams,
    ): Promise<GoogleCallbackResponseData> {
      const trimmedCode = (params.code ?? "").trim();
      const trimmedState = (params.state ?? "").trim();
      const trimmedError = (params.error ?? "").trim();
      const sensitiveValues = [trimmedCode, trimmedState].filter(
        (val) => val.length > 0,
      );
      return client.get<GoogleCallbackResponseData>(AUTH_ENDPOINTS.GOOGLE_CALLBACK, {
        params: {
          ...(trimmedCode ? { code: trimmedCode } : {}),
          ...(trimmedState ? { state: trimmedState } : {}),
          ...(trimmedError ? { error: trimmedError } : {}),
        },
        sensitiveValues,
      });
    },

    async linkGoogleWithPassword(
      payload: GoogleLinkPasswordRequest,
    ): Promise<AuthSessionResponseData> {
      const trimmedProofToken = payload.link_proof_token.trim();
      return client.post<GoogleLinkPasswordRequest, AuthSessionResponseData>(
        AUTH_ENDPOINTS.GOOGLE_LINK_PASSWORD,
        {
          link_proof_token: trimmedProofToken,
          password: payload.password,
        },
        {
          sensitiveValues: [trimmedProofToken, payload.password],
        },
      );
    },
  };
}

export const authApi = createAuthApi();
