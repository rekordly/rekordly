"use client";

// 9. Metric dots: one percentage, one sentence explaining it, and a row of dots.
// For shares people should feel at a glance: invoices paid on time, savings rate, budget used.

import type { ReactNode } from "react";

import { CardFrame, CardSkeleton, TONE_MUTED, type CardTone } from "./card-frame";

export interface MetricDotsCardProps {
  label: string;
  /** Usually a percentage such as "80%". */
  value: ReactNode;
  description: ReactNode;
  /** 0 to 1. Decides how many dots are filled. */
  progress: number;
  dots?: number;
  tone?: Extract<CardTone, "plain" | "brand" | "ink">;
  href?: string;
  loading?: boolean;
  className?: string;
}

const DOT_STYLE = {
  plain: { on: "border-primary bg-primary-soft", core: "bg-primary", off: "border-border bg-surface" },
  brand: { on: "border-[#0b2e12] bg-white/20", core: "bg-[#0b2e12]", off: "border-white/70 bg-white" },
  ink: { on: "border-primary bg-primary/20", core: "bg-primary", off: "border-ink-foreground/30 bg-transparent" },
} as const;

export function MetricDotsCard({ label, value, description, progress, dots = 10, tone = "plain", href, loading, className }: MetricDotsCardProps) {
  if (loading) return <CardSkeleton className={className} lines={4} />;
  const filled = Math.round(Math.min(1, Math.max(0, progress)) * dots);
  const style = DOT_STYLE[tone];

  return (
    <CardFrame tone={tone} href={href} className={`items-center justify-between text-center ${className ?? ""}`}>
      <p className={`text-[13px] font-semibold ${TONE_MUTED[tone]}`}>{label}</p>
      <p className="mt-3 text-[44px] leading-none font-medium tracking-tight tabular">{value}</p>
      <p className={`mt-3 max-w-[260px] text-[13px] leading-snug ${TONE_MUTED[tone]}`}>{description}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-1.5" role="img" aria-label={`${filled} of ${dots}`}>
        {Array.from({ length: dots }).map((_, index) => {
          const on = index < filled;
          return (
            <span key={index} className={`grid size-5 place-items-center rounded-full border-2 ${on ? style.on : style.off}`}>
              {on ? <span className={`size-2 rounded-full ${style.core}`} /> : null}
            </span>
          );
        })}
      </div>
    </CardFrame>
  );
}
