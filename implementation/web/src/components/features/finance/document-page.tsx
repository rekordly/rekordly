"use client";

// The shared layout for one document (purchase, request, order, receipt, bill).
//
//   <DocumentShell back={{ href: "/bills", label: "Bills" }} title="INV-204" subtitle="From Dangote"
//     status={<StatusBadge status="approved" />} actions={…}
//     kpis={<><KpiCard …/>…</>} aside={<><StatusTimeline steps={…} /><DetailsPanel>…</DetailsPanel><LinkedDocuments …/></>}>
//     <DocumentTabs tabs={[{ key: "items", label: "Items", content: <ItemsTable …/> }]} />
//   </DocumentShell>
//
// Header → key figures → [tabs (8) | status timeline, details, linked documents (4)].
// Phones stack everything.

import { ArrowLeft, ArrowRight, Check, Package, Receipt, ShoppingCart, ClipboardText, HandCoins, ArrowUUpLeft, FileText } from "@phosphor-icons/react";
import Link from "next/link";
import { Children, Fragment, isValidElement, useState, type ReactElement, type ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { AppRowActions, type ActionMenuItem } from "@/components/ui/app-row-actions";
import { Page, Segmented } from "@/components/ui/page";
import { KpiRow } from "@/components/features/finance/dashboard-parts";
import { formatDate } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* Shell                                                                       */
/* -------------------------------------------------------------------------- */

export function DocumentShell({
  back,
  title,
  subtitle,
  status,
  actions,
  kpis,
  banner,
  aside,
  children,
}: {
  back: { href: string; label: string };
  title: string;
  subtitle?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  /** Three or four KpiCards: the figures that matter most for this document. */
  kpis?: ReactNode;
  banner?: ReactNode;
  aside: ReactNode;
  children: ReactNode;
}) {
  return (
    <Page>
      <div className="pt-2">
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-foreground">
          <ArrowLeft size={13} weight="bold" aria-hidden="true" />
          {back.label}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 truncate text-[24px] leading-tight font-bold tracking-[-0.02em]">{title}</h1>
              {status}
            </div>
            {subtitle ? <p className="mt-1 text-[14px] text-muted">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </div>
      {kpis ? <KpiRow className="lg:grid-cols-4">{Children.toArray(isValidElement(kpis) && kpis.type === Fragment ? (kpis as ReactElement<{ children: ReactNode }>).props.children : kpis)}</KpiRow> : null}
      {banner}
      <div className="grid items-start gap-5 lg:grid-cols-12">
        <div className="min-w-0 space-y-5 lg:col-span-8">{children}</div>
        <div className="min-w-0 space-y-5 lg:col-span-4">{aside}</div>
      </div>
    </Page>
  );
}

/** One primary button, everything else behind the three-dot menu. */
export function DocumentActions({ primary, more = [] }: { primary?: ReactNode; more?: (ActionMenuItem | false | null | undefined)[] }) {
  const items = more.filter(Boolean) as ActionMenuItem[];
  return (
    <>
      {primary}
      {items.length ? <AppRowActions ariaLabel="More actions" size="md" className="border border-border bg-surface" items={items} /> : null}
    </>
  );
}

export function DocumentSkeleton() {
  return (
    <Page>
      <div className="space-y-2 pt-2">
        <div className="h-4 w-24 animate-pulse rounded bg-default" />
        <div className="h-8 w-64 animate-pulse rounded-lg bg-default" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-32 animate-pulse rounded-2xl bg-default" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="h-96 animate-pulse rounded-2xl bg-default lg:col-span-8" />
        <div className="h-72 animate-pulse rounded-2xl bg-default lg:col-span-4" />
      </div>
    </Page>
  );
}

export function DocumentError({ back, message }: { back: { href: string; label: string }; message: string }) {
  return (
    <Page>
      <Alert status="error" description={message} />
      <Link href={back.href} className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-primary hover:underline">
        <ArrowLeft size={14} weight="bold" aria-hidden="true" />
        Back to {back.label.toLowerCase()}
      </Link>
    </Page>
  );
}

/* -------------------------------------------------------------------------- */
/* Progress: Request ✓ → Order ✓ → Received ● → Billed → Paid                  */
/* -------------------------------------------------------------------------- */

export type StepState = "done" | "current" | "todo" | "skipped";
export interface DocumentStep {
  key: string;
  label: string;
  state: StepState;
  hint?: string;
  /** When it happened (or is due). */
  date?: string | null;
  href?: string;
}

/** The document's journey as a timeline: what happened, when, and what comes next. */
export function StatusTimeline({ steps, title = "Status" }: { steps: DocumentStep[]; title?: string }) {
  return (
    <section className="animate-fade-up rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <ol className="mt-3">
        {steps.map((step, index) => {
          const done = step.state === "done";
          const current = step.state === "current";
          const skipped = step.state === "skipped";
          const last = index === steps.length - 1;
          const label = (
            <span className={`text-[14px] ${done || current ? "font-semibold text-foreground" : "text-muted"} ${skipped ? "line-through" : ""}`}>{step.label}</span>
          );
          return (
            <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0" aria-current={current ? "step" : undefined}>
              {!last ? <span aria-hidden="true" className={`absolute top-6 bottom-0 left-[9px] w-0.5 ${done ? "bg-primary" : "bg-default"}`} /> : null}
              <span
                className={`relative z-10 mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${
                  done ? "bg-primary text-primary-foreground" : current ? "bg-surface ring-2 ring-primary" : "bg-default"
                }`}
              >
                {done ? <Check size={11} weight="bold" aria-hidden="true" /> : current ? <span className="size-2 rounded-full bg-primary" /> : null}
              </span>
              <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                <div className="min-w-0">
                  {step.href ? (
                    <Link href={step.href} className="hover:text-primary hover:underline">
                      {label}
                    </Link>
                  ) : (
                    label
                  )}
                  {step.hint ? <p className="text-[12px] text-muted">{step.hint}</p> : null}
                </div>
                <span className={`shrink-0 text-[12px] tabular ${current && !step.date ? "font-medium text-primary" : "text-muted"}`}>
                  {step.date ? formatDate(step.date) : current ? "Next" : ""}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Summary: big amount, paid bar, then label/value rows                        */
/* -------------------------------------------------------------------------- */

export function DetailsPanel({ title = "Details", action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="animate-fade-up rounded-2xl border border-border bg-surface px-5 pt-4 pb-2">
      <div className="flex items-center justify-between gap-3"><h2 className="text-[15px] font-semibold">{title}</h2>{action}</div>
      <dl className="mt-1">{children}</dl>
    </section>
  );
}

export function SummaryRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-separator py-2.5 text-[13px] last:border-b-0">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium break-words">{children}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Linked documents                                                            */
/* -------------------------------------------------------------------------- */

export type LinkedKind = "request" | "order" | "receipt" | "bill" | "payment" | "return" | "purchase";
const KIND_ICON: Record<LinkedKind, typeof Package> = {
  request: ClipboardText,
  order: FileText,
  receipt: Package,
  bill: Receipt,
  payment: HandCoins,
  return: ArrowUUpLeft,
  purchase: ShoppingCart,
};

export interface LinkedDocument {
  key: string;
  kind: LinkedKind;
  label: string;
  sub?: string;
  href?: string;
  status?: ReactNode;
}

export function LinkedDocuments({ items, empty }: { items: LinkedDocument[]; empty?: string }) {
  if (!items.length && !empty) return null;
  return (
    <section className="animate-fade-up rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-[15px] font-semibold">Linked documents</h2>
      {items.length ? (
        <ul className="mt-2 divide-y divide-separator">
          {items.map((item) => {
            const Icon = KIND_ICON[item.kind];
            const body = (
              <>
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-secondary text-muted">
                  <Icon size={17} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{item.label}</span>
                  {item.sub ? <span className="block truncate text-[12px] text-muted">{item.sub}</span> : null}
                </span>
                {item.status}
                {item.href ? <ArrowRight size={14} className="shrink-0 text-muted" aria-hidden="true" /> : null}
              </>
            );
            return (
              <li key={item.key}>
                {item.href ? (
                  <Link href={item.href} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-secondary">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 py-2.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-[13px] text-muted">{empty}</p>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Tabs                                                                        */
/* -------------------------------------------------------------------------- */

export interface DocumentTab {
  key: string;
  label: string;
  count?: number;
  action?: ReactNode;
  content: ReactNode;
}

export function DocumentTabs({ tabs }: { tabs: DocumentTab[] }) {
  const visible = tabs.filter(Boolean);
  const [active, setActive] = useState(visible[0]?.key ?? "");
  const tab = visible.find((item) => item.key === active) ?? visible[0];
  if (!tab) return null;
  return (
    <section className="animate-fade-up rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
        {visible.length > 1 ? (
          <Segmented
            size="sm"
            aria-label="Sections"
            options={visible.map((item) => ({ key: item.key, label: item.count ? `${item.label} · ${item.count}` : item.label }))}
            value={tab.key}
            onChange={setActive}
          />
        ) : (
          <h2 className="text-[15px] font-semibold">{tab.label}</h2>
        )}
        {tab.action}
      </div>
      <div className="px-5 pt-2 pb-5">{tab.content}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Lines and activity                                                          */
/* -------------------------------------------------------------------------- */

export interface LineRow {
  key: string | number;
  title: ReactNode;
  /** "3 × NGN 1,500" */
  sub?: ReactNode;
  amount: ReactNode;
  /** Extra line under the row: a variance note, a received bar… */
  extra?: ReactNode;
  action?: ReactNode;
}

export function LineList({ rows, total, empty = "No items." }: { rows: LineRow[]; total?: { label: string; amount: ReactNode }; empty?: string }) {
  if (!rows.length) return <p className="py-2 text-[13px] text-muted">{empty}</p>;
  return (
    <div>
      <ul className="divide-y divide-separator">
        {rows.map((row) => (
          <li key={row.key} className="py-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">{row.title}</div>
                {row.sub ? <div className="text-[12px] text-muted tabular">{row.sub}</div> : null}
              </div>
              <div className="shrink-0 text-right text-[14px] font-semibold tabular">{row.amount}</div>
              {row.action}
            </div>
            {row.extra ? <div className="mt-2">{row.extra}</div> : null}
          </li>
        ))}
      </ul>
      {total ? (
        <div className="flex items-center justify-between border-t border-separator pt-3 text-[14px]">
          <span className="font-semibold">{total.label}</span>
          <span className="text-[16px] font-bold tabular">{total.amount}</span>
        </div>
      ) : null}
    </div>
  );
}

export interface ItemColumn<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
}

export function ItemsTable<T>({
  rows,
  rowKey,
  columns,
  card,
  total,
  empty = "No items.",
}: {
  rows: T[];
  rowKey: (row: T) => string | number;
  columns: ItemColumn<T>[];
  /** The phone layout of one row. */
  card: (row: T) => Omit<LineRow, "key">;
  total?: { label: string; amount: ReactNode };
  empty?: string;
}) {
  if (!rows.length) return <p className="py-2 text-[13px] text-muted">{empty}</p>;
  return (
    <>
      <div className="md:hidden">
        <LineList rows={rows.map((row) => ({ key: rowKey(row), ...card(row) }))} total={total} />
      </div>
      <table className="hidden w-full text-[13px] md:table">
        <thead>
          <tr className="border-b border-separator text-[12px] text-muted">
            {columns.map((column) => (
              <th key={column.key} className={`py-2.5 font-medium first:pl-0 last:pr-0 px-3 ${column.align === "right" ? "text-right" : "text-left"}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-separator">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="align-top">
              {columns.map((column) => (
                <td key={column.key} className={`px-3 py-3 first:pl-0 last:pr-0 ${column.align === "right" ? "text-right tabular" : ""}`}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {total ? (
          <tfoot>
            <tr className="border-t border-separator">
              <td colSpan={columns.length - 1} className="pt-3 text-[14px] font-semibold">
                {total.label}
              </td>
              <td className="pt-3 text-right text-[16px] font-bold tabular">{total.amount}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </>
  );
}

/** "80 of 100 received" with a thin bar. */
export function QuantityBar({ label, done, of, tone = "primary" }: { label: string; done: number; of: number; tone?: "primary" | "warning" }) {
  const percent = of > 0 ? Math.min(100, Math.round((done / of) * 100)) : 0;
  return (
    <div className="flex items-center gap-2 text-[12px] text-muted tabular">
      <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-default">
        <span className={`block h-full rounded-full ${tone === "warning" ? "bg-warning" : "bg-primary"}`} style={{ width: `${percent}%` }} />
      </span>
      <span>
        {trimQty(done)} of {trimQty(of)} {label}
      </span>
    </div>
  );
}

export interface ActivityItem {
  key: string;
  title: string;
  subtitle?: string;
  date: string;
  amount?: string;
  href?: string;
  tone?: "primary" | "danger" | "muted";
}

export function ActivityList({ items, empty = "Nothing has happened yet." }: { items: ActivityItem[]; empty?: string }) {
  if (!items.length) return <p className="py-2 text-[13px] text-muted">{empty}</p>;
  return (
    <ol className="relative mt-2 ml-1.5 space-y-4 border-l border-separator pl-5">
      {items.map((item) => (
        <li key={item.key} className="relative text-[13px]">
          <span
            aria-hidden="true"
            className={`absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-surface ${item.tone === "danger" ? "bg-danger" : item.tone === "muted" ? "bg-muted" : "bg-primary"}`}
          />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {item.href ? (
                <Link href={item.href} className="font-semibold hover:text-primary hover:underline">
                  {item.title}
                </Link>
              ) : (
                <p className="font-semibold">{item.title}</p>
              )}
              {item.subtitle ? <p className="text-[12px] break-words text-muted">{item.subtitle}</p> : null}
            </div>
            <div className="shrink-0 text-right">
              {item.amount ? <p className="font-semibold tabular">{item.amount}</p> : null}
              <p className="text-[11px] text-muted">{formatDate(item.date)}</p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Activity as its own card under the items. */
export function ActivityCard({ items, empty }: { items: ActivityItem[]; empty?: string }) {
  return (
    <section className="animate-fade-up rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-[15px] font-semibold">Activity</h2>
      <ActivityList items={items} empty={empty} />
    </section>
  );
}

/** "12.0000" → "12". */
export function trimQty(value: string | number) {
  return String(Math.round(Number(value || 0) * 10000) / 10000);
}

/** Minor units → plain major decimal string for inputs ("" for zero or less). */
export function minorToInput(minor: string | number | bigint | null | undefined, exponent = 2): string {
  const value = BigInt(minor || 0);
  if (value <= BigInt(0)) return "";
  if (exponent === 0) return value.toString();
  const base = BigInt(10) ** BigInt(exponent);
  return `${value / base}.${(value % base).toString().padStart(exponent, "0")}`;
}

/** Days from today to a date (negative when past). */
export function daysUntil(date: string) {
  const target = new Date(`${date.slice(0, 10)}T00:00:00Z`).getTime();
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((target - today) / 86_400_000);
}
