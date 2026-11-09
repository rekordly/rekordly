"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { DashboardCard } from "@/components/ui/dashboard-card";
import { Page } from "@/components/ui/page";
import { useAuthStore } from "@/stores/auth-store";
import { useActiveWorkspace } from "@/stores/workspace-store";
import {
  getFeature,
  resolveSpaceContext,
} from "./registry";
import type { FeatureId, FinanceSpace } from "@/types/features";
import { FeatureEmptyState } from "./feature-empty-state";
import { FeatureIcon } from "./feature-icon";
import { FeaturePageHeader } from "./feature-page-header";
import {
  FeatureStateBanner,
  type FeatureViewMode,
} from "./feature-state-banner";

export interface FeatureScaffoldProps {
  featureId: FeatureId;
  defaultSpace?: FinanceSpace;
  initialMode?: FeatureViewMode;
  className?: string;
}

export function FeatureScaffold({
  featureId,
  defaultSpace = "business",
  initialMode = "normal",
  className = "",
}: FeatureScaffoldProps) {
  const feature = getFeature(featureId);
  const user = useAuthStore((state) => state.user);
  const { mode, active, switchSpace } = useActiveWorkspace();
  const [viewMode, setViewMode] = useState<FeatureViewMode>(initialMode);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const activeSpace: FinanceSpace = active || mode === "all" ? mode : defaultSpace;

  const spaceContext = resolveSpaceContext(user, activeSpace);

  const handlePrimaryAction = () => {
    setActionFeedback(
      `"${feature.primaryAction.label}" initiated in ${spaceContext.label}. Ready for Phase 3+ vertical-slice API wiring.`,
    );
  };

  const isBlockedInPersonal =
    !feature.availability.personal &&
    feature.availability.business &&
    activeSpace === "personal";

  return (
    <Page className={className}>
      {/* Page Header with Real Title, Space Badge, Scope Toggle, and Primary Action */}
      <FeaturePageHeader
        feature={feature}
        activeSpace={activeSpace}
        onSpaceChange={switchSpace}
        onPrimaryAction={handlePrimaryAction}
        actionDisabled={viewMode === "loading" || isBlockedInPersonal}
      />

      {/* Action Feedback Alert (Honest, does not claim fake API success) */}
      {actionFeedback && (
        <Alert
          status="info"
          title="Action Dispatched"
          description={actionFeedback}
          onDismiss={() => setActionFeedback(null)}
          data-testid="feature-action-feedback"
        />
      )}

      {/* Honest State Banner (Loading skeleton, Unavailable notice, or Plan-locked card) */}
      <FeatureStateBanner
        mode={viewMode}
        feature={feature}
        onDismiss={() => setViewMode("normal")}
      />

      {/* Mode Switcher Bar for Testing & Development Verification */}
      <aside
        aria-label="Feature State Inspector"
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-2.5 text-xs text-muted max-w-full overflow-hidden"
        data-testid="state-inspector-bar"
      >
        <div className="flex items-center gap-2 min-w-0">
          <FeatureIcon name="Info" size={16} weight="duotone" className="text-primary shrink-0" />
          <span className="font-mono text-[11px] truncate">
            Active Space: <strong className="text-foreground">{spaceContext.label}</strong> ({spaceContext.baseCurrency})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted text-[11px] mr-1">Inspect State:</span>
          {(["normal", "loading", "unavailable", "plan-locked"] as const).map(
            (mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`rounded-md px-2 py-0.5 font-mono text-[11px] capitalize transition-colors ${
                  viewMode === mode
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "bg-default text-muted hover:text-foreground"
                }`}
                aria-pressed={viewMode === mode}
                data-testid={`inspect-mode-${mode}`}
              >
                {mode}
              </button>
            ),
          )}
        </div>
      </aside>

      {/* Content Area: In loading mode, skeleton is in banner; in normal mode, render honest Empty State */}
      {viewMode !== "loading" && (
        <section aria-label={`${feature.name} content`} className="space-y-6">
          <FeatureEmptyState
            feature={feature}
            activeSpace={activeSpace}
            onAction={handlePrimaryAction}
            onSwitchSpace={switchSpace}
          />

          {/* Feature Information Details Card */}
          <DashboardCard className="space-y-4">
            <h2 className="font-heading text-base font-semibold text-foreground">
              Feature Information & Scope Rules
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-xs">
              <div className="space-y-1 rounded-2xl bg-surface-secondary p-3">
                <span className="font-semibold text-foreground">Category</span>
                <p className="text-muted capitalize">{feature.category}</p>
              </div>

              <div className="space-y-1 rounded-2xl bg-surface-secondary p-3">
                <span className="font-semibold text-foreground">Space Availability</span>
                <p className="text-muted">
                  Personal: {feature.availability.personal ? "Yes" : "No"} · Business:{" "}
                  {feature.availability.business ? "Yes" : "No"}
                </p>
              </div>

              <div className="space-y-1 rounded-2xl bg-surface-secondary p-3">
                <span className="font-semibold text-foreground">Offline Support</span>
                <p className="text-muted">
                  {feature.supportsOfflineDrafts ? "Queued up to 100 drafts" : "Requires online connection"}
                </p>
              </div>
            </div>

            {feature.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2">
                <span className="font-sans text-xs text-muted mr-1">Tags:</span>
                {feature.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-default px-2 py-0.5 font-mono text-[11px] text-muted"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </DashboardCard>
        </section>
      )}
    </Page>
  );
}
