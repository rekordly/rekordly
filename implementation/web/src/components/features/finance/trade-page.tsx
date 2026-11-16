"use client";

// Sales and purchases lists. Recording happens on its own page (/sales/new, /purchases/new).

import { HandCoins, Plus, Receipt, ShoppingCart } from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppRowActions } from "@/components/ui/app-row-actions";
import { DataView } from "@/components/ui/data-view";
import { EmptyState, Page, PageHeader } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { formatDate } from "@/lib/format";
import type { Purchase, Sale } from "@/types/finance";

import { PageStats } from "./page-stats";
import { PaymentDrawer, type PaymentPreset } from "./payment-drawer";
import { money, StatusBadge, useRecords, WorkspaceGate, type WorkspaceInfo } from "./shared";

type Kind = "sale" | "purchase";

interface TradeRow {
  id: number;
  party: string;
  date: string;
  total: Sale["total_amount_minor"];
  paid: Sale["paid_amount_minor"];
  currency: string;
  currency_exponent: number;
  status: string;
  source?: string;
  reference?: string | null;
}

function toRow(record: Sale | Purchase): TradeRow {
  const isSale = "sale_date" in record;
  return {
    id: record.id,
    party: isSale ? record.customer_name : record.supplier_name,
    date: isSale ? record.sale_date : record.purchase_date,
    total: record.total_amount_minor,
    paid: record.paid_amount_minor,
    currency: record.currency,
    currency_exponent: record.currency_exponent,
    status: record.status,
    source: isSale ? record.source : undefined,
    reference: record.reference,
  };
}

const COPY = {
  sale: {
    title: "Sales",
    description: "What you have sold, and what has been paid.",
    add: "Record sale",
    newHref: "/sales/new",
    party: "Customer",
    emptyTitle: "No sales yet",
    emptyBody: "Record a sale to start tracking what customers owe you.",
  },
  purchase: {
    title: "Purchases",
    description: "What you have bought, and what you still owe.",
    add: "Record purchase",
    newHref: "/purchases/new",
    party: "Supplier",
    emptyTitle: "No purchases yet",
    emptyBody: "Record a purchase to track what you owe suppliers.",
  },
} as const;

function TradeContent({ workspaceId, currency, kind, startOpen }: WorkspaceInfo & { kind: Kind; startOpen: boolean }) {
  const copy = COPY[kind];
  const router = useRouter();
  const searchParams = useSearchParams();
  const [payment, setPayment] = useState<PaymentPreset | undefined>();
  const [source, setSource] = useState(searchParams.get("source") ?? "");
  const records = useRecords<Sale | Purchase>(kind === "sale" ? "sales" : "purchases", workspaceId, source ? { source } : {});

  // Old links that asked for the form to open now go to the form page.
  useEffect(() => {
    if (startOpen) router.replace(copy.newHref);
  }, [copy.newHref, router, startOpen]);

  const openPayment = (row: TradeRow) =>
    setPayment({
      direction: kind === "sale" ? "incoming" : "outgoing",
      linkedType: kind,
      linkedId: row.id,
      partyName: row.party,
      summary: `${row.party}: ${money(row.paid, row)} paid of ${money(row.total, row)}.`,
    });

  const actions = (row: TradeRow) => (
    <AppRowActions
      ariaLabel={`${copy.party} actions`}
      items={[
        ...(kind === "purchase"
          ? [
              {
                key: "open",
                label: "Open details",
                icon: <Receipt size={16} aria-hidden="true" />,
                onClick: () => router.push(`/purchases/${row.id}`),
              },
            ]
          : []),
        {
          key: "payment",
          label: kind === "sale" ? "Record payment" : "Pay supplier",
          icon: <HandCoins size={16} aria-hidden="true" />,
          disabled: row.status === "paid" || row.status === "cancelled",
          onClick: () => openPayment(row),
        },
      ]}
    />
  );

  const addButton = <AppButton startContent={<Plus weight="bold" />} label={copy.add} onPress={() => router.push(copy.newHref)} />;

  return (
    <Page>
      <PageHeader title={copy.title} description={copy.description} actions={addButton} />
      <PageStats kind={kind === "sale" ? "sales" : "purchases"} workspaceId={workspaceId} currency={currency} />
      <DataView<TradeRow>
        title={copy.title}
        rows={records.rows.map(toRow)}
        rowKey={(row) => row.id}
        isLoading={records.isPending}
        isError={records.isError}
        server={records.controls}
        onRowClick={kind === "purchase" ? (row) => router.push(`/purchases/${row.id}`) : undefined}
        searchPlaceholder={`Search ${copy.party.toLowerCase()} or reference`}
        filters={kind === "sale" ? <select aria-label="Sale source" value={source} onChange={(event) => setSource(event.target.value)} className="h-9 rounded-lg border border-border bg-surface px-2 text-sm"><option value="">All sources</option><option value="in_person">In person</option><option value="online_store">Online store</option></select> : undefined}
        empty={<EmptyState icon={kind === "sale" ? ShoppingCart : Receipt} title={copy.emptyTitle} description={copy.emptyBody} action={addButton} />}
        columns={[
          { key: "date", label: "Date", render: (row) => formatDate(row.date), sortValue: (row) => row.date },
          { key: "party", label: copy.party, render: (row) => <span className="font-medium text-foreground">{row.party}</span>, sortValue: (row) => row.party },
          { key: "ref", label: "Reference", render: (row) => row.reference ?? "—" },
          ...(kind === "sale" ? [{ key: "source", label: "Source", render: (row: TradeRow) => row.source === "online_store" ? "Online store" : "In person" }] : []),
          { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
          { key: "paid", label: "Paid", align: "right", render: (row) => <span className="tabular">{money(row.paid, row)}</span>, sortValue: (row) => Number(row.paid) },
          { key: "total", label: "Total", align: "right", render: (row) => <span className="tabular font-semibold">{money(row.total, row)}</span>, sortValue: (row) => Number(row.total) },
          { key: "actions", label: "", align: "right", render: actions },
        ]}
        renderCard={(row) => (
          <RecordCard
            icon={kind === "sale" ? <ShoppingCart size={18} aria-hidden="true" /> : <Receipt size={18} aria-hidden="true" />}
            iconClassName={kind === "sale" ? "bg-primary-soft text-primary" : "bg-warning-soft text-warning"}
            reference={row.reference ?? undefined}
            title={row.party}
            amount={money(row.total, row)}
            status={<StatusBadge status={row.status} />}
            meta={[
              { label: "Date", value: formatDate(row.date) },
              { label: "Paid", value: money(row.paid, row) },
            ]}
            onView={kind === "purchase" ? () => router.push(`/purchases/${row.id}`) : undefined}
            actions={actions(row)}
          />
        )}
      />

      <PaymentDrawer workspaceId={workspaceId} currency={currency} isOpen={payment !== undefined} onClose={() => setPayment(undefined)} preset={payment} />
    </Page>
  );
}

export function TradePage({ kind, startOpen = false }: { kind: Kind; startOpen?: boolean }) {
  return (
    <WorkspaceGate businessOnly>
      {(workspace) => <TradeContent key={workspace.workspaceId} {...workspace} kind={kind} startOpen={startOpen} />}
    </WorkspaceGate>
  );
}

export function SalesPage({ startOpen = false }: { startOpen?: boolean }) {
  return <TradePage kind="sale" startOpen={startOpen} />;
}

export function PurchasesPage({ startOpen = false }: { startOpen?: boolean }) {
  return <TradePage kind="purchase" startOpen={startOpen} />;
}
