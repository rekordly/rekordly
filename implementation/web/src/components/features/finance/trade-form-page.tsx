"use client";

// Full-page form for recording a sale or a purchase.
// 1. Who and when  2. Amount  3. Payment  (+ More options, collapsed)
// A live summary sits on the right; the action bar sticks to the bottom.
// Customers and suppliers are chosen in a drawer that can add a new one in place.

import { CalendarBlank, CheckCircle, Clock, HandCoins } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppTextarea } from "@/components/ui/app-textarea";
import { ChoiceCards, FormGrid, FormPage, FormSection, SuccessPanel, SummaryPanel } from "@/components/ui/form-kit";
import { AccountPicker, CategoryPicker, ContactPicker, type ContactValue } from "@/components/pickers";
import { MoneyInput } from "@/components/ui/money-input";
import { formatDate } from "@/lib/format";
import { financeApi, formatMinorAmount } from "@/lib/money";

import { today, useFinanceAction, WorkspaceGate, type WorkspaceInfo } from "./shared";

type Kind = "sale" | "purchase";
type PaymentStatus = "paid" | "part" | "unpaid";

const COPY = {
  sale: {
    title: "Record a sale",
    description: "What you sold, who bought it, and how they paid.",
    back: { href: "/sales", label: "Sales" },
    party: "Customer",
    partyPlural: "customers",
    fallback: "Walk-in customer",
    partyHint: "Leave blank for a walk-in customer.",
    amountLabel: "Total sale amount",
    accountLabel: "Paid into",
    paid: "Paid in full",
    part: "Part paid",
    unpaid: "Not paid yet",
    unpaidHint: "They owe you the full amount",
    save: "Save sale",
    saved: "Sale recorded",
    newOne: "Record another sale",
    list: "View sales",
  },
  purchase: {
    title: "Record a purchase",
    description: "What you bought, from whom, and how you paid.",
    back: { href: "/purchases", label: "Purchases" },
    party: "Supplier",
    partyPlural: "suppliers",
    fallback: "Unnamed supplier",
    partyHint: "Leave blank if you did not get the supplier's name.",
    amountLabel: "Total purchase amount",
    accountLabel: "Paid from",
    paid: "Paid in full",
    part: "Part paid",
    unpaid: "Not paid yet",
    unpaidHint: "You owe the supplier the full amount",
    save: "Save purchase",
    saved: "Purchase recorded",
    newOne: "Record another purchase",
    list: "View purchases",
  },
} as const;

const EXPONENT = 2;

/** "2,500.50" or "2500.5" → 250050 minor units, without floating point. */
function toMinor(major: string): bigint {
  const clean = major.replace(/,/g, "").trim();
  if (!/^\d*\.?\d*$/.test(clean) || clean === "" || clean === ".") return BigInt(0);
  const [whole = "0", fraction = ""] = clean.split(".");
  return BigInt(whole || "0") * BigInt(10 ** EXPONENT) + BigInt((fraction + "00").slice(0, EXPONENT));
}

interface Errors {
  amount?: string;
  date?: string;
  account?: string;
  paid?: string;
}

