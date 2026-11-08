export type ApiErrorCode =
  | "INVALID_CREDENTIALS"
  | "INVALID_PROOF"
  | "RATE_LIMITED"
  | "PASSWORD_ALREADY_SET"
  | "VALIDATION_ERROR"
  | "INVALID_REQUEST"
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

export type OtpPurpose = "registration" | "sign_in";

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

export interface OtpRequestPayload {
  email: string;
  purpose: OtpPurpose;
}

export interface OtpRequestResponseData {
  message: string;
}

export interface OtpVerifyRequestPayload {
  email: string;
  purpose: OtpPurpose;
  code: string;
}

export interface MagicLinkRequestPayload {
  email: string;
  return_to?: string;
}

export interface MagicLinkRequestResponseData {
  message: string;
}

export interface MagicLinkInspectResponseData {
  valid: boolean;
  confirmation_required: boolean;
}

export interface MagicLinkConfirmRequestPayload {
  token: string;
}

export interface AuthSessionResponseData {
  user_id: number;
  onboarding_status: OnboardingStatus;
  expires_at: string;
  requires_password?: boolean;
  pre_auth_token?: string;
}
