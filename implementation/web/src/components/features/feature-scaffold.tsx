"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { SurfaceCard } from "@/components/ui/surface-card";
import { useSessionStore } from "@/lib/auth/session-store";
import {
  getFeature,
  resolveSpaceContext,
} from "@/lib/features/feature-registry";
import type { FeatureId, FinanceSpace } from "@/lib/features/types";
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
  const user = useSessionStore((state) => state.user);

  const [activeSpace, setActiveSpace] = useState<FinanceSpace>(defaultSpace);
  const [viewMode, setViewMode] = useState<FeatureViewMode>(initialMode);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

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
    <main
      className={`mx-auto max-w-6xl p-5 sm:p-7 space-y-6 ${className}`}
      data-testid={`feature-scaffold-${feature.id}`}
    >
      {/* Page Header with Real Title, Space Badge, Scope Toggle, and Primary Action */}
      <FeaturePageHeader
        feature={feature}
        activeSpace={activeSpace}
        onSpaceChange={setActiveSpace}
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
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-elevated/80 px-4 py-2.5 text-xs text-text-secondary border border-border max-w-full overflow-hidden"
        data-testid="state-inspector-bar"
      >
        <div className="flex items-center gap-2 min-w-0">
          <FeatureIcon name="Info" size={16} weight="duotone" className="text-primary shrink-0" />
          <span className="font-mono text-[11px] truncate">
            Active Space: <strong className="text-text-primary">{spaceContext.label}</strong> ({spaceContext.baseCurrency})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-text-muted text-[11px] mr-1">Inspect State:</span>
          {(["normal", "loading", "unavailable", "plan-locked"] as const).map(
            (mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`rounded-md px-2 py-0.5 font-mono text-[11px] capitalize transition-colors ${
                  viewMode === mode
                    ? "bg-primary text-white font-semibold"
                    : "bg-surface text-text-secondary hover:text-text-primary border border-border"
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
            onSwitchSpace={(target) => setActiveSpace(target)}
          />

          {/* Feature Information Details Card */}
          <SurfaceCard className="p-6 space-y-4">
            <h2 className="font-heading text-base font-semibold text-text-primary">
              Feature Information & Scope Rules
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-xs">
              <div className="space-y-1 rounded-xl bg-surface-elevated p-3 border border-border">
                <span className="font-semibold text-text-primary">Category</span>
                <p className="text-text-secondary capitalize">{feature.category}</p>
              </div>

              <div className="space-y-1 rounded-xl bg-surface-elevated p-3 border border-border">
                <span className="font-semibold text-text-primary">Space Availability</span>
                <p className="text-text-secondary">
                  Personal: {feature.availability.personal ? "Yes" : "No"} · Business:{" "}
                  {feature.availability.business ? "Yes" : "No"}
                </p>
              </div>

              <div className="space-y-1 rounded-xl bg-surface-elevated p-3 border border-border">
                <span className="font-semibold text-text-primary">Offline Support</span>
                <p className="text-text-secondary">
                  {feature.supportsOfflineDrafts ? "Queued up to 100 drafts" : "Requires online connection"}
                </p>
              </div>
            </div>

            {feature.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2">
                <span className="font-sans text-xs text-text-muted mr-1">Tags:</span>
                {feature.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-surface-elevated px-2 py-0.5 font-mono text-[11px] text-text-secondary border border-border"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </SurfaceCard>
        </section>
      )}
    </main>
  );
}
