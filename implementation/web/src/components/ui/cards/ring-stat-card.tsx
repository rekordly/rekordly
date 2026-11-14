"use client";

// 3. Ring progress: a progress ring around the icon, the amount, and a target line.
// For budgets used, invoices collected, tax readiness, savings goals.

import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { CardFrame, CardSkeleton, DeltaChip, TONE_MUTED, type CardTone, type Delta } from "./card-frame";

export interface RingStatCardProps {
  icon: PhosphorIcon;
  label: string;
  value: ReactNode;
  /** 0 to 1. Clamped. */
  progress: number;
  /** e.g. "Target: ₦200,000" or "₦12,000 left". */
  caption?: ReactNode;
  /** Change against the previous period, shown under the amount. */
  delta?: Delta;
  /** Colours the ring amber or red when the reading is a warning. */
  status?: "good" | "warning" | "danger";
  tone?: CardTone;
  href?: string;
  loading?: boolean;
  className?: string;
  /** Smaller amount and padding for 2×2 grids in narrow columns. */
  compact?: boolean;
}

const RING_COLOUR = { good: "var(--primary)", warning: "var(--secondary)", danger: "var(--danger)" };

function Ring({ progress, colour, track, icon: Icon }: { progress: number; colour: string; track: string; icon: PhosphorIcon }) {
  const size = 48;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = Math.min(1, Math.max(0, progress));
  return (
    <span className="relative grid size-12 shrink-0 place-items-center" role="img" aria-label={`${Math.round(value * 100)}%`}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value)}
        />
      </svg>
      <Icon size={18} aria-hidden="true" />
    </span>
  );
}

export function RingStatCard({ icon, label, value, progress, caption, delta, status = "good", tone = "plain", href, loading, className, compact = false }: RingStatCardProps) {
  if (loading) return <CardSkeleton className={className} />;
  const colour = tone === "brand" ? "#ffffff" : RING_COLOUR[status];
  const track =
    tone === "plain" ? "var(--separator)" : tone === "ink" ? "color-mix(in srgb, var(--ink-foreground) 18%, transparent)" : "rgb(255 255 255 / 18%)";
  return (
    <CardFrame tone={tone} href={href} className={`justify-between ${compact ? "p-4" : "max-sm:p-4"} ${className ?? ""}`}>
      <div className="flex items-center gap-3">
        <Ring progress={progress} colour={colour} track={track} icon={icon} />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold">{label}</p>
          <p className={`text-[12px] tabular ${TONE_MUTED[tone]}`}>{Math.round(Math.min(1, Math.max(0, progress)) * 100)}%</p>
        </div>
      </div>
      <div>
        <p className={`truncate leading-none font-bold tracking-tight tabular ${compact ? "mt-4 text-[19px]" : "mt-5 text-[19px] sm:mt-6 sm:text-[26px]"}`}>{value}</p>
        {delta ? (
          <div className="mt-2.5">
            <DeltaChip delta={delta} tone={tone} />
          </div>
        ) : null}
        {caption ? <p className={`mt-2 text-[12px] ${TONE_MUTED[tone]}`}>{caption}</p> : null}
      </div>
    </CardFrame>
  );
}
