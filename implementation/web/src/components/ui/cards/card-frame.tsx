"use client";

// Shared pieces for the stat card family. Every card uses the same frame,
// header and change chip so they read as one set on any page.
// Amounts arrive already formatted: cards never do money maths.

import { ArrowDownRight, ArrowUpRight, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import Link from "next/link";
import type { ReactNode } from "react";

/** plain: white or dark surface. brand: Rekordly green. accent: amber. ink: near-black. Use at most one bold tone per row. */
export type CardTone = "plain" | "brand" | "accent" | "ink";

export const TONE_FRAME: Record<CardTone, string> = {
  plain: "border border-border bg-surface text-foreground",
  brand: "bg-primary text-white",
  accent: "bg-secondary text-[#2a1600]",
  ink: "bg-ink text-ink-foreground",
};

/** Secondary text on each tone. */
export const TONE_MUTED: Record<CardTone, string> = {
  plain: "text-muted",
  brand: "text-white/75",
  accent: "text-[#2a1600]/70",
  ink: "text-ink-muted",
};

/** Small icon tile and hairlines on each tone. */
export const TONE_TILE: Record<CardTone, string> = {
  plain: "border border-border bg-surface-secondary text-foreground",
  brand: "bg-white/15 text-white",
  accent: "bg-black/10 text-[#2a1600]",
  ink: "bg-ink-foreground/10 text-primary",
};

export const TONE_LINE: Record<CardTone, string> = {
  plain: "border-separator",
  brand: "border-white/20",
  accent: "border-black/10",
  ink: "border-ink-line",
};

export function CardFrame({
  tone = "plain",
  className = "",
  href,
  children,
}: {
  tone?: CardTone;
  className?: string;
  /** Makes the whole card a link to its detail page. */
  href?: string;
  children: ReactNode;
}) {
  const classes = `relative flex flex-col overflow-hidden rounded-2xl p-5 ${TONE_FRAME[tone]} ${className}`;
  if (href) {
    return (
      <Link href={href} className={`${classes} transition-transform hover:-translate-y-0.5`}>
        {children}
      </Link>
    );
  }
  return <section className={classes}>{children}</section>;
}

export function CardHeader({
  icon: Icon,
  title,
  tone = "plain",
  action,
}: {
  icon?: PhosphorIcon;
  title: ReactNode;
  tone?: CardTone;
  /** A period select, an arrow link or an icon button. */
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon ? (
          <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${TONE_TILE[tone]}`}>
            <Icon size={16} aria-hidden="true" />
          </span>
        ) : null}
        <h3 className="truncate text-[14px] font-semibold">{title}</h3>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export interface Delta {
  /** Percentage change against the previous period of the same length, e.g. 8.2 or -5.3. */
  percent: number;
  /** Defaults to "vs last month". */
  label?: string;
  /** Expenses improve when they go down. */
  goodWhen?: "up" | "down";
}

export function DeltaChip({ delta, tone = "plain" }: { delta: Delta; tone?: CardTone }) {
  const rising = delta.percent >= 0;
  const good = (delta.goodWhen ?? "up") === "up" ? rising : !rising;
  const Arrow = rising ? ArrowUpRight : ArrowDownRight;
  const onColour = tone === "brand" || tone === "accent";
  const chip = onColour
    ? "bg-white/20 text-current"
    : good
      ? "bg-primary-soft text-primary-soft-foreground"
      : "bg-danger/10 text-danger";

  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px]">
      <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold tabular ${chip}`}>
        <Arrow size={12} weight="bold" aria-hidden="true" />
        {rising ? "+" : ""}
        {delta.percent.toFixed(1)}%
      </span>
      <span className={TONE_MUTED[tone]}>{delta.label ?? "vs last month"}</span>
    </span>
  );
}

/** Round button in a card's corner, as in the reference cards. */
export function CardCornerLink({ href, label, tone = "plain" }: { href: string; label: string; tone?: CardTone }) {
  const look =
    tone === "plain"
      ? "border border-border bg-surface text-foreground hover:bg-surface-secondary"
      : tone === "ink"
        ? "bg-ink-foreground text-ink hover:opacity-90"
        : "bg-white text-neutral-900 hover:opacity-90";
  return (
    <Link href={href} aria-label={label} className={`grid size-9 place-items-center rounded-full transition ${look}`}>
      <ArrowUpRight size={16} weight="bold" aria-hidden="true" />
    </Link>
  );
}

export function CardSkeleton({ className = "", lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={`rounded-2xl border border-border bg-surface p-5 ${className}`} aria-busy="true" aria-label="Loading">
      <div className="flex items-center gap-2.5">
        <div className="size-8 animate-pulse rounded-lg bg-default" />
        <div className="h-3.5 w-24 animate-pulse rounded bg-default" />
      </div>
      <div className="mt-5 h-7 w-36 animate-pulse rounded bg-default" />
      {Array.from({ length: lines - 1 }).map((_, index) => (
        <div key={index} className="mt-3 h-3 w-full max-w-[220px] animate-pulse rounded bg-default" />
      ))}
    </div>
  );
}
