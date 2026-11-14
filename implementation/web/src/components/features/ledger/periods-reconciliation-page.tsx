"use client";

import { ArrowsClockwise, CalendarCheck, CheckCircle, Lock, LockOpen, Plus, WarningCircle } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader, Segmented, StatusPill } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { formatDate } from "@/lib/format";
import { ledgerApi, ledgerKeys } from "@/lib/ledger";
import { formatMinorAmount } from "@/lib/money";
import type { AccountingPeriod, PeriodCloseChecklistResult, ReconciliationRunDetail } from "@/types/ledger";

import { useFinanceAction, WorkspaceGate, type WorkspaceInfo } from "../finance/shared";
import { PeriodStats } from "../finance/section-stats";

const TABS = [
  { key: "periods", label: "Accounting Periods" },
  { key: "recon", label: "Subledger Reconciliation" },
] as const;

function PeriodsReconContent({ workspaceId, currency }: WorkspaceInfo) {
  const [tab, setTab] = useState<"periods" | "recon">("periods");
  const [createOpen, setCreateOpen] = useState(false);
  const [checklist, setChecklist] = useState<PeriodCloseChecklistResult | null>(null);
  const [reopenTarget, setReopenTarget] = useState<AccountingPeriod | null>(null);
  const [reopenReason, setReopenReason] = useState("");

  const now = new Date();
  const [pName, setPName] = useState(format(now, "MMMM yyyy"));
  const [pStart, setPStart] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [pEnd, setPEnd] = useState(format(endOfMonth(now), "yyyy-MM-dd"));

  const periods = useQuery({
    queryKey: ledgerKeys.periods(workspaceId),
    queryFn: () => ledgerApi.listPeriods(workspaceId),
  });

  const recons = useQuery({
    queryKey: ledgerKeys.reconciliations(workspaceId),
    queryFn: () => ledgerApi.listReconciliations(workspaceId),
    enabled: tab === "recon",
  });

  const createPeriod = useFinanceAction(
    workspaceId,
    () => ledgerApi.createPeriod(workspaceId, { name: pName, start_date: pStart, end_date: pEnd, reporting_currency: currency }),
    {
      success: "Accounting period created",
      onDone: () => {
        setCreateOpen(false);
        periods.refetch();
      },
    },
  );

  const runChecklist = useFinanceAction(
    workspaceId,
    (periodId: number) => ledgerApi.runPeriodChecklist(workspaceId, periodId),
    {
      success: "Close checklist evaluated",
      onDone: (res) => setChecklist(res as PeriodCloseChecklistResult),
    },
  );

  const closePeriod = useFinanceAction(
    workspaceId,
    (periodId: number) => ledgerApi.closePeriod(workspaceId, periodId),
    { success: "Period closed", onDone: () => periods.refetch() },
  );

  const lockPeriod = useFinanceAction(
    workspaceId,
    (periodId: number) => ledgerApi.lockPeriod(workspaceId, periodId),
    { success: "Period locked", onDone: () => periods.refetch() },
  );

  const reopenPeriod = useFinanceAction(
    workspaceId,
    (periodId: number) => ledgerApi.reopenPeriod(workspaceId, periodId, reopenReason),
    {
      success: "Period reopened",
      onDone: () => {
        setReopenTarget(null);
        setReopenReason("");
        periods.refetch();
      },
    },
  );

  const runRecon = useFinanceAction(
    workspaceId,
    () => ledgerApi.runReconciliation(workspaceId),
    { success: "Subledger reconciliation completed", onDone: () => recons.refetch() },
  );

  const runRebuild = useFinanceAction(
    workspaceId,
    (_: void, key: string) => ledgerApi.runProjectionRebuild(workspaceId, "all", key),
    { success: "Projection rebuild verified" },
  );

  return (
    <Page>
      <PageHeader
        title="Periods & Reconciliation"
        description="Enforce period close gates, lock historical periods, and verify GL control accounts against subledgers."
        actions={
          tab === "periods" ? (
            <AppButton startContent={<Plus weight="bold" />} label="New period" onPress={() => setCreateOpen(true)} />
          ) : (
            <div className="flex gap-2">
              <AppButton variant="secondary" label="Rebuild projections" isLoading={runRebuild.isPending} onPress={() => runRebuild.mutate(undefined)} />
              <AppButton startContent={<ArrowsClockwise weight="bold" />} label="Run reconciliation" isLoading={runRecon.isPending} onPress={() => runRecon.mutate(undefined)} />
            </div>
          )
        }
      />
      <PeriodStats workspaceId={workspaceId} />

      <Segmented aria-label="Periods or Reconciliation" options={TABS} value={tab} onChange={setTab} />

      {tab === "periods" ? (
        <DataView<AccountingPeriod>
          title="Accounting Periods"
          rows={periods.data ?? []}
          rowKey={(r) => r.id}
          isLoading={periods.isPending}
          isError={periods.isError}
          columns={[
            { key: "name", label: "Period", render: (r) => <span className="font-medium">{r.name}</span> },
            { key: "dates", label: "Range", render: (r) => <span className="text-xs text-muted">{formatDate(r.start_date)} – {formatDate(r.end_date)}</span> },
            {
              key: "status",
              label: "Status",
              render: (r) => (
                <StatusPill tone={r.status === "open" ? "success" : r.status === "locked" ? "danger" : "warning"}>
                  {r.status}
                </StatusPill>
              ),
            },
            {
              key: "actions",
              label: "",
              align: "right",
              render: (r) => (
                <div className="flex items-center justify-end gap-2">
                  <AppButton size="sm" variant="ghost" label="Checklist" onPress={() => runChecklist.mutate(r.id)} />
                  {r.status === "open" ? (
                    <AppButton size="sm" variant="secondary" label="Close" onPress={() => closePeriod.mutate(r.id)} />
                  ) : null}
                  {r.status === "closed" ? (
                    <>
                      <AppButton size="sm" variant="secondary" startContent={<Lock size={14} />} label="Lock" onPress={() => lockPeriod.mutate(r.id)} />
                      <AppButton size="sm" variant="ghost" startContent={<LockOpen size={14} />} label="Reopen" onPress={() => setReopenTarget(r)} />
                    </>
                  ) : null}
                </div>
              ),
            },
          ]}
          renderCard={(r) => (
            <RecordCard
              icon={<CalendarCheck size={18} weight="duotone" aria-hidden="true" />}
              reference={`${formatDate(r.start_date)} – ${formatDate(r.end_date)}`}
              title={r.name}
              amount={r.reporting_currency}
              status={<StatusPill tone={r.status === "open" ? "success" : "warning"}>{r.status}</StatusPill>}
              actions={
                r.status === "open" ? (
                  <AppButton size="sm" variant="secondary" label="Close" onPress={() => closePeriod.mutate(r.id)} />
                ) : undefined
              }
            />
          )}
          empty={
            <EmptyState
              icon={CalendarCheck}
              title="No accounting periods configured"
              description="Create monthly or quarterly periods to enforce close checklists and lock historical postings."
              action={<AppButton startContent={<Plus weight="bold" />} label="New period" onPress={() => setCreateOpen(true)} />}
            />
          }
        />
      ) : (
        <DataView<ReconciliationRunDetail>
          title="Subledger Reconciliations"
          rows={recons.data ?? []}
          rowKey={(r) => r.run.id}
          isLoading={recons.isPending}
          isError={recons.isError}
          columns={[
            { key: "date", label: "As-of", render: (r) => <span className="text-xs text-muted">{formatDate(r.run.as_of_date)}</span> },
            { key: "checks", label: "Checks", render: (r) => <span className="text-xs">{r.run.total_checks} total · {r.run.failed_checks} failed</span> },
            {
              key: "status",
              label: "Status",
              render: (r) => <StatusPill tone={r.run.status === "passed" ? "success" : "danger"}>{r.run.status}</StatusPill>,
            },
            {
              key: "summary",
              label: "Differences",
              render: (r) => (
                <div className="space-y-0.5 text-xs">
                  {r.differences.filter((d) => d.status === "mismatch").map((d) => (
                    <p key={d.id} className="text-danger">
                      {d.subledger_name}: diff {formatMinorAmount(d.difference_minor, currency, 2)}
                    </p>
                  ))}
                  {r.run.failed_checks === 0 ? <span className="text-muted">All control accounts match subledgers</span> : null}
                </div>
              ),
            },
          ]}
          renderCard={(r) => (
            <RecordCard
              icon={<ArrowsClockwise size={18} weight="duotone" aria-hidden="true" />}
              reference={formatDate(r.run.as_of_date)}
              title={`Run #${r.run.id}`}
              amount={`${r.run.total_checks - r.run.failed_checks}/${r.run.total_checks} matched`}
              status={<StatusPill tone={r.run.status === "passed" ? "success" : "danger"}>{r.run.status}</StatusPill>}
            />
          )}
          empty={
            <EmptyState
              icon={ArrowsClockwise}
              title="No reconciliation runs yet"
              description="Compare AR, AP, Deposits, Advances, Inventory, Loans, and Cash subledgers to their GL control accounts."
              action={<AppButton startContent={<ArrowsClockwise weight="bold" />} label="Run reconciliation" onPress={() => runRecon.mutate(undefined)} />}
            />
          }
        />
      )}

      <FormDrawer
        isOpen={createOpen}
        onOpenChange={setCreateOpen}
        title="New accounting period"
        submitLabel="Create period"
        isSubmitting={createPeriod.isPending}
        onSubmit={(e) => {
          e.preventDefault();
          createPeriod.mutate(undefined);
        }}
      >
        {createPeriod.error ? <Alert status="error" description={createPeriod.error.message} /> : null}
        <div className="space-y-1">
          <label className="text-xs font-medium">Period name</label>
          <input className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={pName} onChange={(e) => setPName(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">Start date</label>
            <input type="date" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={pStart} onChange={(e) => setPStart(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">End date</label>
            <input type="date" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={pEnd} onChange={(e) => setPEnd(e.target.value)} required />
          </div>
        </div>
      </FormDrawer>

      <FormDrawer
        isOpen={Boolean(checklist)}
        onOpenChange={(open) => !open && setChecklist(null)}
        title="Period-Close Checklist"
        description={checklist?.run.summary ?? ""}
        submitLabel="Done"
        onSubmit={(e) => {
          e.preventDefault();
          setChecklist(null);
        }}
      >
        <div className="space-y-2 text-xs">
          {(checklist?.checks ?? []).map((chk) => (
            <div key={chk.id} className="flex items-start justify-between gap-2 rounded-xl border border-border p-3">
              <div className="flex items-start gap-2">
                {chk.passed ? <CheckCircle size={16} className="text-success shrink-0" /> : <WarningCircle size={16} className="text-danger shrink-0" />}
                <div>
                  <p className="font-medium">{chk.label}</p>
                  <p className="text-muted">{chk.detail}</p>
                </div>
              </div>
              <StatusPill tone={chk.passed ? "success" : chk.severity === "critical" ? "danger" : "warning"}>
                {chk.passed ? "Pass" : chk.severity}
              </StatusPill>
            </div>
          ))}
        </div>
      </FormDrawer>

      <FormDrawer
        isOpen={Boolean(reopenTarget)}
        onOpenChange={(open) => !open && setReopenTarget(null)}
        title="Reopen closed period"
        description="Elevated permission and audit reason required."
        submitLabel="Reopen period"
        isSubmitting={reopenPeriod.isPending}
        onSubmit={(e) => {
          e.preventDefault();
          if (reopenTarget) reopenPeriod.mutate(reopenTarget.id);
        }}
      >
        {reopenPeriod.error ? <Alert status="error" description={reopenPeriod.error.message} /> : null}
        <div className="space-y-1">
          <label className="text-xs font-medium">Reason for reopening</label>
          <input className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} required />
        </div>
      </FormDrawer>
    </Page>
  );
}

export function PeriodsReconciliationPage() {
  return (
    <WorkspaceGate>
      {(info) => <PeriodsReconContent {...info} />}
    </WorkspaceGate>
  );
}
