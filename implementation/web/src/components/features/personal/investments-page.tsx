"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChartLineUp, Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader, StatusPill } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { formatDate } from "@/lib/format";
import { formatMinorAmount } from "@/lib/money";
import { personalApi, personalKeys } from "@/lib/personal-finance";
import {
  investmentCreateSchema,
  investmentEventSchema,
  manualValuationSchema,
  type InvestmentCreateValues,
  type InvestmentEventValues,
  type ManualValuationValues,
} from "@/lib/schemas/personal-finance.schemas";
import type { InvestmentRecord } from "@/types/personal-finance";

import { MoneyField, NotesField, SelectField, TextInputField } from "../finance/fields";
import { useFinanceAction, WorkspaceGate, type WorkspaceInfo } from "../finance/shared";
import { AccountField } from "@/components/pickers";

const INVESTMENT_TYPES = [
  { key: "shares_funds", label: "Shares & funds" },
  { key: "fixed_income", label: "Fixed income / T-Bills" },
  { key: "crypto", label: "Digital asset (manual)" },
  { key: "cooperative", label: "Cooperative contribution" },
  { key: "other", label: "Other investment" },
];

const EVENT_TYPES = [
  { key: "purchase", label: "Purchase / Contribution" },
  { key: "income", label: "Income / Distribution" },
  { key: "disposal", label: "Disposal / Sale" },
  { key: "opening", label: "Opening balance (no cash movement)" },
];

