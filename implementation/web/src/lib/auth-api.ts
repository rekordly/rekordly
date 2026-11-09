import { apiClient, type RekordlyApiClient } from "./api.ts";
import type {
  AuthSessionResponseData,
  EmailContinueRequest,
  EmailContinueResponseData,
  PasswordCreateRequest,
  PasswordResetCompleteRequest,
  PasswordResetRequestPayload,
  PasswordResetRequestResponseData,
  PasswordSignInRequest,
} from "../types/api.ts";

export const AUTH_ENDPOINTS = {
  EMAIL_CONTINUE: "/api/v1/auth/email/continue",
  PASSWORD_SIGN_IN: "/api/v1/auth/password/sign-in",
  PASSWORD_RESET_REQUEST: "/api/v1/auth/password/reset/request",
  PASSWORD_RESET_COMPLETE: "/api/v1/auth/password/reset/complete",
  PASSWORD_CREATE: "/api/v1/auth/password/create",
} as const;

export const NEUTRAL_PASSWORD_RESET_MESSAGE =
  "If the account is eligible, password reset instructions will be sent.";

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
  };
}

export const authApi = createAuthApi();
