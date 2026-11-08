import { ApiClientError, apiClient, type RekordlyApiClient } from "./client";
import { currentUserSchema, type CurrentUser } from "../auth/session-schema";

export const SESSION_ENDPOINTS = {
  CURRENT_USER: "/api/v1/me",
  LOGOUT: "/api/v1/auth/logout",
} as const;

export function createSessionApi(client: RekordlyApiClient = apiClient) {
  return {
    async getCurrentUser(): Promise<CurrentUser> {
      const payload = await client.get<unknown>(SESSION_ENDPOINTS.CURRENT_USER);
      const result = currentUserSchema.safeParse(payload);
      if (!result.success) {
        throw new ApiClientError({
          code: "INTERNAL_ERROR",
          message: "Rekordly returned an invalid session response.",
          status: 502,
        });
      }
      return result.data;
    },

    async logout(): Promise<void> {
      await client.post<Record<string, never>, { logged_out: boolean }>(
        SESSION_ENDPOINTS.LOGOUT,
        {},
      );
    },
  };
}

export const sessionApi = createSessionApi();
