"use client";

// The legacy revenue and category charts on recharts, using theme tokens.
// Numbers here only position marks; every amount a person reads is formatted
// from the exact server string.

import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatMinorAmount } from "@/lib/money";

const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--primary-hover)", "var(--secondary-hover)", "var(--muted)"];

function compactMajor(minor: number, exponent: number): string {
  return new Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 1 }).format(minor / 10 ** exponent);
}

function ChartEmpty({ message, height }: { message: string; height: number }) {
  return (
    <div className="flex items-center justify-center" style={{ height }}>
      <p className="text-[13px] text-muted">{message}</p>
    </div>
  );
}

export interface RevenuePoint {
  label: string;
  income_minor: string;
  expense_minor: string;
}

interface TooltipEntry {
  dataKey?: string | number;
  name?: string | number;
  color?: string;
  payload?: Record<string, string>;
}

export function RevenueChart({ data, currency, exponent }: { data: RevenuePoint[]; currency: string; exponent: number }) {
  if (data.length === 0) return <ChartEmpty message="Your income and expenses will chart here." height={280} />;

  const points = data.map((point) => ({
    ...point,
    Income: Number(point.income_minor),
    Expenses: Number(point.expense_minor),
  }));

  return (
    <ResponsiveContainer height={280} width="100%">
      <AreaChart data={points} margin={{ left: 0, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="fillIncome" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="fillExpenses" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--separator)" vertical={false} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={11} stroke="var(--muted)" />
        <YAxis
          axisLine={false}
          tickLine={false}
          fontSize={11}
          width={44}
          stroke="var(--muted)"
          tickFormatter={(value: number) => compactMajor(value, exponent)}
        />
        <Tooltip
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <div className="rounded-xl border border-border bg-overlay px-3 py-2 text-xs">
                <p className="mb-1 font-medium text-foreground">{label}</p>
                {(payload as TooltipEntry[]).map((entry) => {
                  const raw = entry.dataKey === "Income" ? entry.payload?.income_minor : entry.payload?.expense_minor;
                  return (
                    <p key={String(entry.dataKey)} className="tabular text-muted">
                      <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: entry.color }} />
                      {entry.name}: <span className="text-foreground">{formatMinorAmount(raw ?? "0", currency, exponent)}</span>
                    </p>
                  );
                })}
              </div>
            ) : null
          }
        />
        <Area dataKey="Income" type="monotone" stroke="var(--chart-1)" strokeWidth={2} fill="url(#fillIncome)" />
        <Area dataKey="Expenses" type="monotone" stroke="var(--chart-2)" strokeWidth={2} fill="url(#fillExpenses)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CategoryPieChart({
  data,
  currency,
  exponent,
}: {
  data: { category: string; total_minor: string }[];
  currency: string;
  exponent: number;
}) {
  if (data.length === 0) return <ChartEmpty message="Spending by category will show here." height={200} />;

  const slices = data.map((item) => ({ ...item, value: Number(item.total_minor) }));

  return (
    <div>
      <ResponsiveContainer height={200} width="100%">
        <PieChart>
          <Pie data={slices} dataKey="value" nameKey="category" innerRadius={58} outerRadius={84} paddingAngle={2} stroke="none">
            {slices.map((slice, index) => (
              <Cell key={slice.category} fill={SERIES_COLORS[index % SERIES_COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <ul className="mt-3 space-y-2">
        {slices.map((slice, index) => (
          <li key={slice.category} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="flex min-w-0 items-center gap-2 text-muted">
              <span className="size-2 shrink-0 rounded-full" style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }} />
              <span className="truncate">{slice.category}</span>
            </span>
            <span className="tabular shrink-0 font-medium text-foreground">
              {formatMinorAmount(slice.total_minor, currency, exponent)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
