import { apiClient } from "./client";

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
      { headers: { "Idempotency-Key": `onboarding-${crypto.randomUUID()}` } },
    );
  },
};
