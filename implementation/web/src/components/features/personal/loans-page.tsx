"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowCounterClockwise, HandCoins, Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader, Segmented, StatusPill } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { formatDate } from "@/lib/format";
import { formatMinorAmount } from "@/lib/money";
import { personalApi, personalKeys } from "@/lib/personal-finance";
import {
  loanCreateSchema,
  loanRepaymentSchema,
  type LoanCreateValues,
  type LoanRepaymentValues,
} from "@/lib/schemas/personal-finance.schemas";
import type { LoanDetail, LoanEvent } from "@/types/personal-finance";

import { MoneyField, NotesField, SelectField, TextInputField } from "../finance/fields";
import { useAccountOptions, useFinanceAction, WorkspaceGate, type WorkspaceInfo } from "../finance/shared";

const TABS = [
  { key: "all", label: "All loans" },
  { key: "borrowed", label: "Borrowed" },
  { key: "lent", label: "Lent" },
] as const;

const DIRECTIONS = [
  { key: "borrowed", label: "Money I borrowed (Liability)" },
  { key: "lent", label: "Money I lent (Receivable)" },
];

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "repaid":
      return "success";
    case "overdue":
      return "danger";
    case "partially_repaid":
      return "warning";
    default:
      return "neutral";
  }
}

function LoansContent({ workspaceId, currency, isBusiness }: WorkspaceInfo) {
  const [tab, setTab] = useState<"all" | "borrowed" | "lent">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [repayLoan, setRepayLoan] = useState<LoanDetail | null>(null);
  const [selectedLoan, setSelectedLoan] = useState<LoanDetail | null>(null);
  const [reversingEvent, setReversingEvent] = useState<{ loanId: number; event: LoanEvent } | null>(null);

  const loans = useQuery({
    queryKey: [...personalKeys.loans(workspaceId), tab],
    queryFn: () => personalApi.listLoans(workspaceId, tab === "all" ? undefined : { direction: tab }),
    enabled: !isBusiness,
  });

  const detail = useQuery({
    queryKey: [...personalKeys.loans(workspaceId), "detail", selectedLoan?.loan.id],
    queryFn: () => personalApi.getLoan(workspaceId, selectedLoan!.loan.id),
    enabled: Boolean(selectedLoan) && !isBusiness,
  });

  const accounts = useAccountOptions(workspaceId);
  const today = new Date().toISOString().split("T")[0];

  const createForm = useForm<LoanCreateValues>({
    resolver: zodResolver(loanCreateSchema),
    defaultValues: {
      direction: "borrowed",
      counterparty_name: "",
      principal: "",
      start_date: today,
      due_date: "",
      money_account_id: "",
      is_opening_balance: false,
      notes: "",
    },
  });

  const repayForm = useForm<LoanRepaymentValues>({
    resolver: zodResolver(loanRepaymentSchema),
    defaultValues: {
      money_account_id: "",
      effective_date: today,
      total_amount: "",
      principal: "",
      interest: "0",
      fee: "0",
      notes: "",
    },
  });

  const createLoan = useFinanceAction(
    workspaceId,
    (values: LoanCreateValues, key: string) => {
      const payload = {
        counterparty_name: values.counterparty_name,
        principal: values.principal,
        currency,
        start_date: values.start_date,
        due_date: values.due_date || undefined,
        money_account_id: values.is_opening_balance || !values.money_account_id ? undefined : Number(values.money_account_id),
        is_opening_balance: values.is_opening_balance,
        notes: values.notes || undefined,
      };
      return values.direction === "borrowed"
        ? personalApi.openBorrowedLoan(workspaceId, payload, key)
        : personalApi.lendMoney(workspaceId, payload, key);
    },
    {
      success: "Loan recorded",
      onDone: () => {
        setCreateOpen(false);
        createForm.reset();
        loans.refetch();
      },
    },
  );

  const recordRepayment = useFinanceAction(
    workspaceId,
    (values: LoanRepaymentValues, key: string) =>
      personalApi.recordLoanRepayment(
        workspaceId,
        {
          loan_id: repayLoan!.loan.id,
          money_account_id: Number(values.money_account_id),
          effective_date: values.effective_date,
          total_amount: values.total_amount,
          principal: values.principal,
          interest: values.interest || "0",
          fee: values.fee || "0",
          notes: values.notes || undefined,
        },
        key,
      ),
    {
      success: "Repayment recorded",
      onDone: () => {
        setRepayLoan(null);
        repayForm.reset();
        loans.refetch();
        detail.refetch();
      },
    },
  );

  const reverseEvent = useFinanceAction(
    workspaceId,
    (item: { loanId: number; event: LoanEvent }) =>
      personalApi.reverseLoanEvent(workspaceId, item.loanId, item.event.id, "User reversal"),
    {
      success: "Repayment reversed",
      onDone: () => {
        setReversingEvent(null);
        loans.refetch();
        detail.refetch();
      },
    },
  );

  if (isBusiness) {
    return (
      <Page>
        <PageHeader title="Personal Loans" description="Switch to your Personal space to track borrowed and lent money." />
        <Alert status="info" description="Personal loans are strictly private to your Personal workspace." />
      </Page>
    );
  }

  const isOpening = createForm.watch("is_opening_balance");
  const rows = loans.data ?? [];

  return (
    <Page>
      <PageHeader
        title="Loans"
        description="Track money you borrowed or lent. Principal is never treated as income or expense."
        actions={<AppButton startContent={<Plus weight="bold" />} label="Record loan" onPress={() => setCreateOpen(true)} />}
      />

      <Segmented aria-label="Loan direction filter" options={TABS} value={tab} onChange={setTab} />

      <DataView
        title="Loans"
        rows={rows}
        rowKey={(r) => r.loan.id}
        isLoading={loans.isPending}
        isError={loans.isError}
        columns={[
          {
            key: "counterparty",
            label: "Counterparty",
            render: (r) => (
              <div className="min-w-0">
                <p className="font-medium text-foreground">{r.loan.counterparty_name}</p>
                <p className="text-xs text-muted">
                  {r.loan.direction === "borrowed" ? "Borrowed (Liability)" : "Lent (Receivable)"}
                  {r.loan.is_opening_balance ? " · Opening balance" : ""}
                </p>
              </div>
            ),
          },
          {
            key: "principal",
            label: "Original",
            align: "right",
            render: (r) => <span className="tabular">{formatMinorAmount(r.loan.principal_minor, r.loan.currency, r.loan.currency_exponent)}</span>,
          },
          {
            key: "outstanding",
            label: "Outstanding",
            align: "right",
            render: (r) => (
              <span className="tabular font-semibold">
                {formatMinorAmount(r.loan.outstanding_principal_minor, r.loan.currency, r.loan.currency_exponent)}
              </span>
            ),
          },
          {
            key: "due",
            label: "Due date",
            render: (r) => <span className="text-xs text-muted">{r.loan.due_date ? formatDate(r.loan.due_date) : "—"}</span>,
          },
          {
            key: "status",
            label: "Status",
            render: (r) => <StatusPill tone={statusTone(r.derived_status)}>{r.derived_status.replace(/_/g, " ")}</StatusPill>,
          },
          {
            key: "actions",
            label: "",
            align: "right",
            render: (r) => (
              <div className="flex items-center justify-end gap-2">
                {r.loan.outstanding_principal_minor !== "0" && r.loan.status !== "reversed" ? (
                  <AppButton size="sm" variant="secondary" label="Repay" onPress={() => setRepayLoan(r)} />
                ) : null}
                <AppButton size="sm" variant="ghost" label="History" onPress={() => setSelectedLoan(r)} />
              </div>
            ),
          },
        ]}
        renderCard={(r) => (
          <RecordCard
            icon={<HandCoins size={18} weight="duotone" aria-hidden="true" />}
            reference={r.loan.direction === "borrowed" ? "Borrowed" : "Lent"}
            title={r.loan.counterparty_name}
            amount={formatMinorAmount(r.loan.outstanding_principal_minor, r.loan.currency, r.loan.currency_exponent)}
            status={<StatusPill tone={statusTone(r.derived_status)}>{r.derived_status.replace(/_/g, " ")}</StatusPill>}
            meta={[
              { label: "Original", value: formatMinorAmount(r.loan.principal_minor, r.loan.currency, r.loan.currency_exponent) },
              { label: "Due", value: r.loan.due_date ? formatDate(r.loan.due_date) : "No due date" },
            ]}
            actions={
              <div className="flex gap-2">
                {r.loan.outstanding_principal_minor !== "0" ? (
                  <AppButton size="sm" variant="secondary" label="Repay" onPress={() => setRepayLoan(r)} />
                ) : null}
                <AppButton size="sm" variant="ghost" label="History" onPress={() => setSelectedLoan(r)} />
              </div>
            }
          />
        )}
        empty={
          <EmptyState
            icon={HandCoins}
            title="No loans recorded yet"
            description="Track money you borrowed or lent, split principal from interest, and prevent overpayment."
            action={<AppButton startContent={<Plus weight="bold" />} label="Record loan" onPress={() => setCreateOpen(true)} />}
          />
        }
      />

      <FormDrawer
        isOpen={createOpen}
        onOpenChange={setCreateOpen}
        title="Record loan"
        description="Borrowed principal is a liability (not income). Lent principal is a receivable (not expense)."
        submitLabel="Save loan"
        isSubmitting={createLoan.isPending}
        onSubmit={createForm.handleSubmit((v) => createLoan.mutate(v))}
      >
        <SelectField control={createForm.control} name="direction" label="Direction" options={DIRECTIONS} />
        <TextInputField control={createForm.control} name="counterparty_name" label="Counterparty" placeholder="e.g. Chidi or Access Bank" />
        <MoneyField control={createForm.control} name="principal" label="Principal amount" currency={currency} exponent={2} />
        <div className="grid grid-cols-2 gap-3">
          <TextInputField control={createForm.control} name="start_date" label="Start date" type="date" />
          <TextInputField control={createForm.control} name="due_date" label="Due date (optional)" type="date" />
        </div>
        <label className="flex items-center gap-2 text-xs text-foreground">
          <input type="checkbox" {...createForm.register("is_opening_balance")} />
          Opening loan balance (already existed before Rekordly — no current cash movement)
        </label>
        {!isOpening ? (
          <SelectField control={createForm.control} name="money_account_id" label="Receiving / paying account" options={accounts.options} />
        ) : null}
        <NotesField control={createForm.control} name="notes" label="Notes" />
      </FormDrawer>

      <FormDrawer
        isOpen={Boolean(repayLoan)}
        onOpenChange={(open) => { if (!open) setRepayLoan(null); }}
        title="Record loan repayment"
        description={
          repayLoan
            ? `Outstanding principal: ${formatMinorAmount(
                repayLoan.loan.outstanding_principal_minor,
                repayLoan.loan.currency,
                repayLoan.loan.currency_exponent,
              )}. Principal + Interest + Fee must equal Total.`
            : undefined
        }
        submitLabel="Confirm repayment"
        isSubmitting={recordRepayment.isPending}
        onSubmit={repayForm.handleSubmit((v) => recordRepayment.mutate(v))}
      >
        <SelectField control={repayForm.control} name="money_account_id" label="Account" options={accounts.options} />
        <TextInputField control={repayForm.control} name="effective_date" label="Date" type="date" />
        <MoneyField control={repayForm.control} name="total_amount" label="Total payment" currency={currency} exponent={2} />
        <MoneyField control={repayForm.control} name="principal" label="Principal portion" currency={currency} exponent={2} />
        <div className="grid grid-cols-2 gap-3">
          <MoneyField control={repayForm.control} name="interest" label="Interest portion" currency={currency} exponent={2} />
          <MoneyField control={repayForm.control} name="fee" label="Fee portion" currency={currency} exponent={2} />
        </div>
        <NotesField control={repayForm.control} name="notes" label="Notes" />
      </FormDrawer>

      <FormDrawer
        isOpen={Boolean(selectedLoan)}
        onOpenChange={(open) => { if (!open) setSelectedLoan(null); }}
        title={selectedLoan ? `${selectedLoan.loan.counterparty_name} — History` : "Loan History"}
        description="Immutable event log. Reverse erroneous repayments to restore principal."
        submitLabel="Close"
        onSubmit={(e) => {
          e.preventDefault();
          setSelectedLoan(null);
        }}
      >
        {detail.data ? (
          <div className="space-y-3">
            {detail.data.events.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between rounded-xl border border-border p-3 text-xs">
                <div>
                  <p className="font-semibold capitalize">{ev.event_type.replace(/_/g, " ")}</p>
                  <p className="text-muted">
                    {formatDate(ev.effective_date)} · Principal{" "}
                    {formatMinorAmount(ev.principal_minor, detail.data.loan.currency, detail.data.loan.currency_exponent)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular font-medium">
                    {formatMinorAmount(ev.total_amount_minor, detail.data.loan.currency, detail.data.loan.currency_exponent)}
                  </span>
                  {ev.event_type === "repayment" && !ev.is_reversed ? (
                    <AppButton
                      size="sm"
                      variant="ghost"
                      startContent={<ArrowCounterClockwise size={14} />}
                      label="Reverse"
                      onPress={() => setReversingEvent({ loanId: detail.data.loan.id, event: ev })}
                    />
                  ) : ev.is_reversed ? (
                    <StatusPill tone="neutral">Reversed</StatusPill>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">Loading loan events...</p>
        )}
      </FormDrawer>

      <ConfirmDialog
        isOpen={Boolean(reversingEvent)}
        onOpenChange={(open) => { if (!open) setReversingEvent(null); }}
        title="Reverse loan repayment?"
        description="This creates a reversing entry and restores the outstanding loan principal."
        confirmLabel="Reverse repayment"
        isLoading={reverseEvent.isPending}
        onConfirm={() => {
          if (reversingEvent) reverseEvent.mutate(reversingEvent);
        }}
      />
    </Page>
  );
}

export function LoansPage() {
  return (
    <WorkspaceGate>
      {(info) => <LoansContent {...info} />}
    </WorkspaceGate>
  );
}
