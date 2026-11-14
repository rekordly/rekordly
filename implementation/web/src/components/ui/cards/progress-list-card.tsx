"use client";

// 6. Progress list: rows of name, share, bar and "spent / limit".
// Budgets by category, who owes you most, spend by supplier.

import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { CardFrame, CardHeader, CardSkeleton, TONE_LINE, TONE_MUTED, type CardTone } from "./card-frame";

export interface ProgressItem {
  key: string;
  label: string;
  icon?: PhosphorIcon;
  /** 0 to 1; over 1 shows as full and turns red (e.g. an overspent budget). */
  progress: number;
  /** e.g. "₦7,200 / ₦10,000". */
  detail?: ReactNode;
  href?: string;
}

export interface ProgressListCardProps {
  icon?: PhosphorIcon;
  title: string;
  items: ProgressItem[];
  action?: ReactNode;
  empty?: ReactNode;
  tone?: Extract<CardTone, "plain" | "ink">;
  /** "limit": bars turn amber near 85% and red past 100% (budgets). "share": one colour (parts of a whole). */
  meaning?: "limit" | "share";
  loading?: boolean;
  className?: string;
}

export function ProgressListCard({ icon, title, items, action, empty, tone = "plain", meaning = "limit", loading, className }: ProgressListCardProps) {
  if (loading) return <CardSkeleton className={className} lines={5} />;
  const track = tone === "plain" ? "bg-surface-secondary" : "bg-ink-foreground/10";
  const row = tone === "plain" ? "bg-surface-secondary/60" : "bg-ink-foreground/5";

  return (
    <CardFrame tone={tone} className={className}>
      <CardHeader icon={icon} title={title} tone={tone} action={action} />
      {items.length === 0 ? (
        <p className={`mt-6 text-[13px] ${TONE_MUTED[tone]}`}>{empty ?? "Nothing to show yet."}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => {
            const ItemIcon = item.icon;
            const over = meaning === "limit" && item.progress > 1;
            const percent = Math.round(item.progress * 100);
            const fill = meaning === "share" ? "bg-primary" : over ? "bg-danger" : item.progress >= 0.85 ? "bg-secondary" : "bg-primary";
            return (
              <li key={item.key} className={`rounded-xl border px-3 py-2.5 ${row} ${TONE_LINE[tone]}`}>
                <div className="flex items-center gap-2.5">
                  {ItemIcon ? <ItemIcon size={16} className="shrink-0 opacity-80" aria-hidden="true" /> : null}
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{item.label}</span>
                  {item.detail ? <span className={`shrink-0 text-[12px] tabular ${TONE_MUTED[tone]}`}>{item.detail}</span> : null}
                  <span className={`w-10 shrink-0 text-right text-[12px] font-semibold tabular ${over ? "text-danger" : ""}`}>{percent}%</span>
                </div>
                <span className={`mt-2 block h-1.5 overflow-hidden rounded-full ${track}`}>
                  <span className={`block h-full rounded-full ${fill}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </CardFrame>
  );
}
