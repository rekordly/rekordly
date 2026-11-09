"use client";

import { Button } from "@/components/ui/button";
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

export function FeaturePageHeader({
  feature,
  activeSpace,
  onSpaceChange,
  onPrimaryAction,
  actionLabel,
  actionDisabled = false,
  className = "",
}: FeaturePageHeaderProps) {
  const effectiveActionLabel = actionLabel ?? feature.primaryAction.label;

  const isBusinessOnly =
    !feature.availability.personal && feature.availability.business;

  const spaceBadgeClass =
    activeSpace === "personal"
      ? "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/60"
      : activeSpace === "business"
        ? "bg-primary-soft text-primary-text border-primary/20 dark:bg-primary-950/40 dark:text-primary-300 dark:border-primary-800/40"
        : "bg-surface-elevated text-text-secondary border-border dark:bg-surface-elevated dark:text-text-secondary";

  const spaceBadgeLabel =
    activeSpace === "personal"
      ? "Personal Finance"
      : activeSpace === "business"
        ? "Business Space"
        : "All Spaces (Owner Summary)";

  return (
    <header className={`flex flex-col gap-4 border-b border-border pb-6 ${className}`}>
      {/* Top row: Context pill + space toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-sans text-xs font-medium ${spaceBadgeClass}`}
            data-testid="feature-space-badge"
          >
            <FeatureIcon
              name={
                activeSpace === "personal"
                  ? "User"
                  : activeSpace === "business"
                    ? "Buildings"
                    : "SquaresFour"
              }
              size={14}
              weight="duotone"
            />
            {spaceBadgeLabel}
          </span>

          {isBusinessOnly && activeSpace === "personal" && (
            <span
              className="inline-flex items-center rounded-full bg-secondary-soft px-2.5 py-0.5 font-sans text-xs font-medium text-secondary-text border border-secondary/20"
              data-testid="business-only-pill"
            >
              Commercial feature
            </span>
          )}

          {feature.status === "foundation" && (
            <span
              className="inline-flex items-center rounded-full bg-surface-elevated px-2 py-0.5 font-mono text-[11px] text-text-secondary border border-border"
              data-testid="foundation-status-pill"
            >
              V2 Scaffold
            </span>
          )}
        </div>

        {/* Finance Scope Toggle: All | Business | Personal */}
        {onSpaceChange && (
          <nav
            aria-label="Finance scope filter"
            className="inline-flex items-center rounded-xl bg-surface-elevated p-1 border border-border"
            data-testid="finance-scope-toggle"
          >
            {(["business", "personal", "all"] as const).map((spaceOption) => {
              const isSelected = activeSpace === spaceOption;
              const label =
                spaceOption === "business"
                  ? "Business"
                  : spaceOption === "personal"
                    ? "Personal"
                    : "All";

              return (
                <button
                  key={spaceOption}
                  type="button"
                  onClick={() => onSpaceChange(spaceOption)}
                  className={`rounded-lg px-3 py-1 font-sans text-xs font-medium transition-all ${
                    isSelected
                      ? "bg-surface text-text-primary shadow-xs font-semibold"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                  aria-pressed={isSelected}
                  data-testid={`scope-option-${spaceOption}`}
                >
                  {label}
                </button>
              );
            })}
          </nav>
        )}
      </div>

      {/* Main row: Title + description + primary action */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary border border-primary/20">
              <FeatureIcon name={feature.iconName} size={22} weight="duotone" />
            </div>
            <h1
              className="font-heading text-2xl font-bold tracking-tight text-text-primary sm:text-3xl"
              data-testid="feature-page-title"
            >
              {feature.name}
            </h1>
          </div>
          <p className="font-sans text-sm text-text-secondary max-w-2xl pt-1">
            {feature.description}
          </p>
        </div>

        {/* Primary Action Button */}
        <div className="shrink-0 pt-1">
          <Button
            variant="primary"
            size="md"
            isDisabled={actionDisabled}
            onPress={onPrimaryAction}
            startIcon={
              <FeatureIcon
                name={feature.primaryAction.iconName}
                size={18}
                weight="duotone"
              />
            }
            data-testid="feature-primary-action-button"
          >
            {effectiveActionLabel}
          </Button>
        </div>
      </div>
    </header>
  );
}
