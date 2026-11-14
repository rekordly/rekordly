"use client";

// 1. KPI tile: icon and label, one large amount, and a change chip.
// The workhorse for the top row of every hub page.

import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { CardFrame, CardHeader, CardSkeleton, DeltaChip, TONE_MUTED, type CardTone, type Delta } from "./card-frame";

export interface KpiCardProps {
  icon: PhosphorIcon;
  label: string;
  value: ReactNode;
  delta?: Delta;
  /** One short line under the amount when there is no change to show, e.g. "Across 3 accounts". */
  hint?: ReactNode;
  /** Small bars in the corner showing the recent trend (relative values only). */
  trend?: number[];
  action?: ReactNode;
  tone?: CardTone;
  href?: string;
  loading?: boolean;
  className?: string;
}

function TrendBars({ values, tone }: { values: number[]; tone: CardTone }) {
  const max = Math.max(...values, 1);
  const bar = tone === "plain" ? "bg-primary" : "bg-current";
  return (
    <div className="flex h-9 items-end gap-[3px]" aria-hidden="true">
      {values.map((value, index) => (
        <span
          key={index}
          className={`w-1.5 rounded-sm ${bar}`}
          style={{ height: `${Math.max(12, (value / max) * 100)}%`, opacity: 0.35 + (index / values.length) * 0.65 }}
        />
      ))}
    </div>
  );
}

export function KpiCard({ icon, label, value, delta, hint, trend, action, tone = "plain", href, loading, className }: KpiCardProps) {
  if (loading) return <CardSkeleton className={className} />;
  return (
    <CardFrame tone={tone} href={href} className={`justify-between ${className ?? ""}`}>
      <CardHeader icon={icon} title={label} tone={tone} action={action} />
      <div className="mt-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[22px] leading-none font-bold tracking-tight tabular sm:text-[26px]">{value}</p>
          <div className="mt-2.5 min-h-5">
            {delta ? <DeltaChip delta={delta} tone={tone} /> : hint ? <p className={`text-[12px] ${TONE_MUTED[tone]}`}>{hint}</p> : null}
          </div>
        </div>
        {trend && trend.length > 1 ? (
          <div className="hidden sm:block">
            <TrendBars values={trend} tone={tone} />
          </div>
        ) : null}
      </div>
    </CardFrame>
  );
}
