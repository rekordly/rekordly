"use client";

// Sales and purchases are the same screen with different words and fields.

import { zodResolver } from "@hookform/resolvers/zod";
import { HandCoins, Plus, Receipt, ShoppingCart } from "@phosphor-icons/react";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { AppButton } from "@/components/ui/app-button";
import { AppRowActions } from "@/components/ui/app-row-actions";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { formatDate } from "@/lib/format";
import { financeApi } from "@/lib/money";
import { tradeSchema, type TradeValues } from "@/lib/schemas/finance.schemas";
import type { Purchase, Sale } from "@/types/finance";

import { MoneyField, NotesField, SelectField, TextInputField } from "./fields";
import { PaymentDrawer, type PaymentPreset } from "./payment-drawer";
import { money, StatusBadge, today, useAccountOptions, useCategoryOptions, useContacts, useFinanceAction, useRecords, WorkspaceGate, type WorkspaceInfo } from "./shared";

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
    reference: record.reference,
  };
}

const COPY = {
  sale: {
    title: "Sales",
    description: "What you have sold, and what has been paid.",
    add: "Record sale",
    party: "Customer",
    fallbackParty: "Walk-in customer",
    accountLabel: "Paid in full into",
    emptyTitle: "No sales yet",
    emptyBody: "Record a sale to start tracking what customers owe you.",
    saved: "Sale recorded",
  },
  purchase: {
    title: "Purchases",
    description: "What you have bought, and what you still owe.",
    add: "Record purchase",
    party: "Supplier",
    fallbackParty: "Unnamed supplier",
    accountLabel: "Paid in full from",
    emptyTitle: "No purchases yet",
    emptyBody: "Record a purchase to track what you owe suppliers.",
    saved: "Purchase recorded",
  },
} as const;

function TradeContent({ workspaceId, currency, kind, startOpen }: WorkspaceInfo & { kind: Kind; startOpen: boolean }) {
  const copy = COPY[kind];
  const [isOpen, setIsOpen] = useState(startOpen);
  const [payment, setPayment] = useState<PaymentPreset | undefined>();
  const records = useRecords<Sale | Purchase>(kind === "sale" ? "sales" : "purchases", workspaceId);
  const accounts = useAccountOptions(workspaceId);
  const contacts = useContacts(workspaceId, kind === "sale" ? "customers" : "suppliers");
  const categories = useCategoryOptions(workspaceId, "money_out");

  const form = useForm<TradeValues>({
    resolver: zodResolver(tradeSchema),
    defaultValues: { party_id: "", party_name: "", date: today(), amount: "", category_id: "", reference: "", notes: "", account_id: "" },
  });

  const close = () => {
    setIsOpen(false);
    form.reset();
  };

  const create = useFinanceAction(
    workspaceId,
    (values: TradeValues, key: string) => {
      const contact = contacts.data?.find((item) => String(item.id) === values.party_id);
      const partyId = contact?.id;
      const partyName = contact?.name || values.party_name || copy.fallbackParty;
      const shared = {
        amount: values.amount,
        currency,
        reference: values.reference || undefined,
        notes: values.notes || undefined,
        payment_legs: values.account_id
          ? [{ money_account_id: Number(values.account_id), amount: values.amount }]
          : undefined,
      };
      return kind === "sale"
        ? financeApi.createSale(workspaceId, { ...shared, customer_id: partyId, customer_name: partyName, sale_date: values.date }, key)
        : financeApi.createPurchase(
            workspaceId,
            { ...shared, supplier_id: partyId, supplier_name: partyName, purchase_date: values.date, category_id: values.category_id ? Number(values.category_id) : undefined },
            key,
          );
    },
    { success: copy.saved, onDone: close },
  );

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
      ariaLabel={`${copy.title} actions`}
      items={[
        {
          key: "pay",
          label: "Record payment",
          icon: <HandCoins size={16} aria-hidden="true" />,
          disabled: row.status === "paid" || row.status === "voided",
          onClick: () => openPayment(row),
        },
      ]}
    />
  );

  const Icon = kind === "sale" ? Receipt : ShoppingCart;
  const rows = records.rows.map(toRow);

  return (
    <Page>
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={<AppButton startContent={<Plus weight="bold" />} label={copy.add} onPress={() => setIsOpen(true)} />}
      />
      <DataView<TradeRow>
        title={copy.title}
        rows={rows}
        rowKey={(row) => row.id}
        isLoading={records.isPending}
        isError={records.isError}
        server={records.controls}
        searchPlaceholder={`Search ${copy.party.toLowerCase()} or reference`}
        empty={
          <EmptyState
            icon={Icon}
            title={copy.emptyTitle}
            description={copy.emptyBody}
            action={<AppButton startContent={<Plus weight="bold" />} label={copy.add} onPress={() => setIsOpen(true)} />}
          />
        }
        columns={[
          { key: "party", label: copy.party, render: (row) => <span className="font-medium text-foreground">{row.party}</span> },
          { key: "date", label: "Date", render: (row) => formatDate(row.date) },
          { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
          { key: "paid", label: "Paid", align: "right", render: (row) => <span className="tabular">{money(row.paid, row)}</span> },
          { key: "total", label: "Total", align: "right", render: (row) => <span className="tabular font-semibold">{money(row.total, row)}</span> },
          { key: "actions", label: "", align: "right", render: actions },
        ]}
        renderCard={(row) => (
          <RecordCard
            icon={<Icon size={18} aria-hidden="true" />}
            iconClassName={kind === "sale" ? "bg-primary-soft text-primary" : "bg-secondary-soft text-secondary-soft-foreground"}
            reference={row.reference || `#${row.id}`}
            title={row.party}
            amount={money(row.total, row)}
            status={<StatusBadge status={row.status} />}
            meta={[
              { label: "Paid", value: money(row.paid, row) },
              { label: "Date", value: formatDate(row.date) },
            ]}
            actions={actions(row)}
          />
        )}
      />

      <FormDrawer
        isOpen={isOpen}
        onOpenChange={(open) => !open && close()}
        title={copy.add}
        submitLabel={copy.add}
        isSubmitting={create.isPending}
        onSubmit={form.handleSubmit((values) => create.mutate(values))}
      >
        <SelectField
          control={form.control}
          name="party_id"
          label={copy.party}
          placeholder={`Choose a saved ${copy.party.toLowerCase()}`}
          options={(contacts.data ?? []).map((contact) => ({ key: String(contact.id), label: contact.name }))}
        />
        <TextInputField control={form.control} name="party_name" label="Or type a name" placeholder={copy.fallbackParty} />
        <MoneyField control={form.control} name="amount" label="Total amount" currency={currency} isRequired />
        <TextInputField control={form.control} name="date" label="Date" type="date" isRequired />
        {kind === "purchase" ? <SelectField control={form.control} name="category_id" label="Category" placeholder="Choose category" options={categories} /> : null}
        <SelectField control={form.control} name="account_id" label={copy.accountLabel} placeholder="Not paid yet" options={accounts.options} />
        <TextInputField control={form.control} name="reference" label="Reference" placeholder="Optional" />
        <NotesField control={form.control} name="notes" label="Notes" />
      </FormDrawer>

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
