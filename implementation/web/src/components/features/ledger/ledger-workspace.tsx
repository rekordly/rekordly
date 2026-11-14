"use client";

import { ArrowCounterClockwise, BookOpen, CheckCircle, Plus, Scales } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
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
import type { ChartAccount, LedgerEntry, ManualJournalDraft } from "@/types/ledger";

import { useFinanceAction, WorkspaceGate, type WorkspaceInfo } from "../finance/shared";
import { LedgerStats } from "../finance/section-stats";

const TABS = [
  { key: "chart", label: "Chart of Accounts" },
  { key: "journals", label: "Journals" },
  { key: "manual", label: "Manual Journals" },
] as const;

function LedgerContent({ workspaceId, currency }: WorkspaceInfo) {
  const [tab, setTab] = useState<"chart" | "journals" | "manual">("chart");
  const [addAccOpen, setAddAccOpen] = useState(false);
  const [selectedJournalId, setSelectedJournalId] = useState<number | null>(null);
  const [reversingId, setReversingId] = useState<number | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [manualOpen, setManualOpen] = useState(false);

  // Chart create state
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [accountClass, setAccountClass] = useState("expense");
  const [subtype, setSubtype] = useState("operating_expense");

  // Manual draft state
  const [mjDate, setMjDate] = useState(new Date().toISOString().split("T")[0]);
  const [mjDesc, setMjDesc] = useState("");
  const [mjDebitAcc, setMjDebitAcc] = useState("");
  const [mjCreditAcc, setMjCreditAcc] = useState("");
  const [mjAmount, setMjAmount] = useState("");

  const chart = useQuery({
    queryKey: ledgerKeys.chart(workspaceId),
    queryFn: () => ledgerApi.listChartAccounts(workspaceId),
  });

  const journals = useQuery({
    queryKey: ledgerKeys.journals(workspaceId, "all"),
    queryFn: () => ledgerApi.listJournals(workspaceId, { limit: 50 }),
    enabled: tab === "journals",
  });

  const journalDetail = useQuery({
    queryKey: ledgerKeys.journal(workspaceId, selectedJournalId ?? 0),
    queryFn: () => ledgerApi.getJournalDetail(workspaceId, selectedJournalId!),
    enabled: Boolean(selectedJournalId),
  });

  const drafts = useQuery({
    queryKey: ledgerKeys.manualDrafts(workspaceId),
    queryFn: () => ledgerApi.listManualDrafts(workspaceId),
    enabled: tab === "manual",
  });

  const seedChart = useFinanceAction(
    workspaceId,
    () => ledgerApi.seedChartDefaults(workspaceId),
    { success: "Default chart of accounts seeded", onDone: () => chart.refetch() },
  );

  const createAcc = useFinanceAction(
    workspaceId,
    () => ledgerApi.createChartAccount(workspaceId, { code, name, account_class: accountClass, subtype }),
    {
      success: "Account created",
      onDone: () => {
        setAddAccOpen(false);
        setCode("");
        setName("");
        chart.refetch();
      },
    },
  );

  const archiveAcc = useFinanceAction(
    workspaceId,
    (id: number) => ledgerApi.archiveChartAccount(workspaceId, id),
    { success: "Account archived", onDone: () => chart.refetch() },
  );

  const reverseJournal = useFinanceAction(
    workspaceId,
    (id: number, key: string) => ledgerApi.reverseJournal(workspaceId, id, reverseReason, key),
    {
      success: "Journal reversed atomically",
      onDone: () => {
        setReversingId(null);
        setSelectedJournalId(null);
        setReverseReason("");
        journals.refetch();
      },
    },
  );

  const createManual = useFinanceAction(
    workspaceId,
    (_: void, key: string) =>
      ledgerApi.createManualDraft(
        workspaceId,
        {
          entry_date: mjDate,
          currency,
          description: mjDesc,
          lines: [
            { chart_account_id: Number(mjDebitAcc), debit: mjAmount },
            { chart_account_id: Number(mjCreditAcc), credit: mjAmount },
          ],
        },
        key,
      ),
    {
      success: "Manual journal draft created",
      onDone: () => {
        setManualOpen(false);
        setMjDesc("");
        setMjAmount("");
        drafts.refetch();
      },
    },
  );

  const postManual = useFinanceAction(
    workspaceId,
    (draftId: number, key: string) => ledgerApi.postManualDraft(workspaceId, draftId, key),
    {
      success: "Manual journal posted to ledger",
      onDone: () => {
        drafts.refetch();
        journals.refetch();
      },
    },
  );

  const nonControlAccounts = (chart.data ?? []).filter((a) => a.is_active && !a.is_control);

  return (
    <Page>
      <PageHeader
        title="General Ledger & Chart"
        description="Immutable double-entry journals, versioned posting templates, and protected control accounts."
        actions={
          <div className="flex flex-wrap gap-2">
            {tab === "chart" ? (
              <>
                <AppButton variant="secondary" label="Seed defaults" isLoading={seedChart.isPending} onPress={() => seedChart.mutate(undefined)} />
                <AppButton startContent={<Plus weight="bold" />} label="Add account" onPress={() => setAddAccOpen(true)} />
              </>
            ) : tab === "manual" ? (
              <AppButton startContent={<Plus weight="bold" />} label="New manual draft" onPress={() => setManualOpen(true)} />
            ) : null}
          </div>
        }
      />
      <LedgerStats workspaceId={workspaceId} />

      <Segmented aria-label="Ledger sections" options={TABS} value={tab} onChange={setTab} />

      {tab === "chart" ? (
        <DataView<ChartAccount>
          title="Chart of Accounts"
          rows={chart.data ?? []}
          rowKey={(r) => r.id}
          isLoading={chart.isPending}
          isError={chart.isError}
          columns={[
            { key: "code", label: "Code", render: (r) => <span className="font-mono text-xs font-semibold">{r.code}</span> },
            {
              key: "name",
              label: "Account",
              render: (r) => (
                <div>
                  <p className="font-medium text-foreground">{r.name}</p>
                  <p className="text-xs text-muted capitalize">{r.subtype.replace(/_/g, " ")}</p>
                </div>
              ),
            },
            { key: "class", label: "Class", render: (r) => <span className="text-xs capitalize">{r.account_class}</span> },
            {
              key: "protection",
              label: "Type",
              render: (r) =>
                r.is_control ? (
                  <StatusPill tone="warning">Control ({r.control_subledger})</StatusPill>
                ) : r.is_system ? (
                  <StatusPill tone="neutral">System</StatusPill>
                ) : (
                  <StatusPill tone="success">Detail</StatusPill>
                ),
            },
            {
              key: "actions",
              label: "",
              align: "right",
              render: (r) =>
                !r.is_system && !r.is_control && r.is_active ? (
                  <AppButton size="sm" variant="ghost" label="Archive" onPress={() => archiveAcc.mutate(r.id)} />
                ) : null,
            },
          ]}
          renderCard={(r) => (
            <RecordCard
              icon={<BookOpen size={18} weight="duotone" aria-hidden="true" />}
              reference={`${r.code} · ${r.account_class}`}
              title={r.name}
              amount={r.is_control ? "Control" : "Detail"}
              status={<StatusPill tone={r.is_active ? "success" : "neutral"}>{r.is_active ? "Active" : "Archived"}</StatusPill>}
            />
          )}
          empty={
            <EmptyState
              icon={BookOpen}
              title="Chart of accounts is empty"
              description="Seed the default chart template to enable control accounts and ledger reporting."
              action={<AppButton label="Seed defaults" onPress={() => seedChart.mutate(undefined)} />}
            />
          }
        />
      ) : tab === "journals" ? (
        <DataView<LedgerEntry>
          title="Journals"
          rows={journals.data?.items ?? []}
          rowKey={(r) => r.id}
          isLoading={journals.isPending}
          isError={journals.isError}
          columns={[
            { key: "id", label: "Entry", render: (r) => <span className="font-mono text-xs">#{r.id}</span> },
            { key: "date", label: "Date", render: (r) => <span className="text-xs text-muted">{formatDate(r.entry_date)}</span> },
            {
              key: "desc",
              label: "Description / Source",
              render: (r) => (
                <div>
                  <p className="font-medium">{r.description || r.source_type}</p>
                  <p className="text-xs text-muted">
                    {r.source_type} #{r.source_id}
                    {r.template_key ? ` · ${r.template_key}@${r.template_version}` : ""}
                  </p>
                </div>
              ),
            },
            {
              key: "status",
              label: "Status",
              render: (r) => <StatusPill tone={r.is_reversed ? "warning" : "success"}>{r.is_reversed ? "Reversed" : "Posted"}</StatusPill>,
            },
            {
              key: "actions",
              label: "",
              align: "right",
              render: (r) => <AppButton size="sm" variant="secondary" label="Inspect" onPress={() => setSelectedJournalId(r.id)} />,
            },
          ]}
          renderCard={(r) => (
            <RecordCard
              icon={<Scales size={18} weight="duotone" aria-hidden="true" />}
              reference={`#${r.id} · ${formatDate(r.entry_date)}`}
              title={r.description || r.source_type}
              amount={r.currency}
              status={<StatusPill tone={r.is_reversed ? "warning" : "success"}>{r.is_reversed ? "Reversed" : "Posted"}</StatusPill>}
              actions={<AppButton size="sm" variant="secondary" label="Inspect" onPress={() => setSelectedJournalId(r.id)} />}
            />
          )}
          empty={
            <EmptyState
              icon={Scales}
              title="No posted journals yet"
              description="Every confirmed financial event creates an immutable balanced journal entry."
            />
          }
        />
      ) : (
        <DataView<ManualJournalDraft>
          title="Manual Journal Drafts"
          rows={drafts.data ?? []}
          rowKey={(r) => r.id}
          isLoading={drafts.isPending}
          isError={drafts.isError}
          columns={[
            { key: "date", label: "Date", render: (r) => <span className="text-xs text-muted">{formatDate(r.entry_date)}</span> },
            { key: "desc", label: "Description", render: (r) => <span className="font-medium">{r.description}</span> },
            { key: "status", label: "Status", render: (r) => <StatusPill tone={r.status === "posted" ? "success" : "warning"}>{r.status}</StatusPill> },
            {
              key: "actions",
              label: "",
              align: "right",
              render: (r) =>
                r.status !== "posted" ? (
                  <AppButton
                    size="sm"
                    variant="primary"
                    startContent={<CheckCircle size={14} />}
                    label="Approve & Post"
                    isLoading={postManual.isPending}
                    onPress={() => postManual.mutate(r.id)}
                  />
                ) : null,
            },
          ]}
          renderCard={(r) => (
            <RecordCard
              icon={<Scales size={18} weight="duotone" aria-hidden="true" />}
              reference={formatDate(r.entry_date)}
              title={r.description}
              amount={r.currency}
              status={<StatusPill tone={r.status === "posted" ? "success" : "warning"}>{r.status}</StatusPill>}
              actions={
                r.status !== "posted" ? (
                  <AppButton size="sm" variant="primary" label="Approve & Post" onPress={() => postManual.mutate(r.id)} />
                ) : undefined
              }
            />
          )}
          empty={
            <EmptyState
              icon={Scales}
              title="No manual journal drafts"
              description="Use manual journals only for accruals, reclassifications, and period-end adjustments."
              action={<AppButton startContent={<Plus weight="bold" />} label="New manual draft" onPress={() => setManualOpen(true)} />}
            />
          }
        />
      )}

      {/* Add Chart Account Drawer */}
      <FormDrawer
        isOpen={addAccOpen}
        onOpenChange={setAddAccOpen}
        title="Add detail account"
        description="User-created detail account. System and control accounts are protected."
        submitLabel="Create account"
        isSubmitting={createAcc.isPending}
        onSubmit={(e) => {
          e.preventDefault();
          createAcc.mutate(undefined);
        }}
      >
        {createAcc.error ? <Alert status="error" description={createAcc.error.message} /> : null}
        <div className="space-y-1">
          <label className="text-xs font-medium">Account code</label>
          <input className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 6050" required />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Account name</label>
          <input className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Office Supplies" required />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Class</label>
          <select className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={accountClass} onChange={(e) => setAccountClass(e.target.value)}>
            <option value="asset">Asset</option>
            <option value="liability">Liability</option>
            <option value="equity">Equity</option>
            <option value="revenue">Revenue</option>
            <option value="expense">Expense</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Subtype</label>
          <input className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={subtype} onChange={(e) => setSubtype(e.target.value)} required />
        </div>
      </FormDrawer>

      {/* Journal Detail & Reversal Drawer */}
      <FormDrawer
        isOpen={Boolean(selectedJournalId)}
        onOpenChange={(open) => !open && setSelectedJournalId(null)}
        title={selectedJournalId ? `Journal Entry #${selectedJournalId}` : "Journal Detail"}
        description="Immutable ledger lines and source document traceability."
        submitLabel="Close"
        onSubmit={(e) => {
          e.preventDefault();
          setSelectedJournalId(null);
        }}
      >
        {journalDetail.data ? (
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted">Source: {journalDetail.data.entry.source_type} #{journalDetail.data.entry.source_id}</span>
              <Link href={journalDetail.data.source_link} className="font-medium text-primary hover:underline">Open source</Link>
            </div>
            <div className="space-y-2">
              {journalDetail.data.lines.map((l) => (
                <div key={l.id} className="flex items-center justify-between rounded-xl border border-border p-2.5">
                  <div>
                    <p className="font-medium">{l.chart_account_code ? `${l.chart_account_code} ${l.chart_account_name}` : l.money_account_name ?? l.account_class}</p>
                    <p className="text-muted">{l.description}</p>
                  </div>
                  <div className="text-right tabular">
                    {l.debit_minor !== "0" ? <span className="text-foreground">Dr {formatMinorAmount(l.debit_minor, journalDetail.data.entry.currency, journalDetail.data.entry.currency_exponent)}</span> : null}
                    {l.credit_minor !== "0" ? <span className="text-muted">Cr {formatMinorAmount(l.credit_minor, journalDetail.data.entry.currency, journalDetail.data.entry.currency_exponent)}</span> : null}
                  </div>
                </div>
              ))}
            </div>
            {!journalDetail.data.entry.is_reversed ? (
              <AppButton
                size="sm"
                variant="danger"
                startContent={<ArrowCounterClockwise size={14} />}
                label="Reverse this journal"
                onPress={() => setReversingId(journalDetail.data.entry.id)}
              />
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted">Loading journal detail...</p>
        )}
      </FormDrawer>

      {/* Reverse Reason Drawer */}
      <FormDrawer
        isOpen={Boolean(reversingId)}
        onOpenChange={(open) => !open && setReversingId(null)}
        title="Reverse journal entry"
        description="Creates an exact opposite reversal entry in the permitted open period."
        submitLabel="Confirm reversal"
        isSubmitting={reverseJournal.isPending}
        onSubmit={(e) => {
          e.preventDefault();
          if (reversingId) reverseJournal.mutate(reversingId);
        }}
      >
        {reverseJournal.error ? <Alert status="error" description={reverseJournal.error.message} /> : null}
        <div className="space-y-1">
          <label className="text-xs font-medium">Reversal reason</label>
          <input className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} required placeholder="e.g. Incorrect accrual period" />
        </div>
      </FormDrawer>

      {/* Create Manual Journal Draft Drawer */}
      <FormDrawer
        isOpen={manualOpen}
        onOpenChange={setManualOpen}
        title="New manual journal draft"
        description="Control accounts are blocked from direct manual posting."
        submitLabel="Save draft"
        isSubmitting={createManual.isPending}
        onSubmit={(e) => {
          e.preventDefault();
          createManual.mutate(undefined);
        }}
      >
        {createManual.error ? <Alert status="error" description={createManual.error.message} /> : null}
        <div className="space-y-1">
          <label className="text-xs font-medium">Entry date</label>
          <input type="date" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={mjDate} onChange={(e) => setMjDate(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Description</label>
          <input className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={mjDesc} onChange={(e) => setMjDesc(e.target.value)} required placeholder="e.g. Month-end accrual" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Debit account (non-control)</label>
          <select className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={mjDebitAcc} onChange={(e) => setMjDebitAcc(e.target.value)} required>
            <option value="">Select account...</option>
            {nonControlAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Credit account (non-control)</label>
          <select className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={mjCreditAcc} onChange={(e) => setMjCreditAcc(e.target.value)} required>
            <option value="">Select account...</option>
            {nonControlAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Amount ({currency})</label>
          <input className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={mjAmount} onChange={(e) => setMjAmount(e.target.value)} required placeholder="1000.00" />
        </div>
      </FormDrawer>
    </Page>
  );
}

export function LedgerWorkspacePage() {
  return (
    <WorkspaceGate>
      {(info) => <LedgerContent {...info} />}
    </WorkspaceGate>
  );
}
