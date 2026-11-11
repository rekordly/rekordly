"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { FormDrawer } from "@/components/ui/form-drawer";
import { financeApi } from "@/lib/money";
import { paymentSchema, type PaymentValues } from "@/lib/schemas/finance.schemas";

import { MoneyField, NotesField, SelectField, TextInputField } from "./fields";
import { today, useAccountOptions, useFinanceAction } from "./shared";

export interface PaymentPreset {
  direction: "incoming" | "outgoing";
  linkedType: "sale" | "purchase" | "invoice" | "supplier_bill";
  linkedId: number;
  partyName: string;
  summary: string;
}

const DIRECTIONS = [
  { key: "incoming", label: "Money received" },
  { key: "outgoing", label: "Money paid out" },
];

export function PaymentDrawer({
  workspaceId,
  currency,
  isOpen,
  onClose,
  preset,
}: {
  workspaceId: number;
  currency: string;
  isOpen: boolean;
  onClose: () => void;
  preset?: PaymentPreset;
}) {
  const accounts = useAccountOptions(workspaceId);
  const form = useForm<PaymentValues>({
    resolver: zodResolver(paymentSchema),
    values: {
      direction: preset?.direction ?? "incoming",
      date: today(),
      amount: "",
      account_id: "",
      party_name: preset?.partyName ?? "",
      reference: "",
      notes: "",
    },
  });

  const close = () => {
    form.reset();
    onClose();
  };

  const create = useFinanceAction(
    workspaceId,
    (values: PaymentValues, key: string) =>
      financeApi.createPayment(
        workspaceId,
        {
          direction: values.direction,
          payment_date: values.date,
          amount: values.amount,
          currency,
          counterparty_name: values.party_name,
          linked_record_type: preset?.linkedType,
          linked_record_id: preset?.linkedId,
          payment_legs: [{ money_account_id: Number(values.account_id), amount: values.amount }],
          reference: values.reference || undefined,
          notes: values.notes || undefined,
        },
        key,
      ),
    { success: "Payment recorded", onDone: close },
  );

  return (
    <FormDrawer
      isOpen={isOpen}
      onOpenChange={(open) => !open && close()}
      title="Record payment"
      description={preset?.summary ?? "Money received from a customer or paid to a supplier."}
      submitLabel="Confirm payment"
      isSubmitting={create.isPending}
      onSubmit={form.handleSubmit((values) => create.mutate(values))}
    >
      {preset ? null : <SelectField control={form.control} name="direction" label="Type" options={DIRECTIONS} isRequired />}
      <MoneyField control={form.control} name="amount" label="Amount" currency={currency} isRequired />
      <TextInputField control={form.control} name="date" label="Date" type="date" isRequired />
      <SelectField control={form.control} name="account_id" label="Account" placeholder={accounts.isPending ? "Loading accounts…" : "Choose account"} options={accounts.options} isRequired />
      <TextInputField control={form.control} name="party_name" label="Customer or supplier" isRequired />
      <TextInputField control={form.control} name="reference" label="Reference" placeholder="Optional" />
      <NotesField control={form.control} name="notes" label="Notes" />
    </FormDrawer>
  );
}
