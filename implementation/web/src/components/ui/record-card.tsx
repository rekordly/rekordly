"use client";

// The legacy Rekordly item card (sale, invoice, expense…) as one reusable shape.

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
}

export function RecordCard({ icon, iconClassName = "bg-default text-foreground", reference, title, amount, status, meta = [], actions }: RecordCardProps) {
  return (
    <article className="flex flex-col rounded-3xl bg-surface p-4">
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

      {meta.length > 0 || actions ? (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-separator pt-3">
          <div className="flex min-w-0 flex-1 gap-4">
            {meta.map((item) => (
              <div key={item.label} className="min-w-0">
                <p className="text-[11px] font-medium text-muted">{item.label}</p>
                <p className="truncate text-xs font-medium text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
          {actions}
        </div>
      ) : null}
    </article>
  );
}
