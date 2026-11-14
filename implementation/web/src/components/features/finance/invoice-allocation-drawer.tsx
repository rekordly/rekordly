"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MagicWand, X } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { FormDrawer } from "@/components/ui/form-drawer";
import { MoneyInput } from "@/components/ui/money-input";
import { financeApi, formatMinorAmount, listRecords, moneyKeys } from "@/lib/money";
import { invoiceAllocationSchema, type InvoiceAllocationValues } from "@/lib/schemas/finance.schemas";
import type { Invoice } from "@/types/finance";

import { MoneyField, NotesField, TextInputField } from "./fields";
import { today, useFinanceAction } from "./shared";
import { AccountField, ContactField } from "@/components/pickers";

const ZERO = BigInt(0);
const TEN = BigInt(10);

function asMinor(value: string, exponent = 2): bigint {
  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) return ZERO;
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > exponent) return ZERO;
  return BigInt(whole) * TEN ** BigInt(exponent) + BigInt((fraction + "0".repeat(exponent)).slice(0, exponent));
}

function asMajor(minor: bigint, exponent: number): string {
  if (exponent === 0) return minor.toString();
  const divisor = TEN ** BigInt(exponent);
  return `${minor / divisor}.${(minor % divisor).toString().padStart(exponent, "0")}`;
}

function useOpenInvoices(workspaceId: number, customerId: string) {
  return useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "invoice-allocation", customerId],
    enabled: customerId !== "",
    queryFn: async () => {
      const [finalized, partial] = await Promise.all([
        listRecords<Invoice>(workspaceId, "invoices", { customer_id: customerId, status: "finalized" }),
        listRecords<Invoice>(workspaceId, "invoices", { customer_id: customerId, status: "partially_paid" }),
      ]);
      return [...finalized, ...partial].sort((left, right) => {
        const due = left.due_date.localeCompare(right.due_date);
        return due !== 0 ? due : left.id - right.id;
      });
    },
  });
}

