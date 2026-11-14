"use client";

// 7. Summary rows: a named subject (customer, supplier, account), labelled figures,
// and an optional "from → to" footer such as invoiced → collected.

import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { CardFrame, DeltaChip, TONE_LINE, TONE_MUTED, TONE_TILE, type CardTone, type Delta, CardSkeleton } from "./card-frame";

export interface SummaryRow {
  icon: PhosphorIcon;
  label: string;
  value: ReactNode;
  delta?: Delta;
  /** A coloured dot before the value: good, warning or danger. */
  status?: "good" | "warning" | "danger";
}

export interface SummaryFooter {
  from: { label: string; value: ReactNode };
  to: { label: string; value: ReactNode };
  /** Shown on the arrow, e.g. "86% collected". */
  note?: ReactNode;
}

export interface SummaryRowsCardProps {
  title: string;
  subtitle?: ReactNode;
  /** Initials or an icon in the leading tile. */
  leading?: ReactNode;
  action?: ReactNode;
  /** Optional headline above the rows, e.g. the balance owed. */
  headline?: { label: string; value: ReactNode; aside?: ReactNode };
  rows: SummaryRow[];
  footer?: SummaryFooter;
  tone?: Extract<CardTone, "plain" | "ink">;
  loading?: boolean;
  className?: string;
}

const DOT = { good: "bg-primary", warning: "bg-secondary", danger: "bg-danger" };

export function SummaryRowsCard({ title, subtitle, leading, action, headline, rows, footer, tone = "plain", loading, className }: SummaryRowsCardProps) {
  if (loading) return <CardSkeleton className={className} lines={6} />;
  return (
    <CardFrame tone={tone} className={className}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {leading ? (
            <span className={`grid size-11 shrink-0 place-items-center rounded-xl text-[15px] font-bold ${TONE_TILE[tone]}`}>{leading}</span>
          ) : null}
          <div className="min-w-0">
            <h3 className="truncate text-[16px] font-semibold">{title}</h3>
            {subtitle ? <p className={`truncate text-[12px] ${TONE_MUTED[tone]}`}>{subtitle}</p> : null}
          </div>
        </div>
        {action}
      </div>

      {headline ? (
        <div className={`mt-5 flex items-end justify-between gap-3 border-b pb-4 ${TONE_LINE[tone]}`}>
          <div>
            <p className="text-[30px] leading-none font-bold tracking-tight tabular">{headline.value}</p>
            <p className={`mt-1.5 text-[12px] ${TONE_MUTED[tone]}`}>{headline.label}</p>
          </div>
          {headline.aside}
        </div>
      ) : null}

      <ul className={`space-y-3 ${headline ? "mt-4" : "mt-5"}`}>
        {rows.map((row) => {
          const RowIcon = row.icon;
          return (
            <li key={row.label} className="flex items-center justify-between gap-3 text-[13px]">
              <span className={`flex min-w-0 items-center gap-2.5 ${TONE_MUTED[tone]}`}>
                <RowIcon size={16} className="shrink-0" aria-hidden="true" />
                <span className="truncate">{row.label}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {row.delta ? <DeltaChip delta={{ ...row.delta, label: "" }} tone={tone} /> : null}
                {row.status ? <span className={`size-1.5 rounded-full ${DOT[row.status]}`} aria-hidden="true" /> : null}
                <span className="font-semibold tabular">{row.value}</span>
              </span>
            </li>
          );
        })}
      </ul>

      {footer ? <div className="min-h-5 flex-1" aria-hidden="true" /> : null}
      {footer ? (
        <div className={`flex items-end justify-between gap-3 border-t pt-4 ${TONE_LINE[tone]}`}>
          <div className="min-w-0">
            <p className="truncate text-[18px] font-bold tabular">{footer.from.value}</p>
            <p className={`text-[11px] ${TONE_MUTED[tone]}`}>{footer.from.label}</p>
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1 px-1">
            {footer.note ? <span className="text-[11px] font-semibold text-primary">{footer.note}</span> : null}
            <span className={`h-px w-full border-t border-dashed ${TONE_LINE[tone]}`} aria-hidden="true" />
          </div>
          <div className="min-w-0 text-right">
            <p className="truncate text-[18px] font-bold tabular">{footer.to.value}</p>
            <p className={`text-[11px] ${TONE_MUTED[tone]}`}>{footer.to.label}</p>
          </div>
        </div>
      ) : null}
    </CardFrame>
  );
}
