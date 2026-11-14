"use client";

// 8. Cash flow: income vs expenses over time. Two figures in a box on top,
// two lines below, and a tooltip with the month's figures and the change from the month before.
// Values only position the lines; the amounts people read arrive formatted.

import { ArrowDownLeft, ArrowUpRight, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { useId, type ReactNode } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { CardFrame, CardHeader, CardSkeleton } from "./card-frame";

export interface CashFlowPoint {
  label: string;
  income: number;
  expense: number;
  incomeDisplay: string;
  expenseDisplay: string;
}

export interface CashFlowCardProps {
  title?: string;
  icon?: PhosphorIcon;
  income: { label?: string; value: ReactNode };
  expenses: { label?: string; value: ReactNode };
  data: CashFlowPoint[];
  /** Short axis labels, e.g. ₦5k. */
  formatAxis?: (value: number) => string;
  action?: ReactNode;
  loading?: boolean;
  className?: string;
  height?: number;
  empty?: ReactNode;
}

function percentChange(now: number, before: number): number | null {
  if (!before) return null;
  return ((now - before) / Math.abs(before)) * 100;
}

function Figure({ icon: Icon, tile, label, value }: { icon: PhosphorIcon; tile: string; label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className={`grid size-9 shrink-0 place-items-center rounded-full ${tile}`}>
        <Icon size={16} weight="bold" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[12px] text-muted">{label}</p>
        <p className="truncate text-[17px] font-bold tabular">{value}</p>
      </div>
    </div>
  );
}

export function CashFlowCard({
  title = "Cash flow",
  icon,
  income,
  expenses,
  data,
  formatAxis,
  action,
  loading,
  className,
  height = 240,
  empty = "Your income and expenses will chart here.",
}: CashFlowCardProps) {
  const id = useId().replace(/:/g, "");
  if (loading) return <CardSkeleton className={className} lines={6} />;
  const hasData = data.some((point) => point.income !== 0 || point.expense !== 0);

  return (
    <CardFrame className={className}>
      <CardHeader icon={icon} title={title} action={action} />

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-border p-3 sm:p-4">
        <Figure icon={ArrowDownLeft} tile="bg-primary-soft text-primary-soft-foreground" label={income.label ?? "Income"} value={income.value} />
        <div className="border-l border-border pl-3 sm:pl-4">
          <Figure icon={ArrowUpRight} tile="bg-foreground text-background" label={expenses.label ?? "Expenses"} value={expenses.value} />
        </div>
      </div>

      {hasData ? (
        <div className="mt-4 -mb-1" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`income-${id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical horizontal={false} stroke="var(--separator)" strokeDasharray="4 4" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={11} stroke="var(--muted)" />
              <YAxis axisLine={false} tickLine={false} fontSize={11} width={44} stroke="var(--muted)" tickFormatter={formatAxis} />
              <Tooltip
                cursor={{ stroke: "var(--primary)", strokeDasharray: "4 4" }}
                content={({ active, payload }) => {
                  const point = payload?.[0]?.payload as CashFlowPoint | undefined;
                  if (!active || !point) return null;
                  const index = data.indexOf(point);
                  const before = index > 0 ? data[index - 1] : undefined;
                  const delta = before ? percentChange(point.income, before.income) : null;
                  return (
                    <div className="rounded-xl border border-border bg-overlay px-3.5 py-3 text-foreground shadow-sm">
                      <p className="text-[13px] text-muted">{point.label}</p>
                      <p className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-[20px] leading-tight font-bold tabular">{point.incomeDisplay}</span>
                        {delta !== null ? (
                          <span className={`text-[11px] font-semibold tabular ${delta >= 0 ? "text-primary" : "text-danger"}`}>
                            {delta >= 0 ? "↑" : "↓"}
                            {Math.abs(delta).toFixed(1)}%
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-[12px] text-muted">
                        {before ? `Compared to ${before.incomeDisplay} last month` : "First month in view"}
                      </p>
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="income" stroke="none" fill={`url(#income-${id})`} />
              <Line type="monotone" dataKey="income" name="Income" stroke="var(--primary)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: "var(--primary)", stroke: "var(--surface)", strokeWidth: 2 }} />
              <Line type="monotone" dataKey="expense" name="Expenses" stroke="var(--foreground)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "var(--foreground)", stroke: "var(--surface)", strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-4 grid place-items-center text-[13px] text-muted" style={{ height }}>
          {empty}
        </div>
      )}
    </CardFrame>
  );
}
