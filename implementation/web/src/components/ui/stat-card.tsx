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

/** Light fades to the card surface; dark runs to a deeper shade of the same colour. */
const GRADIENT: Readonly<Record<StatTone, string>> = {
  primary: "from-stat-green-from to-stat-green-to",
  success: "from-stat-green-from to-stat-green-to",
  secondary: "from-stat-orange-from to-stat-orange-to",
  warning: "from-stat-orange-from to-stat-orange-to",
  danger: "from-stat-red-from to-stat-red-to",
  default: "from-stat-neutral-from to-stat-neutral-to",
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
  const iconBox = (size: string) => (
    <span className={`grid shrink-0 place-items-center rounded-2xl ${ICON[tone]} ${size}`}>{icon}</span>
  );

  return (
    <Card
      className={`gap-0 rounded-3xl border-0 shadow-none ${compact ? "p-4" : "p-5 sm:p-6"} ${
        gradient ? `bg-linear-to-b ${GRADIENT[tone]}` : "bg-surface"
      } ${className}`}
    >
      {/* On phones the card is narrow, so the icon moves up beside the tag and the amount gets the full width. */}
      <div className="flex items-center justify-between gap-2">
        <span className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap normal-case sm:px-2.5 sm:uppercase ${TAG[tone]}`}>{tag}</span>
        {icon ? <span className="sm:hidden">{iconBox("size-8 [&_svg]:size-4")}</span> : null}
      </div>
      <div className={`flex items-center justify-between gap-4 ${compact ? "mt-3" : "mt-5"}`}>
        <div className="min-w-0">
          {isLoading ? (
            <span className="block h-7 w-32 max-w-full animate-pulse rounded-lg bg-default" />
          ) : (
            <h2 className={`tabular font-bold tracking-tight [overflow-wrap:anywhere] ${compact ? "text-[19px]" : "text-[22px]"}`}>{title}</h2>
          )}
          {description ? <p className="mt-1 text-xs text-foreground/70">{description}</p> : null}
        </div>
        {icon ? <span className="hidden sm:block">{iconBox(compact ? "size-11" : "size-14")}</span> : null}
      </div>
    </Card>
  );
}