export function InvoiceAllocationDrawer({
  workspaceId,
  currency,
  isOpen,
  onClose,
}: {
  workspaceId: number;
  currency: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const form = useForm<InvoiceAllocationValues>({
    resolver: zodResolver(invoiceAllocationSchema),
    defaultValues: { customer_id: "", date: today(), amount: "", account_id: "", allocations: {}, reference: "", notes: "" },
  });
  const customerID = form.watch("customer_id");
  const amount = form.watch("amount");
  const allocationValues = form.watch("allocations");
  const invoices = useOpenInvoices(workspaceId, customerID);
  const rows = invoices.data ?? [];
  const exponent = rows[0]?.currency_exponent ?? 2;
  const paymentMinor = asMinor(amount, exponent);
  const allocatedMinor = rows.reduce((total, invoice) => total + asMinor(allocationValues?.[String(invoice.id)] ?? "", exponent), ZERO);
  const remainderMinor = paymentMinor - allocatedMinor;

  const close = () => {
    form.reset();
    onClose();
  };

  const create = useFinanceAction(
    workspaceId,
    (values: InvoiceAllocationValues, key: string) =>
      financeApi.createPayment(
        workspaceId,
        {
          direction: "incoming",
          payment_date: values.date,
          amount: values.amount,
          currency,
          counterparty_id: Number(values.customer_id),
          payment_legs: [{ money_account_id: Number(values.account_id), amount: values.amount }],
          allocations: rows
            .map((invoice) => ({ document_type: "invoice", document_id: invoice.id, amount: values.allocations[String(invoice.id)]?.trim() ?? "" }))
            .filter((allocation) => allocation.amount !== ""),
          reference: values.reference || undefined,
          notes: values.notes || undefined,
        },
        key,
      ),
    { success: "Receipt allocated", onDone: close },
  );

  const autoAllocate = () => {
    let remaining = paymentMinor;
    const next: Record<string, string> = {};
    for (const invoice of rows) {
      if (remaining <= ZERO) break;
      const outstanding = BigInt(String(invoice.total_amount_minor)) - BigInt(String(invoice.paid_amount_minor));
      const allocation = outstanding < remaining ? outstanding : remaining;
      if (allocation > ZERO) next[String(invoice.id)] = asMajor(allocation, exponent);
      remaining -= allocation;
    }
    form.setValue("allocations", next, { shouldDirty: true });
    form.clearErrors("allocations");
  };

  const submit = form.handleSubmit((values) => {
    const currentAllocated = rows.reduce((total, invoice) => total + asMinor(values.allocations[String(invoice.id)] ?? "", exponent), ZERO);
    if (rows.length === 0) {
      form.setError("allocations", { message: "This customer has no open invoices to settle." });
      return;
    }
    if (currentAllocated !== asMinor(values.amount, exponent)) {
      form.setError("allocations", { message: "Allocate the full receipt amount before confirming." });
      return;
    }
    create.mutate(values);
  });

  return (
    <FormDrawer
      isOpen={isOpen}
      onOpenChange={(open) => !open && close()}
      title="Allocate customer receipt"
      description="Receive one payment and settle one or more of the customer’s open invoices. This reduces receivables; it does not create revenue again."
      submitLabel="Confirm receipt"
      isSubmitting={create.isPending}
      onSubmit={submit}
    >
      <ContactField control={form.control} name="customer_id" label="Customer" workspaceId={workspaceId} kind="customers" clearable={false} />
      <MoneyField control={form.control} name="amount" label="Receipt total" currency={currency} isRequired />
      <TextInputField control={form.control} name="date" label="Date" type="date" isRequired />
      <AccountField control={form.control} name="account_id" label="Received into" workspaceId={workspaceId} isRequired />

      {customerID ? (
        <section className="space-y-3 border-t border-divider pt-4" aria-label="Invoice allocations">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[14px] font-semibold text-foreground">Open invoices</h3>
              <p className="text-[12px] text-muted">Allocate the entire receipt before confirmation.</p>
            </div>
            <div className="flex gap-1">
              <AppButton size="sm" variant="ghost" startContent={<MagicWand />} label="Auto" onPress={autoAllocate} isDisabled={paymentMinor <= ZERO || rows.length === 0} />
              <AppButton size="sm" variant="ghost" startContent={<X />} label="Clear" onPress={() => form.setValue("allocations", {}, { shouldDirty: true })} />
            </div>
          </div>
          {invoices.isPending ? <p className="text-[13px] text-muted">Loading open invoices…</p> : null}
          {rows.map((invoice) => {
            const outstanding = BigInt(String(invoice.total_amount_minor)) - BigInt(String(invoice.paid_amount_minor));
            return (
              <div key={invoice.id} className="grid grid-cols-[minmax(0,1fr)_9rem] items-end gap-3 border-b border-divider pb-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-foreground">{invoice.invoice_number}</p>
                  <p className="text-[12px] text-muted">Due {invoice.due_date} · {formatMinorAmount(outstanding.toString(), invoice.currency, invoice.currency_exponent)} outstanding</p>
                </div>
                <Controller
                  control={form.control}
                  name={`allocations.${invoice.id}`}
                  render={({ field }) => (
                    <MoneyInput label="Allocate" currency={currency} value={field.value ?? ""} onValueChange={field.onChange} onBlur={field.onBlur} />
                  )}
                />
              </div>
            );
          })}
          {!invoices.isPending && rows.length === 0 ? <Alert status="info" title="No open invoices" description="Use the ordinary payment form for a customer advance or record a payment from the invoice itself." /> : null}
          <div className="flex items-center justify-between rounded-xl bg-surface-muted px-3 py-2 text-[13px]">
            <span className="text-muted">Allocated</span>
            <span className="font-semibold tabular text-foreground">{formatMinorAmount(allocatedMinor.toString(), currency, exponent)} <span className="font-normal text-muted">of {formatMinorAmount(paymentMinor.toString(), currency, exponent)}</span></span>
          </div>
          {remainderMinor !== ZERO ? <Alert status="warning" title={remainderMinor > ZERO ? "Receipt still unallocated" : "Allocation exceeds receipt"} description={remainderMinor > ZERO ? `${formatMinorAmount(remainderMinor.toString(), currency, exponent)} still needs an invoice allocation.` : "Reduce one or more allocations before confirming."} /> : null}
          {form.formState.errors.allocations?.message ? <Alert status="error" title="Check allocations" description={String(form.formState.errors.allocations.message)} /> : null}
        </section>
      ) : null}
      <TextInputField control={form.control} name="reference" label="Reference" placeholder="Optional" />
      <NotesField control={form.control} name="notes" label="Notes" />
    </FormDrawer>
  );
}
