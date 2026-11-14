"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, SplitHorizontal, Trash } from "@phosphor-icons/react";
import { useFieldArray, useForm } from "react-hook-form";

import { AppButton } from "@/components/ui/app-button";
import { FormDrawer } from "@/components/ui/form-drawer";
import { financeApi } from "@/lib/money";
import { paymentSchema, type PaymentValues } from "@/lib/schemas/finance.schemas";

import { MoneyField, NotesField, SelectField, TextInputField } from "./fields";
import { today, useFinanceAction } from "./shared";
import { AccountField } from "@/components/pickers";

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
  defaultSplit = false,
}: {
  workspaceId: number;
  currency: string;
  isOpen: boolean;
  onClose: () => void;
  preset?: PaymentPreset;
  defaultSplit?: boolean;
}) {
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
      split_enabled: defaultSplit,
      legs: defaultSplit
        ? [
            { account_id: "", amount: "" },
            { account_id: "", amount: "" },
          ]
        : [],
    },
  });

  const legsArray = useFieldArray({ control: form.control, name: "legs" });
  const splitEnabled = form.watch("split_enabled");
  const watchedLegs = form.watch("legs");
  const watchedAmount = form.watch("amount");

  const toggleSplit = () => {
    const next = !splitEnabled;
    form.setValue("split_enabled", next);
    if (next && legsArray.fields.length < 2) {
      const currentAcct = form.getValues("account_id");
      const currentAmt = form.getValues("amount");
      legsArray.replace([
        { account_id: currentAcct || "", amount: currentAmt || "" },
        { account_id: "", amount: "" },
      ]);
    }
  };

  const close = () => {
    form.reset();
    onClose();
  };

  const create = useFinanceAction(
    workspaceId,
    (values: PaymentValues, key: string) => {
      const paymentLegs = values.split_enabled
        ? values.legs.map((leg) => ({
            money_account_id: Number(leg.account_id),
            amount: leg.amount || "0",
          }))
        : [{ money_account_id: Number(values.account_id), amount: values.amount }];

      return financeApi.createPayment(
        workspaceId,
        {
          direction: values.direction,
          payment_date: values.date,
          amount: values.amount,
          currency,
          counterparty_name: values.party_name,
          linked_record_type: preset?.linkedType,
          linked_record_id: preset?.linkedId,
          payment_legs: paymentLegs,
          reference: values.reference || undefined,
          notes: values.notes || undefined,
        },
        key,
      );
    },
    { success: "Payment recorded", onDone: close },
  );

  // Sync leg amounts total helper when in split mode
  const syncTotalFromLegs = () => {
    const sum = (watchedLegs ?? []).reduce((acc, l) => {
      const n = parseFloat(l.amount || "0");
      return acc + (isNaN(n) ? 0 : n);
    }, 0);
    if (sum > 0) {
      form.setValue("amount", sum.toFixed(2), { shouldValidate: true });
    }
  };

  return (
    <FormDrawer
      isOpen={isOpen}
      onOpenChange={(open) => !open && close()}
      title={defaultSplit ? "Record split payment" : "Record payment"}
      description={preset?.summary ?? "Money received from a customer or paid to a supplier."}
      submitLabel="Confirm payment"
      isSubmitting={create.isPending}
      onSubmit={form.handleSubmit((values) => create.mutate(values))}
    >
      {preset ? null : <SelectField control={form.control} name="direction" label="Type" options={DIRECTIONS} isRequired />}
      <MoneyField control={form.control} name="amount" label="Total amount" currency={currency} isRequired />
      <TextInputField control={form.control} name="date" label="Date" type="date" isRequired />

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs font-semibold text-muted">
          {splitEnabled ? "Split across multiple accounts" : "Single settlement account"}
        </span>
        <AppButton
          size="sm"
          variant="ghost"
          startContent={<SplitHorizontal size={15} />}
          label={splitEnabled ? "Use single account" : "Split across accounts"}
          onPress={toggleSplit}
        />
      </div>

      {!splitEnabled ? (
        <AccountField control={form.control} name="account_id" label="Account" workspaceId={workspaceId} isRequired />
      ) : (
        <div className="space-y-3 rounded-2xl border border-border/60 bg-surface-secondary/30 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Payment legs</span>
            {watchedLegs && watchedLegs.length >= 2 ? (
              <button
                type="button"
                onClick={syncTotalFromLegs}
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                Set total from legs
              </button>
            ) : null}
          </div>
          {legsArray.fields.map((field, index) => (
            <div key={field.id} className="space-y-2 rounded-xl border border-border/40 bg-background p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted">Leg #{index + 1}</span>
                {legsArray.fields.length > 2 ? (
                  <button
                    type="button"
                    onClick={() => legsArray.remove(index)}
                    className="text-muted hover:text-danger"
                    aria-label="Remove leg"
                  >
                    <Trash size={14} />
                  </button>
                ) : null}
              </div>
              <AccountField control={form.control} name={`legs.${index}.account_id`} label="Account" workspaceId={workspaceId} isRequired />
              <MoneyField
                control={form.control}
                name={`legs.${index}.amount`}
                label="Leg amount"
                currency={currency}
                isRequired
              />
            </div>
          ))}
          <AppButton
            size="sm"
            variant="secondary"
            startContent={<Plus size={14} />}
            label="Add another account leg"
            onPress={() => legsArray.append({ account_id: "", amount: "" })}
          />
          {watchedAmount ? (
            <p className="text-[11px] text-muted">
              Leg amounts must add up exactly to the total amount ({currency} {watchedAmount}).
            </p>
          ) : null}
        </div>
      )}

      <TextInputField control={form.control} name="party_name" label="Customer or supplier" isRequired />
      <TextInputField control={form.control} name="reference" label="Reference" placeholder="Optional" />
      <NotesField control={form.control} name="notes" label="Notes" />
    </FormDrawer>
  );
}
