"use client";

import { PencilSimple, Plus, SplitHorizontal, Trash } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { AccountPicker, ContactPicker, toMinor, type ContactValue } from "@/components/pickers";
import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppSelect } from "@/components/ui/app-select";
import { AppTextarea } from "@/components/ui/app-textarea";
import { FormDrawer } from "@/components/ui/form-drawer";
import { PickerDrawer, type PickerItem } from "@/components/ui/form-kit";
import { MoneyInput } from "@/components/ui/money-input";
import { financeApi, formatMinorAmount, moneyApi, moneyKeys } from "@/lib/money";
import { useQuery } from "@tanstack/react-query";

import { today, useFinanceAction } from "./shared";

export interface PaymentPreset {
  direction: "incoming" | "outgoing";
  linkedType: "sale" | "purchase" | "invoice" | "supplier_bill" | "goods_receipt";
  linkedId: number;
  partyName: string;
  summary: string;
  defaultAmount?: string;
  supplierId?: number | null;
  billId?: number | null;
  billStatus?: string;
  billVersion?: number;
}

interface SplitLeg {
  key: string;
  accountId: string;
  accountName: string;
  amount: string;
}

const DIRECTIONS = [
  { key: "incoming", label: "Money received" },
  { key: "outgoing", label: "Money paid out" },
];

const EXPONENT = 2;

function initialsOf(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "•"
  );
}