function TradeForm({ workspaceId, currency, kind }: WorkspaceInfo & { kind: Kind }) {
  const copy = COPY[kind];
  const router = useRouter();
  const [party, setParty] = useState<ContactValue | null>(null);
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<PaymentStatus>("paid");
  const [accountId, setAccountId] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [saved, setSaved] = useState<{ total: bigint; paid: bigint; party: string } | null>(null);

  const total = toMinor(amount);
  const paidNow = status === "paid" ? total : status === "part" ? toMinor(paidAmount) : BigInt(0);
  const balance = total - paidNow > BigInt(0) ? total - paidNow : BigInt(0);
  const show = (minor: bigint) => formatMinorAmount(minor.toString(), currency, EXPONENT);

  const validate = (): Errors => {
    const next: Errors = {};
    if (total <= BigInt(0)) next.amount = "Enter an amount greater than zero";
    if (!date) next.date = "Choose a date";
    if (status !== "unpaid" && !accountId) next.account = `Choose where the money was ${kind === "sale" ? "paid into" : "paid from"}`;
    if (status === "part") {
      const part = toMinor(paidAmount);
      if (part <= BigInt(0)) next.paid = "Enter how much was paid";
      else if (part >= total) next.paid = "For the full amount, choose “Paid in full”";
    }
    return next;
  };

  const create = useFinanceAction(
    workspaceId,
    async (_: void, key: string) => {
      const partyId = party ? Number(party.id) : undefined;
      const legs =
        status === "unpaid" ? undefined : [{ money_account_id: Number(accountId), ...(status === "part" ? { amount: paidAmount.replace(/,/g, "") } : {}) }];
      const common = { currency, amount: amount.replace(/,/g, ""), reference: reference.trim() || undefined, notes: notes.trim() || undefined, payment_legs: legs };
      return kind === "sale"
        ? financeApi.createSale(workspaceId, { ...common, customer_id: partyId, customer_name: party?.name || copy.fallback, sale_date: date }, key)
        : financeApi.createPurchase(
            workspaceId,
            { ...common, supplier_id: partyId, supplier_name: party?.name || copy.fallback, purchase_date: date, category_id: categoryId ? Number(categoryId) : undefined },
            key,
          );
    },
    {
      success: copy.saved,
      onDone: () => setSaved({ total, paid: paidNow, party: party?.name || copy.fallback }),
    },
  );

  const submit = () => {
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length === 0) create.mutate();
  };

  const reset = () => {
    setSaved(null);
    setParty(null);
    setDate(today());
    setAmount("");
    setStatus("paid");
    setPaidAmount("");
    setReference("");
    setNotes("");
    setErrors({});
  };

  if (saved) {
    const owed = saved.total - saved.paid;
    return (
      <SuccessPanel
        title={copy.saved}
        description={
          <>
            {show(saved.total)} {kind === "sale" ? "to" : "from"} {saved.party}.{" "}
            {owed > BigInt(0) ? `${show(owed)} is still ${kind === "sale" ? "to collect" : "to pay"}.` : "Fully paid."}
          </>
        }
      >
        <AppButton label={copy.newOne} onPress={reset} />
        <AppButton variant="secondary" label={copy.list} onPress={() => router.push(copy.back.href)} />
      </SuccessPanel>
    );
  }

  return (
    <FormPage
      title={copy.title}
      description={copy.description}
      back={copy.back}
      aside={
        <SummaryPanel
          rows={[
            { label: copy.party, value: party?.name ?? copy.fallback, tone: party ? "strong" : "muted" },
            { label: "Date", value: date ? formatDate(date) : "—" },
            { label: "Paid now", value: show(paidNow), tone: paidNow > BigInt(0) ? "positive" : "muted" },
            { label: kind === "sale" ? "Still to collect" : "Still to pay", value: show(balance), tone: balance > BigInt(0) ? "negative" : "muted" },
          ]}
          total={{ label: "Total", value: show(total) }}
          note={status === "unpaid" ? copy.unpaidHint : undefined}
        />
      }
      actions={
        <>
          <Link href={copy.back.href} className="inline-flex h-10 items-center rounded-full px-5 text-[14px] font-medium text-muted transition-colors hover:bg-surface-secondary hover:text-foreground">
            Cancel
          </Link>
          <AppButton label={copy.save} isLoading={create.isPending} onPress={submit} className="min-w-36" />
        </>
      }
    >
      <FormSection step={1} title="Who and when" description={copy.partyHint}>
        <ContactPicker workspaceId={workspaceId} kind={kind === "sale" ? "customers" : "suppliers"} value={party} onChange={setParty} />
        <FormGrid>
          <AppInput
            label="Date"
            type="date"
            isRequired
            value={date}
            max={today()}
            startContent={<CalendarBlank />}
            onChange={(event) => setDate(event.target.value)}
            errorMessage={errors.date}
          />
          {kind === "purchase" ? (
            <CategoryPicker workspaceId={workspaceId} direction="money_out" value={categoryId} onChange={setCategoryId} />
          ) : null}
        </FormGrid>
      </FormSection>

      <FormSection step={2} title="Amount" description="The full value, even if only part was paid.">
        <MoneyInput
          label={copy.amountLabel}
          isRequired
          size="lg"
          currency={currency}
          exponent={EXPONENT}
          placeholder="0.00"
          value={amount}
          onValueChange={(value) => {
            setAmount(value);
            if (errors.amount) setErrors({ ...errors, amount: undefined });
          }}
          errorMessage={errors.amount}
        />
      </FormSection>

      <FormSection step={3} title="Payment" description="How much has been paid so far.">
        <ChoiceCards<PaymentStatus>
          label="Payment status"
          value={status}
          onChange={(value) => {
            setStatus(value);
            setErrors({ ...errors, account: undefined, paid: undefined });
          }}
          options={[
            { key: "paid", label: copy.paid, description: "Settled today", icon: CheckCircle },
            { key: "part", label: copy.part, description: "Some now, the rest later", icon: HandCoins },
            { key: "unpaid", label: copy.unpaid, description: "Record the payment later", icon: Clock },
          ]}
        />
        {status !== "unpaid" ? (
          <div className="animate-fade-up">
            <FormGrid>
              <AccountPicker
                workspaceId={workspaceId}
                label={copy.accountLabel}
                currency={currency}
                value={accountId}
                onChange={(id) => {
                  setAccountId(id);
                  if (errors.account) setErrors({ ...errors, account: undefined });
                }}
                error={errors.account}
                isRequired
              />
              {status === "part" ? (
                <MoneyInput
                  label="Amount paid now"
                  isRequired
                  currency={currency}
                  exponent={EXPONENT}
                  placeholder="0.00"
                  value={paidAmount}
                  onValueChange={(value) => {
                    setPaidAmount(value);
                    if (errors.paid) setErrors({ ...errors, paid: undefined });
                  }}
                  errorMessage={errors.paid}
                  description={total > BigInt(0) ? `Of ${show(total)}` : undefined}
                />
              ) : null}
            </FormGrid>
          </div>
        ) : null}
      </FormSection>

      <FormSection title="More options" description="Reference and notes, if you need them." collapsible defaultOpen={false}>
        <AppInput label="Reference" placeholder={kind === "sale" ? "Receipt or order number" : "Supplier invoice number"} value={reference} onChange={(event) => setReference(event.target.value)} />
        <AppTextarea label="Notes" placeholder="Anything worth remembering" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </FormSection>

    </FormPage>
  );
}

export function TradeFormPage({ kind }: { kind: Kind }) {
  return (
    <WorkspaceGate businessOnly>{(workspace) => <TradeForm key={workspace.workspaceId} {...workspace} kind={kind} />}</WorkspaceGate>
  );
}

