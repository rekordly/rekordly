export type ApiErrorCode =
  | "INVALID_CREDENTIALS"
  | "INVALID_PROOF"
  | "RATE_LIMITED"
  | "PASSWORD_ALREADY_SET"
  | "VALIDATION_ERROR"
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "WORKSPACE_REQUIRED"
  | "INVALID_WORKSPACE_ID"
  | "IDEMPOTENCY_CONFLICT"
  | "PLAN_LIMIT_EXCEEDED"
  | "SESSION_ALREADY_ROTATED"
  | "SESSION_REPLAYED"
  | "CSRF_INVALID"
  | "GOOGLE_UNAVAILABLE"
  | "INTERNAL_ERROR"
  | "NETWORK_ERROR"
  | "TIMEOUT_ERROR";

export interface ApiErrorDetail {
  code: ApiErrorCode;
  message: string;
}

export interface ApiErrorEnvelope {
  error: {
    code?: string;
    message?: string;
  };
}

export interface ApiSuccessEnvelope<TData> {
  data: TData;
}

export type OnboardingStatus =
  | "identity_verified"
  | "preferences_saved"
  | "core_creating"
  | "core_complete"
  | "activated";

export type EmailContinuationKind = "password" | "registration";

export interface EmailContinueRequest {
  email: string;
}

export interface EmailContinueResponseData {
  continuation: EmailContinuationKind;
}

export interface PasswordSignInRequest {
  email: string;
  password: string;
}

export interface PasswordResetRequestPayload {
  email: string;
}

export interface PasswordResetRequestResponseData {
  message: string;
}

export interface PasswordResetCompleteRequest {
  token: string;
  password: string;
}

export interface PasswordCreateRequest {
  password: string;
}

export interface AuthSessionResponseData {
  user_id: number;
  onboarding_status: OnboardingStatus;
  expires_at: string;
  csrf_token?: string;
  /** Present on pre-auth responses, where no session cookie was issued. */
  requires_password?: boolean;
  pre_auth_token?: string;
}
