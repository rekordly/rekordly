"use client";

// 4. Split bar: one amount and a segmented bar showing how it divides,
// e.g. income vs expenses vs what's left, or invoices paid vs unpaid.

import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { CardFrame, CardHeader, CardSkeleton, DeltaChip, TONE_MUTED, type CardTone, type Delta } from "./card-frame";

export interface SplitSegment {
  label: string;
  /** Relative size only; the bar works out the shares. */
  weight: number;
  /** Formatted amount shown on hover and in the legend. */
  display?: ReactNode;
  /** CSS colour. Defaults follow the chart palette. */
  colour?: string;
}

export interface SplitBarCardProps {
  icon?: PhosphorIcon;
  label: string;
  /** Optional: leave out when a card above already shows the total. */
  value?: ReactNode;
  delta?: Delta;
  segments: SplitSegment[];
  action?: ReactNode;
  tone?: CardTone;
  href?: string;
  loading?: boolean;
  className?: string;
}

const DEFAULT_COLOURS = ["var(--foreground)", "var(--secondary)", "var(--primary)", "var(--chart-3)"];

export function SplitBarCard({ icon, label, value, delta, segments, action, tone = "plain", href, loading, className }: SplitBarCardProps) {
  if (loading) return <CardSkeleton className={className} lines={4} />;
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.weight), 0) || 1;
  const coloured = segments.map((segment, index) => ({
    ...segment,
    colour:
      segment.colour ??
      (tone === "plain"
        ? DEFAULT_COLOURS[index % DEFAULT_COLOURS.length]
        : tone === "ink"
          ? `color-mix(in srgb, var(--ink-foreground) ${100 - index * 30}%, transparent)`
          : `rgb(255 255 255 / ${100 - index * 30}%)`),
    share: Math.max(0, segment.weight) / total,
  }));

  return (
    <CardFrame tone={tone} href={href} className={className}>
      <CardHeader icon={icon} title={label} tone={tone} action={action} />
      {value !== undefined ? <p className="mt-5 truncate text-[26px] leading-none font-bold tracking-tight tabular">{value}</p> : null}
      {delta ? <div className="mt-2.5 min-h-5"><DeltaChip delta={delta} tone={tone} /></div> : null}

      <div className={`flex gap-1.5 ${value !== undefined || delta ? "mt-5" : "mt-4"}`} role="list" aria-label={`${label} breakdown`}>
        {coloured.map((segment) => (
          <div key={segment.label} role="listitem" className="min-w-0" style={{ flexGrow: Math.max(segment.share, 0.04), flexBasis: 0 }}>
            <p className={`mb-1.5 text-center text-[11px] font-semibold tabular ${TONE_MUTED[tone]}`}>{Math.round(segment.share * 100)}%</p>
            <div className="h-2 rounded-full" style={{ background: segment.colour }} title={typeof segment.display === "string" ? segment.display : undefined} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {coloured.map((segment) => (
          <span key={segment.label} className="inline-flex items-center gap-1.5 text-[12px]">
            <span className="size-2 rounded-full" style={{ background: segment.colour }} aria-hidden="true" />
            <span className={TONE_MUTED[tone]}>{segment.label}</span>
            {segment.display ? <span className="font-semibold tabular">{segment.display}</span> : null}
          </span>
        ))}
      </div>
    </CardFrame>
  );
}