function InvestmentsContent({ workspaceId, currency, isBusiness }: WorkspaceInfo) {
  const [createOpen, setCreateOpen] = useState(false);
  const [eventInv, setEventInv] = useState<InvestmentRecord | null>(null);
  const [valInv, setValInv] = useState<InvestmentRecord | null>(null);

  const investments = useQuery({
    queryKey: personalKeys.investments(workspaceId),
    queryFn: () => personalApi.listInvestments(workspaceId),
    enabled: !isBusiness,
  });
  const today = new Date().toISOString().split("T")[0];

  const createForm = useForm<InvestmentCreateValues>({
    resolver: zodResolver(investmentCreateSchema),
    defaultValues: { name: "", investment_type: "shares_funds", institution_name: "", notes: "" },
  });

  const eventForm = useForm<InvestmentEventValues>({
    resolver: zodResolver(investmentEventSchema),
    defaultValues: { event_type: "purchase", effective_date: today, amount: "", units_delta: "0", money_account_id: "", notes: "" },
  });

  const valForm = useForm<ManualValuationValues>({
    resolver: zodResolver(manualValuationSchema),
    defaultValues: { valuation_date: today, value: "", source: "user_manual", notes: "" },
  });

  const createInv = useFinanceAction(
    workspaceId,
    (v: InvestmentCreateValues, key: string) =>
      personalApi.createInvestment(workspaceId, { ...v, currency }, key),
    {
      success: "Investment shell created",
      onDone: () => {
        setCreateOpen(false);
        createForm.reset();
        investments.refetch();
      },
    },
  );

  const recordEv = useFinanceAction(
    workspaceId,
    (v: InvestmentEventValues, key: string) =>
      personalApi.recordInvestmentEvent(
        workspaceId,
        {
          investment_id: eventInv!.id,
          event_type: v.event_type,
          effective_date: v.effective_date,
          amount: v.amount,
          units_delta: v.units_delta || "0",
          money_account_id: v.event_type === "opening" || !v.money_account_id ? undefined : Number(v.money_account_id),
          notes: v.notes || undefined,
        },
        key,
      ),
    {
      success: "Investment event recorded",
      onDone: () => {
        setEventInv(null);
        eventForm.reset();
        investments.refetch();
      },
    },
  );

  const recordVal = useFinanceAction(
    workspaceId,
    (v: ManualValuationValues) =>
      personalApi.recordInvestmentValuation(workspaceId, valInv!.id, v),
    {
      success: "Manual valuation saved",
      onDone: () => {
        setValInv(null);
        valForm.reset();
        investments.refetch();
      },
    },
  );

  if (isBusiness) {
    return (
      <Page>
        <PageHeader title="Investments" description="Switch to your Personal space to track manual investments." />
        <Alert status="info" description="Personal investments are strictly separated from Business books." />
      </Page>
    );
  }

  const evType = eventForm.watch("event_type");
  const rows = investments.data ?? [];

  return (
    <Page>
      <PageHeader
        title="Investments"
        description="Manual investment tracking. Valuations are user-entered estimates with date and source, never live market advice."
        actions={<AppButton startContent={<Plus weight="bold" />} label="Add investment" onPress={() => setCreateOpen(true)} />}
      />

      <DataView
        title="Investments"
        rows={rows}
        rowKey={(r) => r.id}
        isLoading={investments.isPending}
        isError={investments.isError}
        columns={[
          {
            key: "name",
            label: "Investment",
            render: (r) => (
              <div className="min-w-0">
                <p className="font-medium text-foreground">{r.name}</p>
                <p className="text-xs text-muted">
                  {r.investment_type.replace(/_/g, " ")}
                  {r.institution_name ? ` · ${r.institution_name}` : ""}
                </p>
              </div>
            ),
          },
          {
            key: "cost",
            label: "Cost basis",
            align: "right",
            render: (r) => <span className="tabular">{formatMinorAmount(r.cost_basis_minor, r.currency, r.currency_exponent)}</span>,
          },
          {
            key: "valuation",
            label: "Manual valuation",
            align: "right",
            render: (r) =>
              r.latest_manual_value_minor ? (
                <div className="text-right">
                  <span className="tabular font-medium">
                    {formatMinorAmount(r.latest_manual_value_minor, r.currency, r.currency_exponent)}
                  </span>
                  <p className="text-[11px] text-muted">
                    Est. {r.latest_valuation_date ? formatDate(r.latest_valuation_date) : ""} ({r.latest_valuation_source ?? "manual"})
                  </p>
                </div>
              ) : (
                <span className="text-xs text-muted">Not valued</span>
              ),
          },
          {
            key: "status",
            label: "Status",
            render: (r) => <StatusPill tone={r.status === "active" ? "success" : "neutral"}>{r.status}</StatusPill>,
          },
          {
            key: "actions",
            label: "",
            align: "right",
            render: (r) => (
              <div className="flex items-center justify-end gap-2">
                {r.status !== "disposed" ? (
                  <>
                    <AppButton size="sm" variant="secondary" label="Record event" onPress={() => setEventInv(r)} />
                    <AppButton size="sm" variant="ghost" label="Update value" onPress={() => setValInv(r)} />
                  </>
                ) : null}
              </div>
            ),
          },
        ]}
        renderCard={(r) => (
          <RecordCard
            icon={<ChartLineUp size={18} weight="duotone" aria-hidden="true" />}
            reference={r.institution_name ?? r.investment_type.replace(/_/g, " ")}
            title={r.name}
            amount={formatMinorAmount(r.cost_basis_minor, r.currency, r.currency_exponent)}
            status={<StatusPill tone={r.status === "active" ? "success" : "neutral"}>{r.status}</StatusPill>}
            meta={[
              {
                label: "Manual estimate",
                value: r.latest_manual_value_minor
                  ? formatMinorAmount(r.latest_manual_value_minor, r.currency, r.currency_exponent)
                  : "None",
              },
              { label: "Units", value: r.total_units },
            ]}
            actions={
              r.status !== "disposed" ? (
                <div className="flex gap-2">
                  <AppButton size="sm" variant="secondary" label="Event" onPress={() => setEventInv(r)} />
                  <AppButton size="sm" variant="ghost" label="Value" onPress={() => setValInv(r)} />
                </div>
              ) : null
            }
          />
        )}
        empty={
          <EmptyState
            icon={ChartLineUp}
            title="No investments yet"
            description="Track shares, fixed income, cooperative contributions, and manual valuation snapshots without mixing them into everyday expenses."
            action={<AppButton startContent={<Plus weight="bold" />} label="Add investment" onPress={() => setCreateOpen(true)} />}
          />
        }
      />

      <FormDrawer
        isOpen={createOpen}
        onOpenChange={setCreateOpen}
        title="Add investment"
        description="Creates an investment shell. Record a purchase or opening balance next."
        submitLabel="Create investment"
        isSubmitting={createInv.isPending}
        onSubmit={createForm.handleSubmit((v) => createInv.mutate(v))}
      >
        <TextInputField control={createForm.control} name="name" label="Name" placeholder="e.g. FGN Savings Bond" />
        <SelectField control={createForm.control} name="investment_type" label="Type" options={INVESTMENT_TYPES} />
        <TextInputField control={createForm.control} name="institution_name" label="Institution / platform (optional)" placeholder="e.g. Stanbic IBTC" />
        <NotesField control={createForm.control} name="notes" label="Notes" />
      </FormDrawer>

      <FormDrawer
        isOpen={Boolean(eventInv)}
        onOpenChange={(open) => { if (!open) setEventInv(null); }}
        title={eventInv ? `Record event — ${eventInv.name}` : "Record investment event"}
        description="Purchases are cash outflows (not lifestyle expense). Income/distributions post to Investment Income."
        submitLabel="Confirm event"
        isSubmitting={recordEv.isPending}
        onSubmit={eventForm.handleSubmit((v) => recordEv.mutate(v))}
      >
        <SelectField control={eventForm.control} name="event_type" label="Event type" options={EVENT_TYPES} />
        <TextInputField control={eventForm.control} name="effective_date" label="Effective date" type="date" />
        <MoneyField control={eventForm.control} name="amount" label="Amount" currency={currency} exponent={2} />
        <TextInputField control={eventForm.control} name="units_delta" label="Units (optional)" placeholder="0" />
        {evType !== "opening" ? (
          <AccountField control={eventForm.control} name="money_account_id" label="Money account" workspaceId={workspaceId} />
        ) : null}
        <NotesField control={eventForm.control} name="notes" label="Notes" />
      </FormDrawer>

      <FormDrawer
        isOpen={Boolean(valInv)}
        onOpenChange={(open) => { if (!open) setValInv(null); }}
        title={valInv ? `Manual valuation — ${valInv.name}` : "Manual valuation"}
        description="Informational estimate only. Does not overwrite acquisition cost basis or post unrealized gain/loss."
        submitLabel="Save estimate"
        isSubmitting={recordVal.isPending}
        onSubmit={valForm.handleSubmit((v) => recordVal.mutate(v))}
      >
        <TextInputField control={valForm.control} name="valuation_date" label="As-of date" type="date" />
        <MoneyField control={valForm.control} name="value" label="Estimated total value" currency={currency} exponent={2} />
        <TextInputField control={valForm.control} name="source" label="Source" placeholder="e.g. user_manual or broker_statement" />
        <NotesField control={valForm.control} name="notes" label="Notes" />
      </FormDrawer>
    </Page>
  );
}

export function InvestmentsPage() {
  return (
    <WorkspaceGate>
      {(info) => <InvestmentsContent {...info} />}
    </WorkspaceGate>
  );
}
