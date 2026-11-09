// Standardised API error type and neutral, user-safe messages.
// Every failure leaving the API layer is an ApiClientError with a message that
// is safe to show: no account-existence hints, no echoed secrets, no server internals.

import axios, { type AxiosError } from "axios";

import type { ApiErrorCode, ApiErrorDetail, ApiErrorEnvelope } from "../types/api.ts";

export const DEFAULT_SAFE_MESSAGES: Readonly<Record<ApiErrorCode, string>> = {
  INVALID_CREDENTIALS: "Email or password is incorrect.",
  INVALID_PROOF:
    "This verification link or session proof is invalid, expired, or has already been used.",
  RATE_LIMITED: "Too many attempts. Please wait a few minutes and try again.",
  PASSWORD_ALREADY_SET: "A password is already configured for this account.",
  VALIDATION_ERROR: "Please check your input and try again.",
  INVALID_REQUEST: "Unable to process the request. Please check your details and try again.",
  UNAUTHORIZED: "Your session has expired. Please sign in again.",
  FORBIDDEN: "You do not have permission to do that in this workspace.",
  NOT_FOUND: "We could not find that record in this workspace.",
  CONFLICT: "That change conflicts with a newer update. Refresh and try again.",
  WORKSPACE_REQUIRED: "Choose a workspace before continuing.",
  INVALID_WORKSPACE_ID: "That workspace is not available. Choose another one.",
  IDEMPOTENCY_CONFLICT: "This request was already submitted with different details.",
  PLAN_LIMIT_EXCEEDED: "Your plan limit has been reached for this action.",
  SESSION_ALREADY_ROTATED: "Your session was just refreshed. Please try again.",
  SESSION_REPLAYED: "Your session is no longer valid. Please sign in again.",
  GOOGLE_UNAVAILABLE: "Google sign-in is not available right now. Please use another way to sign in.",
  CSRF_INVALID: "This request could not be verified. Refresh the page and try again.",
  INTERNAL_ERROR: "Unable to complete the request right now. Please try again.",
  NETWORK_ERROR:
    "Unable to reach Rekordly servers. Check your internet connection and try again.",
  TIMEOUT_ERROR: "The request timed out. Please check your connection and try again.",
};

const KNOWN_ERROR_CODES = new Set(Object.keys(DEFAULT_SAFE_MESSAGES));

export class ApiClientError extends Error {
  public readonly code: ApiErrorCode;
  public readonly status: number | null;
  public readonly retryAfterSeconds: number | null;

  public constructor(options: {
    code: ApiErrorCode;
    message: string;
    status?: number | null;
    retryAfterSeconds?: number | null;
  }) {
    super(options.message);
    this.name = "ApiClientError";
    this.code = options.code;
    this.status = options.status ?? null;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isKnownErrorCode(code: string): code is ApiErrorCode {
  return KNOWN_ERROR_CODES.has(code);
}

export function sanitizeUserMessage(
  code: ApiErrorCode,
  rawMessage: string | undefined,
  sensitiveValues: readonly string[] = [],
): string {
  // Fixed wording for credential and proof failures, and never surface server internals.
  if (code === "INVALID_CREDENTIALS" || code === "INVALID_PROOF" || code === "INTERNAL_ERROR") {
    return DEFAULT_SAFE_MESSAGES[code];
  }

  const candidate = (rawMessage ?? "").trim();
  if (!candidate) {
    return DEFAULT_SAFE_MESSAGES[code];
  }

  // Never allow account-existence leakage phrases
  const lower = candidate.toLowerCase();
  if (
    lower.includes("no account") ||
    lower.includes("no user") ||
    lower.includes("user not found") ||
    lower.includes("account not found") ||
    lower.includes("does not exist")
  ) {
    return DEFAULT_SAFE_MESSAGES.INVALID_CREDENTIALS;
  }

  // Redact any sensitive values (passwords, pre-auth tokens, reset tokens) if ever echoed
  for (const secret of sensitiveValues) {
    const trimmedSecret = secret.trim();
    if (trimmedSecret.length > 0 && candidate.includes(trimmedSecret)) {
      return DEFAULT_SAFE_MESSAGES[code];
    }
  }

  return candidate;
}

function fallbackCodeForStatus(status: number | null): ApiErrorCode {
  switch (status) {
    case 401:
      return "INVALID_CREDENTIALS";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 429:
      return "RATE_LIMITED";
    case 422:
      return "VALIDATION_ERROR";
    case 400:
      return "INVALID_REQUEST";
    default:
      return "INTERNAL_ERROR";
  }
}

export function parseApiErrorEnvelope(
  payload: unknown,
  status: number | null,
  sensitiveValues: readonly string[] = [],
): ApiErrorDetail {
  if (isRecord(payload) && isRecord(payload.error)) {
    const envelope = payload as unknown as ApiErrorEnvelope;
    const rawCode = typeof envelope.error.code === "string" ? envelope.error.code : "";
    const code = isKnownErrorCode(rawCode) ? rawCode : fallbackCodeForStatus(status);
    const rawMessage =
      typeof envelope.error.message === "string" ? envelope.error.message : undefined;
    return { code, message: sanitizeUserMessage(code, rawMessage, sensitiveValues) };
  }

  const code = fallbackCodeForStatus(status);
  return { code, message: DEFAULT_SAFE_MESSAGES[code] };
}

function parseRetryAfterSeconds(headerValue: unknown): number | null {
  if (typeof headerValue !== "string") {
    return null;
  }
  const parsed = Number.parseInt(headerValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Normalise any failure (Axios, timeout, offline, unknown) into an ApiClientError. */
export function normalizeUnknownError(
  error: unknown,
  sensitiveValues: readonly string[] = [],
): ApiClientError {
  if (error instanceof ApiClientError) {
    return new ApiClientError({
      code: error.code,
      message: sanitizeUserMessage(error.code, error.message, sensitiveValues),
      status: error.status,
      retryAfterSeconds: error.retryAfterSeconds,
    });
  }

  if (axios.isAxiosError(error)) {
    const axiosErr = error as AxiosError<unknown>;
    if (axiosErr.code === "ECONNABORTED" || axiosErr.message.toLowerCase().includes("timeout")) {
      return new ApiClientError({
        code: "TIMEOUT_ERROR",
        message: DEFAULT_SAFE_MESSAGES.TIMEOUT_ERROR,
        status: null,
      });
    }

    if (!axiosErr.response) {
      return new ApiClientError({
        code: "NETWORK_ERROR",
        message: DEFAULT_SAFE_MESSAGES.NETWORK_ERROR,
        status: null,
      });
    }

    const status = axiosErr.response.status;
    const parsed = parseApiErrorEnvelope(axiosErr.response.data, status, sensitiveValues);
    return new ApiClientError({
      code: parsed.code,
      message: parsed.message,
      status,
      retryAfterSeconds: parseRetryAfterSeconds(axiosErr.response.headers?.["retry-after"]),
    });
  }

  return new ApiClientError({
    code: "INTERNAL_ERROR",
    message: DEFAULT_SAFE_MESSAGES.INTERNAL_ERROR,
    status: null,
  });
}
