"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle, FileText, HandCoins, Plus, Prohibit, Trash, Wallet } from "@phosphor-icons/react";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { AppRowActions } from "@/components/ui/app-row-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { formatDate } from "@/lib/format";
import { financeApi } from "@/lib/money";
import { invoiceSchema, walletPaymentSchema, type InvoiceValues, type WalletPaymentValues } from "@/lib/schemas/finance.schemas";
import type { Invoice } from "@/types/finance";

import { MoneyField, NotesField, SelectField, TextInputField } from "./fields";
import { PaymentDrawer, type PaymentPreset } from "./payment-drawer";
import { money, StatusBadge, today, useContacts, useFinanceAction, useRecords, WorkspaceGate, type WorkspaceInfo } from "./shared";

type PendingAction = { kind: "finalize" | "void" | "wallet"; invoice: Invoice };

const BLANK_ITEM = { description: "", quantity: "1", unit_price: "" };

function InvoicesContent({ workspaceId, currency, startOpen }: WorkspaceInfo & { startOpen: boolean }) {
  const [isOpen, setIsOpen] = useState(startOpen);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [payment, setPayment] = useState<PaymentPreset | undefined>();
  const invoices = useRecords<Invoice>("invoices", workspaceId);
  const customers = useContacts(workspaceId, "customers");

  const form = useForm<InvoiceValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: { customer_id: "", issue_date: today(), due_date: today(), tax_amount: "", notes: "", terms: "", items: [BLANK_ITEM] },
  });
  const items = useFieldArray({ control: form.control, name: "items" });
  const walletForm = useForm<WalletPaymentValues>({ resolver: zodResolver(walletPaymentSchema), defaultValues: { amount: "" } });

  const close = () => {
    setIsOpen(false);
    form.reset();
  };
  const closePending = () => {
    setPending(null);
    walletForm.reset();
  };

  const create = useFinanceAction(
    workspaceId,
    (values: InvoiceValues, key: string) => {
      const customer = customers.data?.find((item) => String(item.id) === values.customer_id);
      return financeApi.createInvoice(
        workspaceId,
        {
          customer_id: Number(values.customer_id),
          customer_name: customer?.name,
          issue_date: values.issue_date,
          due_date: values.due_date,
          currency,
          status: "draft",
          tax_amount: values.tax_amount || undefined,
          notes: values.notes || undefined,
          terms: values.terms || undefined,
          items: values.items.map((item) => ({
            description: item.description,
            quantity: Number(item.quantity),
            unit_price: item.unit_price,
          })),
        },
        key,
      );
    },
    { success: "Invoice saved as draft", onDone: close },
  );
  const finalize = useFinanceAction(workspaceId, (invoice: Invoice, key: string) => financeApi.finalizeInvoice(workspaceId, invoice.id, key), {
    success: "Invoice finalized",
    onDone: closePending,
  });
  const voidInvoice = useFinanceAction(
    workspaceId,
    (invoice: Invoice, key: string) => financeApi.voidInvoice(workspaceId, invoice.id, "Voided from invoice list", key),
    { success: "Invoice voided", onDone: closePending },
  );
  const payFromWallet = useFinanceAction(
    workspaceId,
    ({ invoice, amount }: { invoice: Invoice; amount: string }, key: string) =>
      financeApi.payInvoiceFromWallet(workspaceId, invoice.id, amount, invoice.currency, key),
    { success: "Paid from customer wallet", onDone: closePending },
  );
  const openDirectPayment = (invoice: Invoice) => setPayment({
    direction: "incoming",
    linkedType: "invoice",
    linkedId: invoice.id,
    partyName: invoice.customer_name,
    summary: `${invoice.invoice_number}: ${money(invoice.paid_amount_minor, invoice)} paid of ${money(invoice.total_amount_minor, invoice)}. This clears the invoice receivable; it does not create sales revenue again.`,
  });

  const actions = (row: Invoice) => (
    <AppRowActions
      ariaLabel="Invoice actions"
      items={[
        { key: "finalize", label: "Finalize", icon: <CheckCircle size={16} aria-hidden="true" />, disabled: row.status !== "draft", onClick: () => setPending({ kind: "finalize", invoice: row }) },
        { key: "payment", label: "Record payment", icon: <HandCoins size={16} aria-hidden="true" />, disabled: row.status !== "finalized" && row.status !== "partially_paid", onClick: () => openDirectPayment(row) },
        { key: "wallet", label: "Pay from wallet", icon: <Wallet size={16} aria-hidden="true" />, disabled: row.status !== "finalized" && row.status !== "partially_paid", onClick: () => setPending({ kind: "wallet", invoice: row }) },
        { key: "void", label: "Void invoice", icon: <Prohibit size={16} aria-hidden="true" />, danger: true, disabled: row.status !== "draft" && row.status !== "finalized", onClick: () => setPending({ kind: "void", invoice: row }) },
      ]}
    />
  );

  return (
    <Page>
      <PageHeader
        title="Invoices"
        description="Bills you send to customers, from draft to paid."
        actions={<AppButton startContent={<Plus weight="bold" />} label="New invoice" onPress={() => setIsOpen(true)} />}
      />
      <DataView<Invoice>
        title="Invoices"
        rows={invoices.rows}
        rowKey={(row) => row.id}
        isLoading={invoices.isPending}
        isError={invoices.isError}
        server={invoices.controls}
        searchPlaceholder="Search number or customer"
        empty={
          <EmptyState
            icon={FileText}
            title="No invoices yet"
            description="Create an invoice to bill a customer."
            action={<AppButton startContent={<Plus weight="bold" />} label="New invoice" onPress={() => setIsOpen(true)} />}
          />
        }
        columns={[
          { key: "number", label: "Invoice", render: (row) => <span className="font-medium text-foreground">{row.invoice_number}</span> },
          { key: "customer", label: "Customer", render: (row) => row.customer_name },
          { key: "due", label: "Due", render: (row) => formatDate(row.due_date) },
          { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
          { key: "paid", label: "Paid", align: "right", render: (row) => <span className="tabular">{money(row.paid_amount_minor, row)}</span> },
          { key: "total", label: "Total", align: "right", render: (row) => <span className="tabular font-semibold">{money(row.total_amount_minor, row)}</span> },
          { key: "actions", label: "", align: "right", render: actions },
        ]}
        renderCard={(row) => (
          <RecordCard
            icon={<FileText size={18} aria-hidden="true" />}
            iconClassName="bg-primary-soft text-primary"
            reference={row.invoice_number}
            title={row.customer_name}
            amount={money(row.total_amount_minor, row)}
            status={<StatusBadge status={row.status} />}
            meta={[
              { label: "Paid", value: money(row.paid_amount_minor, row) },
              { label: "Due", value: formatDate(row.due_date) },
            ]}
            actions={actions(row)}
          />
        )}
      />

      <FormDrawer
        isOpen={isOpen}
        onOpenChange={(open) => !open && close()}
        title="New invoice"
        description="Saved as a draft. Finalize it when it is ready to send."
        submitLabel="Save draft"
        isSubmitting={create.isPending}
        onSubmit={form.handleSubmit((values) => create.mutate(values))}
      >
        {customers.data?.length === 0 ? <Alert status="info" description="Add a customer in Contacts first." /> : null}
        <SelectField
          control={form.control}
          name="customer_id"
          label="Customer"
          placeholder="Choose customer"
          options={(customers.data ?? []).map((customer) => ({ key: String(customer.id), label: customer.name }))}
          isRequired
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInputField control={form.control} name="issue_date" label="Issue date" type="date" isRequired />
          <TextInputField control={form.control} name="due_date" label="Due date" type="date" isRequired />
        </div>

        <div className="space-y-3">
          <p className="text-[13px] font-medium text-foreground">Items</p>
          {items.fields.map((field, index) => (
            <div key={field.id} className="space-y-3 rounded-2xl bg-surface-secondary p-3">
              <TextInputField control={form.control} name={`items.${index}.description`} label="Description" isRequired />
              <div className="grid grid-cols-[1fr_2fr_auto] items-start gap-3">
                <TextInputField control={form.control} name={`items.${index}.quantity`} label="Qty" isRequired />
                <MoneyField control={form.control} name={`items.${index}.unit_price`} label="Unit price" currency={currency} isRequired />
                <div className="pt-6">
                  <AppButton isIconOnly variant="ghost" aria-label="Remove item" isDisabled={items.fields.length === 1} onPress={() => items.remove(index)}>
                    <Trash size={18} />
                  </AppButton>
                </div>
              </div>
            </div>
          ))}
          <AppButton variant="tertiary" size="sm" startContent={<Plus weight="bold" />} label="Add item" onPress={() => items.append(BLANK_ITEM)} />
        </div>

        <MoneyField control={form.control} name="tax_amount" label="Tax" currency={currency} />
        <NotesField control={form.control} name="notes" label="Notes" />
        <NotesField control={form.control} name="terms" label="Payment terms" />
      </FormDrawer>

      <ConfirmDialog
        isOpen={pending?.kind === "finalize"}
        onOpenChange={(open) => !open && closePending()}
        title="Finalize this invoice?"
        description="It will post to your books and can no longer be edited. To correct it later you would void it."
        confirmLabel="Finalize"
        isDanger={false}
        isLoading={finalize.isPending}
        onConfirm={() => pending && finalize.mutate(pending.invoice)}
      />
      <ConfirmDialog
        isOpen={pending?.kind === "void"}
        onOpenChange={(open) => !open && closePending()}
        title="Void this invoice?"
        description="It stays in your history marked as voided, and its entries are reversed. This cannot be undone."
        confirmLabel="Void invoice"
        isLoading={voidInvoice.isPending}
        onConfirm={() => pending && voidInvoice.mutate(pending.invoice)}
      />
      <FormDrawer
        isOpen={pending?.kind === "wallet"}
        onOpenChange={(open) => !open && closePending()}
        title="Pay from customer wallet"
        description={pending ? `${pending.invoice.invoice_number}: ${money(pending.invoice.paid_amount_minor, pending.invoice)} paid of ${money(pending.invoice.total_amount_minor, pending.invoice)}.` : undefined}
        submitLabel="Confirm payment"
        isSubmitting={payFromWallet.isPending}
        onSubmit={walletForm.handleSubmit((values) => pending && payFromWallet.mutate({ invoice: pending.invoice, amount: values.amount }))}
      >
        <MoneyField control={walletForm.control} name="amount" label="Amount" currency={pending?.invoice.currency ?? currency} isRequired description="Check the wallet balance on the Wallets page first." />
      </FormDrawer>
      <PaymentDrawer workspaceId={workspaceId} currency={currency} isOpen={payment !== undefined} onClose={() => setPayment(undefined)} preset={payment} />
    </Page>
  );
}

export function InvoicesPage({ startOpen = false }: { startOpen?: boolean }) {
  return (
    <WorkspaceGate businessOnly>
      {(workspace) => <InvoicesContent key={workspace.workspaceId} {...workspace} startOpen={startOpen} />}
    </WorkspaceGate>
  );
}
