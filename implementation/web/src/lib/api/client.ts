import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";

import type {
  ApiErrorCode,
  ApiErrorDetail,
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
} from "./types.ts";

export const DEFAULT_API_TIMEOUT_MS = 15_000;
export const DEFAULT_API_BASE_URL = "http://localhost:8080";

const KNOWN_ERROR_CODES: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>([
  "INVALID_CREDENTIALS",
  "INVALID_PROOF",
  "RATE_LIMITED",
  "PASSWORD_ALREADY_SET",
  "VALIDATION_ERROR",
  "INVALID_REQUEST",
  "INTERNAL_ERROR",
  "NETWORK_ERROR",
  "TIMEOUT_ERROR",
]);

const DEFAULT_SAFE_MESSAGES: Readonly<Record<ApiErrorCode, string>> = {
  INVALID_CREDENTIALS: "Email or password is incorrect.",
  INVALID_PROOF:
    "This verification link or session proof is invalid, expired, or has already been used.",
  RATE_LIMITED: "Too many attempts. Please wait a few minutes and try again.",
  PASSWORD_ALREADY_SET: "A password is already configured for this account.",
  VALIDATION_ERROR: "Please check your input and try again.",
  INVALID_REQUEST: "Unable to process the request. Please check your details and try again.",
  INTERNAL_ERROR: "Unable to complete the request right now. Please try again.",
  NETWORK_ERROR:
    "Unable to reach Rekordly servers. Check your internet connection and try again.",
  TIMEOUT_ERROR: "The request timed out. Please check your connection and try again.",
};

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

export function resolveApiBaseUrl(rawEnvUrl?: string): string {
  const candidate = (rawEnvUrl ?? process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_BASE_URL).trim();
  if (!candidate) {
    return DEFAULT_API_BASE_URL;
  }
  const withoutTrailingSlash = candidate.replace(/\/+$/, "");
  if (withoutTrailingSlash.endsWith("/api/v1")) {
    return withoutTrailingSlash.slice(0, -"/api/v1".length);
  }
  return withoutTrailingSlash;
}

function readCsrfCookie(): string | null {
  if (typeof document === "undefined" || typeof document.cookie !== "string") {
    return null;
  }
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("rekordly_csrf="));
  if (!match) {
    return null;
  }
  const rawValue = match.slice("rekordly_csrf=".length);
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isKnownErrorCode(code: string): code is ApiErrorCode {
  return KNOWN_ERROR_CODES.has(code as ApiErrorCode);
}

