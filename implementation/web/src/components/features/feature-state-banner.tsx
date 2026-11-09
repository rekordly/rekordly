"use client";

import { Alert } from "@/components/ui/alert";
import { DashboardCard } from "@/components/ui/dashboard-card";
import type { FeatureDefinition, FeaturePlanGateMeta } from "@/types/features";
import { FeatureIcon } from "./feature-icon";

export type FeatureViewMode = "normal" | "loading" | "unavailable" | "plan-locked";

export interface FeatureStateBannerProps {
  mode: FeatureViewMode;
  feature: FeatureDefinition;
  onDismiss?: () => void;
  className?: string;
}

export function FeatureStateBanner({
  mode,
  feature,
  onDismiss,
  className = "",
}: FeatureStateBannerProps) {
  if (mode === "normal") {
    return null;
  }

  if (mode === "loading") {
    return (
      <div
        className={`space-y-4 animate-pulse ${className}`}
        role="status"
        aria-live="polite"
        data-testid="feature-loading-state"
      >
        <div className="h-6 w-48 rounded-lg bg-default" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="h-24 rounded-3xl bg-default" />
          <div className="h-24 rounded-3xl bg-default" />
          <div className="h-24 rounded-3xl bg-default" />
        </div>
        <div className="h-64 rounded-3xl bg-default" />
        <span className="sr-only">Loading feature data...</span>
      </div>
    );
  }

  if (mode === "unavailable") {
    return (
      <Alert
        status="warning"
        title="Service Integration Notice"
        description={`${feature.name} backend integration is scheduled for vertical-slice API wiring. Manual entry and offline drafts are preserved.`}
        onDismiss={onDismiss}
        className={className}
        data-testid="feature-unavailable-alert"
      />
    );
  }

  if (mode === "plan-locked") {
    const gate: FeaturePlanGateMeta = feature.planGate ?? {
      tier: "starter",
      limitLabel: "Monthly quota",
      limitUnit: "records",
      enforcementNote:
        "Access to create new entries requires an upgraded workspace plan. Historical records remain fully readable and exportable.",
    };

    return (
      <DashboardCard
        className={`border-secondary/40 bg-secondary-soft/20 p-5 ${className}`}
        data-testid="feature-plan-locked-card"
      >
        <div className="flex items-start gap-3.5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary-soft text-secondary border border-secondary/20">
            <FeatureIcon name="LockKey" size={22} weight="duotone" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h4 className="font-heading text-sm font-semibold text-foreground">
                Plan Limit: {gate.limitLabel}
              </h4>
              <span className="rounded-full bg-secondary-soft px-2 py-0.5 font-sans text-xs font-semibold uppercase tracking-wider text-secondary-soft-foreground">
                {gate.tier}
              </span>
            </div>
            <p className="font-sans text-xs text-muted leading-relaxed">
              {gate.enforcementNote}
            </p>
            <p className="font-sans text-[11px] text-muted pt-1">
              Per AGENT_RULES: Free limits stop new usage, never access to existing financial history.
            </p>
          </div>
        </div>
      </DashboardCard>
    );
  }

  return null;
}
