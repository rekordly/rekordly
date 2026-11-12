"use client";

import { DownloadSimple, FileText } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";
import Link from "next/link";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { DashboardCard } from "@/components/ui/dashboard-card";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader, StatusPill } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { formatDate } from "@/lib/format";
import { ledgerApi, ledgerKeys } from "@/lib/ledger";
import { formatMinorAmount } from "@/lib/money";
import type { ReportExportRow } from "@/types/ledger";

import { useFinanceAction, WorkspaceGate, type WorkspaceInfo } from "../finance/shared";

const REPORT_TYPES = [
  { key: "trial_balance", label: "Trial Balance" },
  { key: "profit_and_loss", label: "Profit & Loss" },
  { key: "balance_sheet", label: "Balance Sheet" },
  { key: "cash_movement", label: "Cash Movement" },
  { key: "ar_aging", label: "AR Aging" },
  { key: "ap_aging", label: "AP Aging" },
  { key: "inventory_valuation", label: "Inventory Valuation" },
  { key: "vat_schedule", label: "VAT Schedule" },
  { key: "wht_schedule", label: "WHT Schedule" },
  { key: "customer_deposits", label: "Customer Deposits" },
  { key: "supplier_advances", label: "Supplier Advances" },
  { key: "loan_balances", label: "Loan Balances" },
];

function AccountingReportsContent({ workspaceId, currency }: WorkspaceInfo) {
  const [reportType, setReportType] = useState("trial_balance");
  const now = new Date();
  const [fromDate, setFromDate] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(now, "yyyy-MM-dd"));
  const [exportsOpen, setExportsOpen] = useState(false);

  const report = useQuery({
    queryKey: ledgerKeys.report(workspaceId, reportType, fromDate, toDate),
    queryFn: () => ledgerApi.getReport(workspaceId, reportType, { from_date: fromDate, to_date: toDate, currency }),
  });

  const exports = useQuery({
    queryKey: ledgerKeys.exports(workspaceId),
    queryFn: () => ledgerApi.listReportExports(workspaceId),
    enabled: exportsOpen,
  });

  const createExport = useFinanceAction(
    workspaceId,
    (fmt: "csv" | "pdf") =>
      ledgerApi.exportReport(workspaceId, { report_type: reportType, format: fmt, from_date: fromDate, to_date: toDate, currency }),
    {
      success: "Report export generated",
      onDone: (data) => {
        const exp = data as ReportExportRow;
        if (exp.content_text) {
          const blob = new Blob([exp.content_text], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${reportType}-${fromDate}-to-${toDate}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        }
        exports.refetch();
      },
    },
  );

  const r = report.data;

  return (
    <Page>
      <PageHeader
        title="Accounting Reports"
        description="Server-calculated financial statements, aging, tax schedules, and drill-down."
        actions={
          <div className="flex flex-wrap gap-2">
            <AppButton variant="ghost" label="Export history" onPress={() => setExportsOpen(true)} />
            <AppButton
              variant="secondary"
              startContent={<DownloadSimple size={16} weight="bold" />}
              label="Export CSV"
              isLoading={createExport.isPending}
              onPress={() => createExport.mutate("csv")}
            />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="Select report type"
          value={reportType}
          onChange={(e) => setReportType(e.target.value)}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium"
        >
          {REPORT_TYPES.map((rt) => (
            <option key={rt.key} value={rt.key}>{rt.label}</option>
          ))}
        </select>
        <input type="date" aria-label="From date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs" />
        <input type="date" aria-label="To date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs" />
      </div>

      {report.isError ? (
        <Alert status="error" description="Report generation failed. Failed reports are never shown as zero-valued." />
      ) : null}

      {r && !r.invariant_passed ? (
        <Alert status="error" description={`Accounting invariant failed (${r.warnings.join("; ")}). Report cannot be treated as trusted.`} />
      ) : null}

      {r && r.warnings.length > 0 && r.invariant_passed ? (
        <Alert status="warning" description={r.warnings.join(" · ")} />
      ) : null}

      {r ? (
        <DashboardCard>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4 text-xs text-muted">
            <span>
              {r.title} · {r.from_date} to {r.to_date} · {r.currency} · Basis: {r.basis} · Version: {r.report_version}
            </span>
            <StatusPill tone={r.invariant_passed ? "success" : "danger"}>
              {r.reconciliation_status.replace(/_/g, " ")}
            </StatusPill>
          </div>

          <DataView
            title={r.title}
            rows={r.rows}
            rowKey={(row) => row.key}
            isLoading={report.isPending}
            isError={report.isError}
            columns={[
              ...r.columns.map((col) => ({
                key: col.key,
                label: col.label,
                align: col.align,
                render: (row: (typeof r.rows)[number]) => {
                  const val = row.values[col.key] ?? "";
                  if (col.key.endsWith("_minor") || col.key.includes("debit") || col.key.includes("credit")) {
                    return <span className="tabular">{formatMinorAmount(val || "0", r.currency, r.currency_exponent)}</span>;
                  }
                  return <span>{val}</span>;
                },
              })),
              {
                key: "drill",
                label: "",
                align: "right",
                render: (row) =>
                  row.chart_account_id ? (
                    <Link href={`/ledger?account=${row.chart_account_id}`} className="text-xs font-medium text-primary hover:underline">
                      Journals
                    </Link>
                  ) : null,
              },
            ]}
            renderCard={(row) => (
              <RecordCard
                icon={<FileText size={18} weight="duotone" aria-hidden="true" />}
                title={row.label}
                amount={row.values[r.columns[r.columns.length - 1]?.key] ?? ""}
              />
            )}
            empty={<EmptyState icon={FileText} title="No rows in this period" description="No posted activity matches the selected report filters." />}
          />
        </DashboardCard>
      ) : null}

      <FormDrawer
        isOpen={exportsOpen}
        onOpenChange={setExportsOpen}
        title="Report Export History"
        description="Audited report exports with expiry and warnings."
        submitLabel="Close"
        onSubmit={(e) => {
          e.preventDefault();
          setExportsOpen(false);
        }}
      >
        <div className="space-y-2 text-xs">
          {(exports.data ?? []).map((ex) => (
            <div key={ex.id} className="flex items-center justify-between rounded-xl border border-border p-3">
              <div>
                <p className="font-medium capitalize">{ex.report_type.replace(/_/g, " ")} ({ex.format.toUpperCase()})</p>
                <p className="text-muted">{formatDate(ex.created_at)} · {ex.row_count} rows</p>
              </div>
              <StatusPill tone="success">{ex.status}</StatusPill>
            </div>
          ))}
        </div>
      </FormDrawer>
    </Page>
  );
}

export function AccountingReportsPage() {
  return (
    <WorkspaceGate>
      {(info) => <AccountingReportsContent {...info} />}
    </WorkspaceGate>
  );
}
