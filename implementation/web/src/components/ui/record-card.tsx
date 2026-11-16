"use client";

// The legacy Rekordly item card (sale, invoice, expense…) as one reusable shape.

import { Eye } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export interface RecordCardMeta {
  label: string;
  value: ReactNode;
}

export interface RecordCardProps {
  icon: ReactNode;
  iconClassName?: string;
  reference?: ReactNode;
  title: ReactNode;
  amount: ReactNode;
  status?: ReactNode;
  meta?: RecordCardMeta[];
  actions?: ReactNode;
  onView?: () => void;
}

export function RecordCard({
  icon,
  iconClassName = "bg-default text-foreground",
  reference,
  title,
  amount,
  status,
  meta = [],
  actions,
  onView,
}: RecordCardProps) {
  return (
    <article className="flex flex-col rounded-3xl border border-border/60 bg-surface p-4 transition-colors hover:border-border">
      <div className="flex items-start gap-3">
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${iconClassName}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          {reference ? <p className="truncate text-[11px] font-medium text-muted">{reference}</p> : null}
          <h3 className="line-clamp-2 text-[13px] leading-tight font-semibold text-foreground">{title}</h3>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="tabular truncate text-[17px] font-bold text-foreground">{amount}</p>
        {status}
      </div>

      {meta.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-separator pt-3">
          {meta.map((item) => (
            <div key={item.label} className="min-w-0">
              <p className="text-[11px] font-medium text-muted">{item.label}</p>
              <p className="truncate text-xs font-medium text-foreground">{item.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {onView || actions ? (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-separator pt-2.5">
          {onView ? (
            <button
              type="button"
              onClick={onView}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 -ml-2 text-xs font-semibold text-primary transition-colors hover:bg-primary-soft/50"
            >
              <Eye size={15} weight="duotone" aria-hidden="true" />
              <span>View</span>
            </button>
          ) : (
            <span />
          )}
          {actions}
        </div>
      ) : null}
    </article>
  );
}
