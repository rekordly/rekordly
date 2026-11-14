"use client";

// The last step of an invoice or quotation: what will be sent, with clear hierarchy.
// Brand green carries the one number that matters (the total); amber marks the
// date the customer must act by; everything else is quiet.

import { CalendarBlank, Clock, Receipt, User } from "@phosphor-icons/react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import type { ReactNode } from "react";

import { formatDate } from "@/lib/format";
import { formatMinorAmount } from "@/lib/money";

import { lineTotal, toMinor, type LineItem } from "@/components/pickers";

export interface ReviewAmounts {
  /** Display-only figures from the form's preview maths, in major units. */
  subtotal: number;
  discount: number;
  tax: number;
  delivery: number;
  total: number;
}

function dueChip(dateText: string, verb: string) {
  if (!dateText) return null;
  const days = differenceInCalendarDays(parseISO(dateText), new Date());
  if (Number.isNaN(days)) return null;
  const label = days < 0 ? `${verb} ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago` : days === 0 ? `${verb} today` : `${verb} in ${days} day${days === 1 ? "" : "s"}`;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-secondary-soft px-2.5 py-1 text-[12px] font-semibold text-secondary-soft-foreground">
      <Clock size={12} weight="bold" aria-hidden="true" />
      {label}
    </span>
  );
}

function Row({ icon: Icon, label, children }: { icon: typeof User; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="flex items-center gap-2 text-[13px] text-muted">
        <Icon size={15} aria-hidden="true" />
        {label}
      </span>
      <span className="min-w-0 truncate text-right text-[13px] font-semibold">{children}</span>
    </div>
  );
}

export function DocumentReview({
  kind,
  currency,
  party,
  issueDate,
  dueDate,
  items,
  amounts,
  terms,
}: {
  kind: "invoice" | "quotation";
  currency: string;
  party: string;
  issueDate: string;
  /** Due date for invoices, expiry date for quotations. */
  dueDate: string;
  items: LineItem[];
  amounts: ReviewAmounts;
  terms?: string;
}) {
  const show = (major: number) => formatMinorAmount(String(Math.round(major * 100)), currency, 2);
  const showMinor = (minor: bigint) => formatMinorAmount(minor.toString(), currency, 2);
  const isInvoice = kind === "invoice";

  return (
    <div className="space-y-4">
      {/* The one number that matters */}
      <section className="animate-fade-up relative overflow-hidden rounded-2xl bg-primary p-5 text-white">
        <span aria-hidden="true" className="pointer-events-none absolute -right-10 -bottom-16 size-44 rounded-full border-[18px] border-white/10" />
        <p className="text-[13px] font-medium text-white/80">{isInvoice ? "Total due" : "Quotation total"}</p>
        <p className="mt-1 text-[30px] leading-tight font-bold tracking-tight tabular">{show(amounts.total)}</p>
        <p className="mt-1 text-[13px] text-white/80">
          {items.length} item{items.length === 1 ? "" : "s"} for {party}
        </p>
      </section>

      {/* Who and when */}
      <section className="rounded-2xl border border-border bg-surface px-4">
        <div className="divide-y divide-separator">
          <Row icon={User} label="Customer">{party}</Row>
          <Row icon={CalendarBlank} label={isInvoice ? "Issued" : "Dated"}>{issueDate ? formatDate(issueDate) : "—"}</Row>
          <div className="flex items-center justify-between gap-3 py-2.5">
            <span className="flex items-center gap-2 text-[13px] text-muted">
              <Clock size={15} aria-hidden="true" />
              {isInvoice ? "Due" : "Valid until"}
            </span>
            <span className="flex items-center gap-2">
              {dueChip(dueDate, isInvoice ? "Due" : "Expires")}
              <span className="text-[13px] font-semibold">{dueDate ? formatDate(dueDate) : "—"}</span>
            </span>
          </div>
        </div>
      </section>

      {/* Items and totals */}
      <section className="rounded-2xl border border-border bg-surface">
        <p className="flex items-center gap-2 px-4 pt-4 text-[13px] font-semibold">
          <Receipt size={15} className="text-muted" aria-hidden="true" />
          Items
        </p>
        <ul className="mt-2 divide-y divide-separator px-4">
          {items.map((item, index) => (
            <li key={`${item.description}-${index}`} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{item.description || "Item"}</span>
                <span className="block text-[12px] text-muted tabular">
                  {item.quantity} × {showMinor(toMinor(item.unit_price))}
                </span>
              </span>
              <span className="shrink-0 text-[13px] font-semibold tabular">{showMinor(lineTotal(item))}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-1 space-y-1.5 border-t border-separator bg-surface-secondary/50 px-4 py-3 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd className="font-medium tabular">{show(amounts.subtotal)}</dd>
          </div>
          {amounts.discount > 0 ? (
            <div className="flex justify-between">
              <dt className="text-muted">Discount</dt>
              <dd className="font-semibold text-primary tabular">−{show(amounts.discount)}</dd>
            </div>
          ) : null}
          {amounts.tax > 0 ? (
            <div className="flex justify-between">
              <dt className="text-muted">Tax</dt>
              <dd className="font-medium tabular">{show(amounts.tax)}</dd>
            </div>
          ) : null}
          {amounts.delivery > 0 ? (
            <div className="flex justify-between">
              <dt className="text-muted">Delivery</dt>
              <dd className="font-medium tabular">{show(amounts.delivery)}</dd>
            </div>
          ) : null}
          <div className="flex items-center justify-between border-t border-separator pt-2">
            <dt className="font-semibold">Total</dt>
            <dd className="text-[15px] font-bold text-primary tabular">{show(amounts.total)}</dd>
          </div>
        </dl>
      </section>

      {terms ? (
        <section className="rounded-2xl border-l-4 border-secondary bg-secondary-soft/60 px-4 py-3 text-[13px]">
          <p className="font-semibold text-secondary-soft-foreground">Terms</p>
          <p className="mt-0.5 text-muted">{terms}</p>
        </section>
      ) : null}
    </div>
  );
}
