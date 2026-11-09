"use client";

import { AppButton } from "@/components/ui/app-button";
import { PageHeader, Segmented, StatusPill, type StatusTone } from "@/components/ui/page";
import type { FeatureDefinition, FinanceSpace } from "@/types/features";

import { FeatureIcon } from "./feature-icon";

export interface FeaturePageHeaderProps {
  feature: FeatureDefinition;
  activeSpace: FinanceSpace;
  onSpaceChange?: (space: FinanceSpace) => void;
  onPrimaryAction?: () => void;
  actionLabel?: string;
  actionDisabled?: boolean;
  className?: string;
}

const SPACE_BADGE: Readonly<Record<FinanceSpace, { label: string; tone: StatusTone; icon: string }>> = {
  personal: { label: "Personal Finance", tone: "accent", icon: "User" },
  business: { label: "Business Space", tone: "success", icon: "Buildings" },
  all: { label: "All Spaces (Owner Summary)", tone: "neutral", icon: "SquaresFour" },
};

const SCOPE_OPTIONS = [
  { key: "business", label: "Business" },
  { key: "personal", label: "Personal" },
  { key: "all", label: "All" },
] as const;

export function FeaturePageHeader({
  feature,
  activeSpace,
  onSpaceChange,
  onPrimaryAction,
  actionLabel,
  actionDisabled = false,
  className = "",
}: FeaturePageHeaderProps) {
  const isBusinessOnly = !feature.availability.personal && feature.availability.business;
  const badge = SPACE_BADGE[activeSpace];

  return (
    <header className={`flex flex-col gap-5 ${className}`}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusPill tone={badge.tone} className="gap-1.5" data-testid="feature-space-badge">
            <FeatureIcon name={badge.icon} size={14} weight="duotone" />
            {badge.label}
          </StatusPill>
          {isBusinessOnly && activeSpace === "personal" ? (
            <StatusPill tone="brand">Commercial feature</StatusPill>
          ) : null}
          {feature.status === "foundation" ? <StatusPill tone="neutral">V2 Scaffold</StatusPill> : null}
        </div>

        {/* Finance Scope Toggle: All | Business | Personal */}
        {onSpaceChange ? (
          <Segmented
            size="sm"
            aria-label="Finance scope filter"
            options={SCOPE_OPTIONS}
            value={activeSpace}
            onChange={onSpaceChange}
          />
        ) : null}
      </div>

      <PageHeader
        title={feature.name}
        description={feature.description}
        leading={
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <FeatureIcon name={feature.iconName} size={22} weight="duotone" />
          </div>
        }
        actions={
          <AppButton
            isDisabled={actionDisabled}
            onPress={onPrimaryAction}
            startContent={<FeatureIcon name={feature.primaryAction.iconName} size={18} weight="duotone" />}
            data-testid="feature-primary-action-button"
          >
            {actionLabel ?? feature.primaryAction.label}
          </AppButton>
        }
      />
    </header>
  );
}
