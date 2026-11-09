import type { CurrentUser } from "./schemas/auth.ts";
import {
  FEATURE_REGISTRY_LIST,
  FEATURE_REGISTRY_MAP,
} from "./feature-registry-data.ts";
import type {
  FeatureCategory,
  FeatureDefinition,
  FeatureId,
  FinanceSpace,
  SpaceContextInfo,
} from "../types/features.ts";

export * from "./feature-registry-data.ts";
export * from "../types/features.ts";

/**
 * Returns a specific feature definition by ID.
 */
export function getFeature(id: FeatureId): FeatureDefinition {
  const feature = FEATURE_REGISTRY_MAP[id];
  if (!feature) {
    throw new Error(`Unknown feature ID: ${id}`);
  }
  return feature;
}

/**
 * Returns the list of all registered features.
 */
export function getAllFeatures(): readonly FeatureDefinition[] {
  return FEATURE_REGISTRY_LIST;
}

/**
 * Matches a route pathname (e.g. "/invoices" or "/reports/tax") to its feature definition.
 */
export function getFeatureByRoute(pathname: string): FeatureDefinition | undefined {
  const normalized = pathname.trim().replace(/\/+$/, "") || "/";
  return FEATURE_REGISTRY_LIST.find((feature) => {
    const featureRoute = feature.route.replace(/\/+$/, "") || "/";
    if (normalized === featureRoute || normalized.startsWith(`${featureRoute}/`)) {
      return true;
    }
    if (feature.aliases?.some((alias) => {
      const aliasRoute = alias.replace(/\/+$/, "") || "/";
      return normalized === aliasRoute || normalized.startsWith(`${aliasRoute}/`);
    })) {
      return true;
    }
    return false;
  });
}

/**
 * Returns all features accessible or visible in a given space (Personal, Business, or All).
 */
export function getFeaturesForSpace(space: FinanceSpace): FeatureDefinition[] {
  return FEATURE_REGISTRY_LIST.filter((feature) => {
    if (space === "personal") {
      return feature.availability.personal;
    }
    if (space === "business") {
      return feature.availability.business;
    }
    return feature.availability.allSummary;
  });
}

/**
 * Returns features grouped by functional category.
 */
export function getFeaturesByCategory(category: FeatureCategory): FeatureDefinition[] {
  return FEATURE_REGISTRY_LIST.filter((feature) => feature.category === category);
}

/**
 * Returns features suitable for the Universal Add action menu in the current space.
 */
export function getUniversalAddFeatures(space: FinanceSpace): FeatureDefinition[] {
  return FEATURE_REGISTRY_LIST.filter((feature) => {
    if (space === "personal") {
      return (
        feature.availability.personal &&
        feature.category !== "platform" &&
        feature.category !== "compliance"
      );
    }
    if (space === "business") {
      return feature.availability.business && feature.category !== "platform";
    }
    return feature.availability.allSummary && feature.category !== "platform";
  });
}

/**
 * Checks if a feature is enabled/available in a given space.
 */
export function isFeatureAvailableInSpace(
  featureId: FeatureId,
  space: FinanceSpace,
): boolean {
  const feature = FEATURE_REGISTRY_MAP[featureId];
  if (!feature) {
    return false;
  }
  if (space === "personal") {
    return feature.availability.personal;
  }
  if (space === "business") {
    return feature.availability.business;
  }
  return feature.availability.allSummary;
}

/**
 * Derives rich, honest space context for UI display without faking balances or server states.
 */
export function resolveSpaceContext(
  user: CurrentUser | null,
  activeSpace: FinanceSpace = "business",
): SpaceContextInfo {
  const primaryWorkspace = user?.workspaces?.[0];
  const isOwner = primaryWorkspace?.is_owner ?? false;
  const baseCurrency = primaryWorkspace?.base_currency ?? "NGN";

  if (activeSpace === "personal") {
    return {
      space: "personal",
      label: "Personal Finance",
      workspaceName: user?.display_name ? `${user.display_name}'s Personal` : "Personal Space",
      baseCurrency,
      isOwner: true,
      badgeText: "Personal Space",
      badgeVariant: "default",
    };
  }

  if (activeSpace === "all") {
    return {
      space: "all",
      label: "Consolidated Owner View",
      workspaceName: "All Spaces (Personal & Business)",
      baseCurrency,
      isOwner,
      badgeText: "Consolidated Owner View",
      badgeVariant: "neutral",
    };
  }

  return {
    space: "business",
    label: "Business Space",
    workspaceName: primaryWorkspace?.name ?? "Business Workspace",
    baseCurrency,
    isOwner,
    badgeText: `${primaryWorkspace?.name ?? "Business"} (${baseCurrency})`,
    badgeVariant: "success",
  };
}

/**
 * Resolves the default active space from workspace kind.
 */
export function getDefaultSpaceForUser(user: CurrentUser | null): FinanceSpace {
  const firstKind = user?.workspaces?.[0]?.kind?.toLowerCase();
  if (firstKind === "personal") {
    return "personal";
  }
  return "business";
}