export function sanitizeUserMessage(
  code: ApiErrorCode,
  rawMessage: string | undefined,
  sensitiveValues: readonly string[] = [],
): string {
  // Always enforce neutral messaging for INVALID_CREDENTIALS and INVALID_PROOF
  if (code === "INVALID_CREDENTIALS") {
    return DEFAULT_SAFE_MESSAGES.INVALID_CREDENTIALS;
  }
  if (code === "INVALID_PROOF") {
    return DEFAULT_SAFE_MESSAGES.INVALID_PROOF;
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

export function parseApiErrorEnvelope(
  payload: unknown,
  status: number | null,
  sensitiveValues: readonly string[] = [],
): ApiErrorDetail {
  if (isRecord(payload) && isRecord(payload.error)) {
    const envelope = payload as unknown as ApiErrorEnvelope;
    const rawCode = typeof envelope.error.code === "string" ? envelope.error.code : "";
    const code: ApiErrorCode = isKnownErrorCode(rawCode)
      ? rawCode
      : status === 401
        ? "INVALID_CREDENTIALS"
        : status === 429
          ? "RATE_LIMITED"
          : status === 409
            ? "PASSWORD_ALREADY_SET"
            : status === 422
              ? "VALIDATION_ERROR"
              : status === 400
                ? "INVALID_REQUEST"
                : "INTERNAL_ERROR";

    const rawMessage =
      typeof envelope.error.message === "string" ? envelope.error.message : undefined;
    return {
      code,
      message: sanitizeUserMessage(code, rawMessage, sensitiveValues),
    };
  }

  if (status === 401) {
    return {
      code: "INVALID_CREDENTIALS",
      message: DEFAULT_SAFE_MESSAGES.INVALID_CREDENTIALS,
    };
  }
  if (status === 429) {
    return {
      code: "RATE_LIMITED",
      message: DEFAULT_SAFE_MESSAGES.RATE_LIMITED,
    };
  }
  if (status === 409) {
    return {
      code: "PASSWORD_ALREADY_SET",
      message: DEFAULT_SAFE_MESSAGES.PASSWORD_ALREADY_SET,
    };
  }
  if (status === 422) {
    return {
      code: "VALIDATION_ERROR",
      message: DEFAULT_SAFE_MESSAGES.VALIDATION_ERROR,
    };
  }
  if (status === 400) {
    return {
      code: "INVALID_REQUEST",
      message: DEFAULT_SAFE_MESSAGES.INVALID_REQUEST,
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: DEFAULT_SAFE_MESSAGES.INTERNAL_ERROR,
  };
}

function parseRetryAfterSeconds(headerValue: unknown): number | null {
  if (typeof headerValue !== "string") {
    return null;
  }
  const parsed = Number.parseInt(headerValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

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
    const retryAfterSeconds = parseRetryAfterSeconds(
      axiosErr.response.headers?.["retry-after"],
    );
    const parsed = parseApiErrorEnvelope(axiosErr.response.data, status, sensitiveValues);

    return new ApiClientError({
      code: parsed.code,
      message: parsed.message,
      status,
      retryAfterSeconds,
    });
  }

  return new ApiClientError({
    code: "INTERNAL_ERROR",
    message: DEFAULT_SAFE_MESSAGES.INTERNAL_ERROR,
    status: null,
  });
}

export interface ApiRequestOptions {
  headers?: Readonly<Record<string, string>>;
  sensitiveValues?: readonly string[];
  signal?: AbortSignal;
}

export function buildAuthRequestConfig(options?: ApiRequestOptions): AxiosRequestConfig {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(options?.headers ?? {}),
  };

  const csrfToken = readCsrfCookie();
  if (csrfToken && !headers["X-CSRF-Token"]) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  return {
    withCredentials: true,
    fetchOptions: {
      credentials: "include",
    },
    timeout: DEFAULT_API_TIMEOUT_MS,
    headers,
    signal: options?.signal,
  };
}

export function createApiAxiosInstance(baseURL?: string): AxiosInstance {
  return axios.create({
    baseURL: resolveApiBaseUrl(baseURL),
    timeout: DEFAULT_API_TIMEOUT_MS,
    withCredentials: true,
    fetchOptions: {
      credentials: "include",
    },
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
}

export class RekordlyApiClient {
  private readonly instance: AxiosInstance;

  public constructor(instance?: AxiosInstance) {
    this.instance = instance ?? createApiAxiosInstance();
  }

  public getAxiosInstance(): AxiosInstance {
    return this.instance;
  }

  public async get<TResponseData>(
    path: string,
    options?: ApiRequestOptions,
  ): Promise<TResponseData> {
    const config = buildAuthRequestConfig(options);
    try {
      const response: AxiosResponse<ApiSuccessEnvelope<TResponseData>> =
        await this.instance.get<ApiSuccessEnvelope<TResponseData>>(path, config);

      if (!isRecord(response.data) || !("data" in response.data)) {
        throw new ApiClientError({
          code: "INTERNAL_ERROR",
          message: DEFAULT_SAFE_MESSAGES.INTERNAL_ERROR,
          status: response.status,
        });
      }

      return response.data.data;
    } catch (error: unknown) {
      throw normalizeUnknownError(error, options?.sensitiveValues ?? []);
    }
  }

  public async post<TRequest, TResponseData>(
    path: string,
    body: TRequest,
    options?: ApiRequestOptions,
  ): Promise<TResponseData> {
    const config = buildAuthRequestConfig(options);
    try {
      const response: AxiosResponse<ApiSuccessEnvelope<TResponseData>> =
        await this.instance.post<ApiSuccessEnvelope<TResponseData>>(path, body, config);

      if (!isRecord(response.data) || !("data" in response.data)) {
        throw new ApiClientError({
          code: "INTERNAL_ERROR",
          message: DEFAULT_SAFE_MESSAGES.INTERNAL_ERROR,
          status: response.status,
        });
      }

      return response.data.data;
    } catch (error: unknown) {
      throw normalizeUnknownError(error, options?.sensitiveValues ?? []);
    }
  }

  public async put<TRequest, TResponseData>(
    path: string,
    body: TRequest,
    options?: ApiRequestOptions,
  ): Promise<TResponseData> {
    const config = buildAuthRequestConfig(options);
    try {
      const response: AxiosResponse<ApiSuccessEnvelope<TResponseData>> =
        await this.instance.put<ApiSuccessEnvelope<TResponseData>>(path, body, config);
      if (!isRecord(response.data) || !("data" in response.data)) {
        throw new ApiClientError({ code: "INTERNAL_ERROR", message: DEFAULT_SAFE_MESSAGES.INTERNAL_ERROR, status: response.status });
      }
      return response.data.data;
    } catch (error: unknown) {
      throw normalizeUnknownError(error, options?.sensitiveValues ?? []);
    }
  }
}

export const apiClient = new RekordlyApiClient();
