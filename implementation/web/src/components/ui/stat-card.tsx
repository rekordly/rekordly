"use client";

// The legacy Rekordly StatCard, rebuilt on HeroUI v3 and semantic tokens.

import { Card } from "@heroui/react";
import type { ReactNode } from "react";

export type StatTone = "primary" | "secondary" | "warning" | "danger" | "success" | "default";

export interface StatCardProps {
  tag: string;
  tone?: StatTone;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  gradient?: boolean;
  compact?: boolean;
  isLoading?: boolean;
  className?: string;
}

const TAG: Readonly<Record<StatTone, string>> = {
  primary: "bg-primary-soft text-primary-soft-foreground",
  secondary: "bg-secondary-soft text-secondary-soft-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  danger: "bg-danger-soft text-danger-soft-foreground",
  success: "bg-success-soft text-success-soft-foreground",
  default: "bg-default text-muted",
};

const ICON: Readonly<Record<StatTone, string>> = {
  primary: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  warning: "bg-warning text-warning-foreground",
  danger: "bg-danger text-danger-foreground",
  success: "bg-success text-success-foreground",
  default: "bg-default text-foreground",
};

const GRADIENT: Readonly<Record<StatTone, string>> = {
  primary: "from-primary-soft",
  secondary: "from-secondary-soft",
  warning: "from-warning-soft",
  danger: "from-danger-soft",
  success: "from-success-soft",
  default: "from-default",
};

export function StatCard({
  tag,
  tone = "primary",
  title,
  description,
  icon,
  gradient = false,
  compact = false,
  isLoading = false,
  className = "",
}: StatCardProps) {
  return (
    <Card
      className={`gap-0 rounded-3xl border-0 shadow-none ${compact ? "p-4" : "p-5 sm:p-6"} ${
        gradient ? `bg-linear-to-b ${GRADIENT[tone]} to-surface` : "bg-surface"
      } ${className}`}
    >
      <span className={`w-fit rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase ${TAG[tone]}`}>{tag}</span>
      <div className={`flex items-center justify-between gap-4 ${compact ? "mt-3" : "mt-5"}`}>
        <div className="min-w-0">
          {isLoading ? (
            <span className="block h-7 w-32 animate-pulse rounded-lg bg-default" />
          ) : (
            <h2 className={`tabular truncate font-bold tracking-tight ${compact ? "text-lg" : "text-[22px]"}`}>{title}</h2>
          )}
          {description ? <p className="mt-1 text-xs text-muted">{description}</p> : null}
        </div>
        {icon ? (
          <span className={`grid shrink-0 place-items-center rounded-2xl ${ICON[tone]} ${compact ? "size-11" : "size-14"}`}>
            {icon}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
