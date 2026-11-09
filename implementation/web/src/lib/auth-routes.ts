import type { OnboardingStatus } from "../types/api.ts";

export const AUTH_ROUTES = {
  LOGIN: "/login",
  LOGIN_PASSWORD: "/login/password",
  FORGOT_PASSWORD: "/forgot-password",
  RESET_PASSWORD: "/reset-password",
  CREATE_PASSWORD: "/create-password",
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
  "/invoices",
  "/transactions",
  "/reports",
  "/customers",
  "/settings",
  "/invitations",
  "/store",
];

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
