"use client";

// 5. Chart card: two or three figures on top, a small trend or column chart below.
// Chart values only position marks; every amount a person reads comes in formatted.

import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { useId, type ReactNode } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { CardFrame, CardHeader, CardSkeleton, TONE_LINE, TONE_MUTED, type CardTone } from "./card-frame";

export interface ChartMetric {
  label: string;
  value: ReactNode;
}

export interface ChartPoint {
  label: string;
  value: number;
  /** Formatted amount for the tooltip or the highlighted column. */
  display?: string;
}

export interface ChartStatCardProps {
  icon?: PhosphorIcon;
  title: string;
  metrics: ChartMetric[];
  data: ChartPoint[];
  variant?: "area" | "columns";
  /** Columns only: the column to emphasise; defaults to the last one. */
  highlightIndex?: number;
  action?: ReactNode;
  footer?: ReactNode;
  tone?: CardTone;
  loading?: boolean;
  className?: string;
  /** Chart height in pixels, or "fill" to take the space left in a stretched card. */
  height?: number | "fill";
}

function strokeFor(tone: CardTone) {
  return tone === "plain" ? "var(--primary)" : tone === "accent" ? "#2a1600" : tone === "ink" ? "var(--ink-foreground)" : "#ffffff";
}

function AreaTrend({ data, tone, height }: { data: ChartPoint[]; tone: CardTone; height: number | string }) {
  const id = useId().replace(/:/g, "");
  const stroke = strokeFor(tone);
  return (
    <div style={{ height }} className="-mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }} interval="preserveStartEnd" />
          <Tooltip
            cursor={{ stroke, strokeOpacity: 0.3 }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as ChartPoint | undefined;
              if (!active || !point) return null;
              return (
                <div className="rounded-lg border border-border bg-overlay px-2.5 py-1.5 text-[12px] text-foreground">
                  <p className="text-muted">{point.label}</p>
                  <p className="font-semibold tabular">{point.display ?? point.value}</p>
                </div>
              );
            }}
          />
          <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={2} fill={`url(#fill-${id})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Columns({ data, tone, height, highlightIndex }: { data: ChartPoint[]; tone: CardTone; height: number | string; highlightIndex: number }) {
  const max = Math.max(...data.map((point) => point.value), 1);
  const idle = tone === "plain" ? "bg-surface-secondary" : tone === "ink" ? "bg-ink-foreground/15" : "bg-white/15";
  const hot = tone === "plain" || tone === "ink" ? "bg-primary" : "bg-white";
  return (
    <div className="flex items-end gap-1.5" style={{ height }} role="list">
      {data.map((point, index) => {
        const isHot = index === highlightIndex;
        return (
          <div key={point.label} role="listitem" className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
            {isHot && point.display ? (
              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap tabular ${tone === "plain" ? "bg-primary-soft text-primary-soft-foreground" : tone === "ink" ? "bg-primary text-white" : "bg-white/20"}`}>
                {point.display}
              </span>
            ) : null}
            <div
              className={`w-full rounded-md ${isHot ? hot : idle}`}
              style={{ height: `${Math.max(6, (point.value / max) * 100)}%` }}
              title={point.display ?? String(point.value)}
            />
            <span className={`text-[10px] ${TONE_MUTED[tone]}`}>{point.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ChartStatCard({
  icon,
  title,
  metrics,
  data,
  variant = "area",
  highlightIndex,
  action,
  footer,
  tone = "plain",
  loading,
  className,
  height = 150,
}: ChartStatCardProps) {
  const fill = height === "fill";
  const chartHeight = fill ? "100%" : height;
  if (loading) return <CardSkeleton className={className} lines={5} />;
  return (
    <CardFrame tone={tone} className={className}>
      <CardHeader icon={icon} title={title} tone={tone} action={action} />
      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0">
            <p className={`text-[12px] ${TONE_MUTED[tone]}`}>{metric.label}</p>
            <p className="mt-0.5 truncate text-[22px] leading-tight font-bold tracking-tight tabular">{metric.value}</p>
          </div>
        ))}
      </div>
      <div className={fill ? "mt-4 flex min-h-[140px] flex-1 flex-col" : "mt-4"}>
        {data.length === 0 ? (
          <div className={`grid place-items-center text-[12px] ${TONE_MUTED[tone]}`} style={{ height: chartHeight }}>
            Nothing recorded in this period yet.
          </div>
        ) : variant === "area" ? (
          <AreaTrend data={data} tone={tone} height={chartHeight} />
        ) : (
          <Columns data={data} tone={tone} height={chartHeight} highlightIndex={highlightIndex ?? data.length - 1} />
        )}
      </div>
      {footer ? <div className={`mt-4 border-t pt-3 text-[12px] ${TONE_LINE[tone]} ${TONE_MUTED[tone]}`}>{footer}</div> : null}
    </CardFrame>
  );
}