function minorToMajor(minor: bigint): string {
  if (minor <= BigInt(0)) return "";
  const whole = minor / BigInt(100);
  const frac = (minor % BigInt(100)).toString().padStart(2, "0");
  return `${whole}.${frac}`;
}

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
  const [direction, setDirection] = useState<"incoming" | "outgoing">(preset?.direction ?? "incoming");
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState(preset?.defaultAmount ?? "");
  const [accountId, setAccountId] = useState("");
  const [party, setParty] = useState<ContactValue | null>(
    preset?.partyName ? { id: "", name: preset.partyName } : null,
  );
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [legs, setLegs] = useState<SplitLeg[]>([]);
  const [legDrawer, setLegDrawer] = useState<{ key: number; editIndex?: number } | null>(null);
  const [errors, setErrors] = useState<{ amount?: string; account?: string; party?: string }>({});

  const accountsQuery = useQuery({
    queryKey: moneyKeys.accounts(workspaceId),
    queryFn: () => moneyApi.listAccounts({ workspaceId }),
    enabled: isOpen,
  });
  const accounts = (accountsQuery.data ?? []).filter((a) => a.is_active !== false);

  useEffect(() => {
    if (!isOpen) return;
    setDirection(preset?.direction ?? "incoming");
    setDate(today());
    setAmount(preset?.defaultAmount ?? "");
    setAccountId("");
    setParty(preset?.partyName ? { id: "", name: preset.partyName } : null);
    setReference("");
    setNotes("");
    setLegs([]);
    setErrors({});
  }, [isOpen, preset]);

  const splitActive = defaultSplit || legs.length > 0;
  const totalLegsMinor = legs.reduce((sum, l) => sum + toMinor(l.amount), BigInt(0));
  const showMoney = (minor: bigint) => formatMinorAmount(minor.toString(), currency, EXPONENT);

  const openLegDrawer = (editIndex?: number) => {
    // If switching from a single selected account into split mode, seed the first leg automatically
    if (legs.length === 0 && accountId && toMinor(amount) > BigInt(0) && editIndex === undefined) {
      const firstAcct = accounts.find((a) => String(a.id) === accountId);
      if (firstAcct) {
        setLegs([
          {
            key: crypto.randomUUID(),
            accountId: String(firstAcct.id),
            accountName: firstAcct.name,
            amount,
          },
        ]);
      }
    }
    setLegDrawer({ key: Date.now(), editIndex });
  };

  const updateLegs = (next: SplitLeg[]) => {
    setLegs(next);
    const sum = next.reduce((acc, l) => acc + toMinor(l.amount), BigInt(0));
    if (sum > BigInt(0)) {
      setAmount(minorToMajor(sum));
    }
    setErrors((prev) => ({ ...prev, account: undefined, amount: undefined }));
  };

  const close = () => {
    setLegDrawer(null);
    onClose();
  };

  const create = useFinanceAction(
    workspaceId,
    async (_: void, key: string) => {
      const paymentLegs =
        legs.length > 0
          ? legs.map((leg) => ({
              money_account_id: Number(leg.accountId),
              amount: leg.amount,
            }))
          : [{ money_account_id: Number(accountId), amount }];

      const effectiveAmount = legs.length > 0 ? minorToMajor(totalLegsMinor) : amount;

      let targetType: string | undefined = preset?.linkedType;
      let targetId: number | undefined = preset?.linkedId;

      if (preset?.linkedType === "goods_receipt") {
        let billId = preset.billId ?? 0;
        let billStatus = preset.billStatus ?? "";
        let billVersion = preset.billVersion ?? 1;

        if (!billId) {
          const billRes = await financeApi.createSupplierBill(
            workspaceId,
            {
              goods_receipt_id: preset.linkedId,
              supplier_id: preset.supplierId ?? undefined,
              supplier_invoice_number: `INV-GR-${preset.linkedId}`,
              bill_date: date,
              currency,
              bill_type: "receipt",
            },
            `${key}-bill`,
          );
          billId = billRes.bill.id;
          billStatus = billRes.bill.status;
          billVersion = billRes.bill.version;
        }

        if (billStatus === "draft" || billStatus === "disputed") {
          await financeApi.approveSupplierBill(workspaceId, billId, billVersion, `${key}-approve`, true);
        }

        targetType = "supplier_bill";
        targetId = billId;
      }

      return financeApi.createPayment(
        workspaceId,
        {
          direction: preset?.direction ?? direction,
          payment_date: date,
          amount: effectiveAmount,
          currency,
          counterparty_id: preset?.supplierId || (party?.id ? Number(party.id) : undefined),
          counterparty_name: preset?.partyName || party?.name || undefined,
          linked_record_type: targetType,
          linked_record_id: targetId,
          payment_legs: paymentLegs,
          reference: reference.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        key,
      );
    },
    { success: "Payment recorded", onDone: close },
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    const effectiveMinor = legs.length > 0 ? totalLegsMinor : toMinor(amount);
    if (effectiveMinor <= BigInt(0)) {
      nextErrors.amount = "Enter the amount paid";
    }
    if (legs.length === 0 && !accountId) {
      nextErrors.account = "Choose an account";
    }
    if (!preset && !party?.name) {
      nextErrors.party = direction === "incoming" ? "Choose a customer" : "Choose a supplier";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    create.mutate();
  };

  const editingLeg = legDrawer?.editIndex !== undefined ? legs[legDrawer.editIndex] : undefined;
  const accountItems: PickerItem[] = accounts.map((a) => ({
    id: String(a.id),
    label: a.name,
    description: `${a.account_type.replace(/_/g, " ")} · ${a.currency}`,
  }));

  return (
    <FormDrawer
      isOpen={isOpen}
      onOpenChange={(open) => !open && close()}
      title={splitActive ? "Record split payment" : "Record payment"}
      description={preset?.summary ?? "Record money received or paid."}
      submitLabel="Confirm payment"
      isSubmitting={create.isPending}
      onSubmit={submit}
    >
      {preset ? (
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface-secondary px-3.5 py-2.5 text-[13px]">
          <span className="text-muted">{preset.direction === "incoming" ? "Customer" : "Supplier"}</span>
          <span className="font-semibold text-foreground">{preset.partyName}</span>
        </div>
      ) : (
        <>
          <AppSelect
            label="Type"
            options={DIRECTIONS}
            selectedKey={direction}
            onSelectionChange={(k) => setDirection((k as "incoming" | "outgoing") || "incoming")}
          />
          <ContactPicker
            workspaceId={workspaceId}
            kind={direction === "incoming" ? "customers" : "suppliers"}
            value={party}
            onChange={(val) => {
              setParty(val);
              if (errors.party) setErrors({ ...errors, party: undefined });
            }}
            error={errors.party}
          />
        </>
      )}

      {!splitActive ? (
        <>
          <MoneyInput
            label="Amount"
            isRequired
            currency={currency}
            exponent={EXPONENT}
            placeholder="0.00"
            value={amount}
            onValueChange={(val) => {
              setAmount(val);
              if (errors.amount) setErrors({ ...errors, amount: undefined });
            }}
            errorMessage={errors.amount}
          />
          <AccountPicker
            workspaceId={workspaceId}
            label={ (preset?.direction ?? direction) === "incoming" ? "Paid into" : "Paid from" }
            currency={currency}
            value={accountId}
            onChange={(id) => {
              setAccountId(id);
              if (errors.account) setErrors({ ...errors, account: undefined });
            }}
            error={errors.account}
            isRequired
          />
          <button
            type="button"
            onClick={() => openLegDrawer()}
            className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary-soft/40 px-3 py-2.5 text-left text-[13px] font-semibold text-primary-soft-foreground transition-colors hover:bg-primary-soft"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-white">
              <SplitHorizontal size={15} weight="bold" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 truncate">Split across multiple accounts</span>
          </button>
        </>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-foreground">
              Accounts ({showMoney(totalLegsMinor)} total)
            </span>
            <button
              type="button"
              onClick={() => setLegs([])}
              className="cursor-pointer text-[12px] font-semibold text-muted hover:text-foreground"
            >
              Use single account
            </button>
          </div>

          {legs.map((leg, idx) => (
            <div
              key={leg.key}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5"
            >
              <button
                type="button"
                onClick={() => openLegDrawer(idx)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-[12px] font-bold text-primary-soft-foreground">
                  {initialsOf(leg.accountName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-foreground">{leg.accountName}</span>
                  <span className="block text-[12px] text-primary font-semibold tabular">
                    {showMoney(toMinor(leg.amount))}
                  </span>
                </span>
                <PencilSimple size={15} className="shrink-0 text-muted" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => updateLegs(legs.filter((_, i) => i !== idx))}
                className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger"
                aria-label={`Remove ${leg.accountName}`}
              >
                <Trash size={15} />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => openLegDrawer()}
            className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary-soft/40 px-3 py-2.5 text-left text-[13px] font-semibold text-primary-soft-foreground transition-colors hover:bg-primary-soft"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-white">
              <Plus size={15} weight="bold" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 truncate">
              {legs.length === 0 ? "Add account payment" : "Add another account"}
            </span>
          </button>
          {errors.account || errors.amount ? (
            <p className="text-[12px] font-medium text-danger">{errors.account ?? errors.amount}</p>
          ) : null}
        </div>
      )}

      <AppInput label="Date" type="date" isRequired value={date} onChange={(e) => setDate(e.target.value)} />
      <AppInput label="Reference" placeholder="Optional" value={reference} onChange={(e) => setReference(e.target.value)} />
      <AppTextarea label="Notes" placeholder="Optional notes" value={notes} onChange={(e) => setNotes(e.target.value)} />

      {legDrawer ? (
        <PickerDrawer
          key={legDrawer.key}
          isOpen
          onOpenChange={(open) => !open && setLegDrawer(null)}
          title={editingLeg ? `Edit ${editingLeg.accountName}` : "Choose account"}
          items={accountItems}
          onSelect={() => undefined}
          searchPlaceholder="Search accounts"
          emptyText="No accounts found."
          editOnSelect
          formTitle="Account amount"
          startInForm={
            editingLeg
              ? { item: { id: editingLeg.accountId, label: editingLeg.accountName } }
              : undefined
          }
          renderCreate={({ item, done, cancel }) => (
            <SplitLegForm
              currency={currency}
              accountName={item?.label ?? editingLeg?.accountName ?? "Account"}
              initialAmount={editingLeg ? editingLeg.amount : ""}
              isEditing={Boolean(editingLeg)}
              onCancel={editingLeg ? () => setLegDrawer(null) : cancel}
              onSave={(legAmt) => {
                const acctId = item?.id ?? editingLeg?.accountId ?? "";
                const acctName = item?.label ?? editingLeg?.accountName ?? "Account";
                if (editingLeg && legDrawer.editIndex !== undefined) {
                  updateLegs(
                    legs.map((l, i) =>
                      i === legDrawer.editIndex ? { ...l, accountId: acctId, accountName: acctName, amount: legAmt } : l,
                    ),
                  );
                } else {
                  updateLegs([
                    ...legs,
                    { key: crypto.randomUUID(), accountId: acctId, accountName: acctName, amount: legAmt },
                  ]);
                }
                done({ id: acctId, label: acctName });
              }}
            />
          )}
        />
      ) : null}
    </FormDrawer>
  );
}

function SplitLegForm({
  currency,
  accountName,
  initialAmount,
  isEditing,
  onSave,
  onCancel,
}: {
  currency: string;
  accountName: string;
  initialAmount: string;
  isEditing: boolean;
  onSave: (amount: string) => void;
  onCancel: () => void;
}) {
  const [legAmount, setLegAmount] = useState(initialAmount);
  const [error, setError] = useState<string | undefined>();

  const submit = () => {
    if (toMinor(legAmount) <= BigInt(0)) {
      setError("Enter an amount for this account");
      return;
    }
    onSave(legAmount);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface-secondary px-3.5 py-2.5 text-[13px]">
        <span className="text-muted">Account: </span>
        <span className="font-semibold text-foreground">{accountName}</span>
      </div>
      <MoneyInput
        label="Amount from this account"
        isRequired
        autoFocus
        currency={currency}
        exponent={EXPONENT}
        placeholder="0.00"
        value={legAmount}
        onValueChange={(v) => {
          setLegAmount(v);
          if (error) setError(undefined);
        }}
        errorMessage={error}
      />
      <div className="flex gap-2 pt-2">
        <AppButton variant="ghost" label="Back" className="flex-1" onPress={onCancel} />
        <AppButton label={isEditing ? "Update" : "Add account"} className="flex-[2]" onPress={submit} />
      </div>
    </div>
  );
}
