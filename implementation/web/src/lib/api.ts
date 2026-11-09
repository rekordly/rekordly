// The one HTTP client for the Rekordly API.
//
// Session model: the session is an HttpOnly cookie the browser sends for us, so
// JavaScript never holds a bearer token. Unsafe requests also carry the CSRF
// double-submit header. Responses are unwrapped from the `{ data }` envelope and
// every failure leaves here as a sanitised ApiClientError.

import axios, { type AxiosInstance, type AxiosRequestConfig, type Method } from "axios";

import {
  ApiClientError,
  DEFAULT_SAFE_MESSAGES,
  isRecord,
  normalizeUnknownError,
} from "./errors.ts";
import type { ApiSuccessEnvelope } from "../types/api.ts";

export const DEFAULT_API_TIMEOUT_MS = 15_000;
export const DEFAULT_API_BASE_URL = "http://localhost:8080";

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

export const API_BASE_URL = resolveApiBaseUrl();

/**
 * The CSRF token comes from the API and lives only in memory. Its cookie is
 * private to the API host so that other subdomains, such as customer
 * storefronts, cannot read it.
 */
let csrfToken: string | null = null;

export function getCsrfToken(): string | null {
  return csrfToken;
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
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

/** Scope one request to a workspace. The API re-checks membership on every call. */
export function workspaceHeaders(workspaceId: number): Readonly<Record<string, string>> {
  if (!Number.isSafeInteger(workspaceId) || workspaceId <= 0) {
    throw new ApiClientError({
      code: "WORKSPACE_REQUIRED",
      message: DEFAULT_SAFE_MESSAGES.WORKSPACE_REQUIRED,
    });
  }
  return { "X-Workspace-ID": String(workspaceId) };
}

type SessionLostHandler = () => void;
let onSessionLost: SessionLostHandler | null = null;

/** Registered once by the app so a dead session can be handled without an import cycle. */
export function setSessionLostHandler(handler: SessionLostHandler | null): void {
  onSessionLost = handler;
}

/** Auth endpoints answer 401 for wrong passwords, and /me is how we learn the session state. */
function isSessionAwarePath(path: string): boolean {
  const pathname = path.split("?")[0] ?? path;
  return pathname.startsWith("/api/v1/auth/") || pathname === "/api/v1/me";
}

export class RekordlyApiClient {
  private readonly instance: AxiosInstance;

  public constructor(instance?: AxiosInstance) {
    this.instance = instance ?? createApiAxiosInstance();
  }

  public getAxiosInstance(): AxiosInstance {
    return this.instance;
  }

  private async request<TResponseData>(
    method: Method,
    path: string,
    body: unknown,
    options: ApiRequestOptions | undefined,
    isRetry = false,
  ): Promise<TResponseData> {
    const csrfAtSend = csrfToken;
    try {
      const response = await this.instance.request<ApiSuccessEnvelope<TResponseData>>({
        ...buildAuthRequestConfig(options),
        method,
        url: path,
        data: body,
      });

      if (response.status === 204) {
        return undefined as TResponseData;
      }

      if (!isRecord(response.data) || !("data" in response.data)) {
        throw new ApiClientError({
          code: "INTERNAL_ERROR",
          message: DEFAULT_SAFE_MESSAGES.INTERNAL_ERROR,
          status: response.status,
        });
      }

      return response.data.data;
    } catch (error: unknown) {
      const normalized = normalizeUnknownError(error, options?.sensitiveValues ?? []);
      // Another tab rotated the session, so this tab's token is out of date.
      // Mutations carry idempotency keys, which makes one retry safe.
      if (normalized.code === "CSRF_INVALID" && !isRetry) {
        await this.syncCsrfToken();
        return this.request<TResponseData>(method, path, body, options, true);
      }
      if (normalized.status === 401 && !isSessionAwarePath(path)) {
        // The session may have rotated while this request was in flight.
        if (!isRetry && csrfAtSend !== csrfToken) {
          return this.request<TResponseData>(method, path, body, options, true);
        }
        onSessionLost?.();
      }
      throw normalized;
    }
  }

  /** Fetch the session's current CSRF token from the API. */
  public async syncCsrfToken(): Promise<string | null> {
    const current = await this.get<{ csrf_token?: string }>("/api/v1/me");
    if (current.csrf_token) {
      csrfToken = current.csrf_token;
    }
    return csrfToken;
  }

  public get<TResponseData>(path: string, options?: ApiRequestOptions): Promise<TResponseData> {
    return this.request<TResponseData>("get", path, undefined, options);
  }

  public post<TRequest, TResponseData>(
    path: string,
    body: TRequest,
    options?: ApiRequestOptions,
  ): Promise<TResponseData> {
    return this.request<TResponseData>("post", path, body, options);
  }

  public put<TRequest, TResponseData>(
    path: string,
    body: TRequest,
    options?: ApiRequestOptions,
  ): Promise<TResponseData> {
    return this.request<TResponseData>("put", path, body, options);
  }

  public delete<TResponseData>(path: string, options?: ApiRequestOptions): Promise<TResponseData> {
    return this.request<TResponseData>("delete", path, undefined, options);
  }
}

export const apiClient = new RekordlyApiClient();
