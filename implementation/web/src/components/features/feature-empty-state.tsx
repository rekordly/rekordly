"use client";

import { Button } from "@/components/ui/button";
import { SurfaceCard } from "@/components/ui/surface-card";
import type { FeatureDefinition, FinanceSpace } from "@/lib/features/types";
import { FeatureIcon } from "./feature-icon";

export interface FeatureEmptyStateProps {
  feature: FeatureDefinition;
  activeSpace: FinanceSpace;
  onAction?: () => void;
  onSwitchSpace?: (targetSpace: FinanceSpace) => void;
  className?: string;
}

export function FeatureEmptyState({
  feature,
  activeSpace,
  onAction,
  onSwitchSpace,
  className = "",
}: FeatureEmptyStateProps) {
  const emptyMeta =
    feature.emptyState[activeSpace] ?? feature.emptyState.business;

  const isBusinessOnly =
    !feature.availability.personal && feature.availability.business;

  const isBlockedInPersonal = isBusinessOnly && activeSpace === "personal";

  const handleAction = () => {
    if (isBlockedInPersonal && onSwitchSpace) {
      onSwitchSpace("business");
      return;
    }
    if (onAction) {
      onAction();
    }
  };

  const actionText = isBlockedInPersonal
    ? "Switch to Business space"
    : emptyMeta.actionLabel;

  return (
    <SurfaceCard
      className={`flex flex-col items-center justify-center p-8 text-center sm:p-12 border-dashed border-2 ${className}`}
      data-testid="feature-empty-state"
    >
      {/* Icon container */}
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary border border-primary/20 mb-4">
        <FeatureIcon name={feature.iconName} size={30} weight="duotone" />
      </div>

      {/* Title */}
      <h3
        className="font-heading text-lg font-semibold tracking-tight text-text-primary sm:text-xl max-w-md"
        data-testid="empty-state-title"
      >
        {emptyMeta.title}
      </h3>

      {/* Description */}
      <p
        className="mt-2 max-w-lg font-sans text-sm text-text-secondary leading-relaxed"
        data-testid="empty-state-description"
      >
        {emptyMeta.description}
      </p>

      {/* Honest Tip / Guidance Callout */}
      {emptyMeta.tip && (
        <div
          className="mt-4 max-w-md rounded-xl bg-surface-elevated px-4 py-2.5 text-left border border-border"
          data-testid="empty-state-tip"
        >
          <div className="flex items-start gap-2.5">
            <FeatureIcon
              name="Info"
              size={18}
              weight="duotone"
              className="text-primary mt-0.5 shrink-0"
            />
            <p className="font-sans text-xs text-text-secondary leading-normal">
              {emptyMeta.tip}
            </p>
          </div>
        </div>
      )}

      {/* Action Button */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button
          variant={isBlockedInPersonal ? "secondary" : "primary"}
          size="md"
          onPress={handleAction}
          startIcon={
            <FeatureIcon
              name={
                isBlockedInPersonal
                  ? "Buildings"
                  : feature.primaryAction.iconName
              }
              size={18}
              weight="duotone"
            />
          }
          data-testid="empty-state-action-button"
        >
          {actionText}
        </Button>

        {feature.supportsOfflineDrafts && (
          <span className="inline-flex items-center gap-1 font-sans text-xs text-text-muted">
            <FeatureIcon name="CloudSlash" size={14} weight="duotone" />
            Works offline up to 100 drafts
          </span>
        )}
      </div>
    </SurfaceCard>
  );
}
