"use client";

import { toast } from "@heroui/react";
import { ArrowCounterClockwise, CheckCircle, DownloadSimple, FileCsv, MagnifyingGlass, UploadSimple } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader, Segmented, StatusPill } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { aiImportsApi, aiImportsKeys } from "@/lib/ai-imports";
import { formatDate } from "@/lib/format";
import { formatMinorAmount, moneyApi, moneyKeys } from "@/lib/money";
import { PERMISSIONS } from "@/lib/permissions-catalog";
import { hasWorkspacePermission, useActiveWorkspace } from "@/stores/workspace-store";
import type { ImportBatch, ImportMappingPreviewRow, ImportRow, ImportUndoResult } from "@/types/ai-imports";

import { WorkspaceGate, type WorkspaceInfo } from "../finance/shared";

const ROW_VIEWS = [
  { key: "all", label: "All" },
  { key: "draft_ready", label: "New drafts" },
  { key: "match_suggested", label: "Matches" },
  { key: "duplicate_exact", label: "Duplicates" },
  { key: "invalid", label: "Invalid" },
  { key: "posted", label: "Posted" },
  { key: "excluded", label: "Excluded" },
] as const;

function CSVImportContent({ workspaceId, currency }: WorkspaceInfo) {
  const scope = useActiveWorkspace();
  const queryClient = useQueryClient();
  const canCreate = hasWorkspacePermission(scope, PERMISSIONS.IMPORTS_CREATE);
  const canReview = hasWorkspacePermission(scope, PERMISSIONS.IMPORTS_REVIEW);
  const canConfirm = hasWorkspacePermission(scope, PERMISSIONS.IMPORTS_CONFIRM);
  const canUndo = hasWorkspacePermission(scope, PERMISSIONS.IMPORTS_UNDO);

  const [activeBatchId, setActiveBatchId] = useState<number | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rowView, setRowView] = useState<string>("all");
  const [selectedRowIds, setSelectedRowIds] = useState<number[]>([]);

  // Mapping state
  const [dateCol, setDateCol] = useState("");
  const [descCol, setDescCol] = useState("");
  const [amtCol, setAmtCol] = useState("");
  const [debitCol, setDebitCol] = useState("");
  const [creditCol, setCreditCol] = useState("");
  const [extIdCol, setExtIdCol] = useState("");
  const [dateFormat, setDateFormat] = useState("YYYY-MM-DD");
  const [decSep, setDecSep] = useState(".");
  const [signConv, setSignConv] = useState("signed");
  const [targetAccId, setTargetAccId] = useState("");
  const [previewRows, setPreviewRows] = useState<ImportMappingPreviewRow[]>([]);
  const [undoPreview, setUndoPreview] = useState<ImportUndoResult | null>(null);

  const accounts = useQuery({
    queryKey: moneyKeys.accounts(workspaceId),
    queryFn: () => moneyApi.listAccounts({ workspaceId }),
  });

  const batches = useQuery({
    queryKey: aiImportsKeys.imports(workspaceId),
    queryFn: () => aiImportsApi.listImports(workspaceId),
    enabled: canReview || canCreate,
  });

  const batchDetail = useQuery({
    queryKey: aiImportsKeys.importBatch(workspaceId, activeBatchId ?? 0),
    queryFn: () => aiImportsApi.getImportBatch(workspaceId, activeBatchId!),
    enabled: activeBatchId !== null,
  });

  const rows = useQuery({
    queryKey: aiImportsKeys.importRows(workspaceId, activeBatchId ?? 0, rowView),
    queryFn: () => aiImportsApi.listImportRows(workspaceId, activeBatchId!, { state: rowView === "all" ? undefined : rowView, limit: 100 }),
    enabled: activeBatchId !== null && canReview,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        throw new Error("Only .csv files are supported.");
      }
      const csv_content = await file.text();
      return aiImportsApi.createImport(workspaceId, {
        filename: file.name,
        csv_content,
        target_account_id: targetAccId ? Number(targetAccId) : undefined,
        default_currency: currency,
      });
    },
    onSuccess: (res) => {
      toast.success("CSV uploaded privately. Map columns to preview normalization.");
      setActiveBatchId(res.batch.id);
      setHeaders(res.headers);
      setDateCol(res.headers[0] ?? "");
      setDescCol(res.headers[1] ?? "");
      setAmtCol(res.headers[2] ?? "");
      setPreviewRows([]);
      void queryClient.invalidateQueries({ queryKey: aiImportsKeys.imports(workspaceId) });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "CSV upload failed"),
  });

  const mapMutation = useMutation({
    mutationFn: () =>
      aiImportsApi.setImportMapping(workspaceId, activeBatchId!, {
        date_column: dateCol,
        description_column: descCol,
        amount_column: signConv === "debit_credit" ? undefined : amtCol,
        debit_column: signConv === "debit_credit" ? debitCol : undefined,
        credit_column: signConv === "debit_credit" ? creditCol : undefined,
        external_id_column: extIdCol || undefined,
        date_format: dateFormat,
        decimal_separator: decSep,
        sign_convention: signConv,
        target_account_id: Number(targetAccId),
        default_currency: currency,
      }),
    onSuccess: (res) => {
      toast.success("Mapping validated. Review normalization preview below.");
      setPreviewRows(res.preview);
      void queryClient.invalidateQueries({ queryKey: aiImportsKeys.importBatch(workspaceId, activeBatchId!) });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Invalid column mapping"),
  });

  const analyzeMutation = useMutation({
    mutationFn: () => aiImportsApi.analyzeImportBatch(workspaceId, activeBatchId!),
    onSuccess: () => {
      toast.success("Batch analyzed for duplicates, matches, and errors");
      void queryClient.invalidateQueries({ queryKey: aiImportsKeys.importBatch(workspaceId, activeBatchId!) });
      void queryClient.invalidateQueries({ queryKey: aiImportsKeys.importRows(workspaceId, activeBatchId!, rowView) });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Analysis failed"),
  });

  const confirmMutation = useMutation({
    mutationFn: (ids?: number[]) => aiImportsApi.confirmImportBatch(workspaceId, activeBatchId!, ids),
    onSuccess: (res) => {
      toast.success(`Confirmed ${res.batch.posted_count} row(s) through deterministic posting`);
      setSelectedRowIds([]);
      void queryClient.invalidateQueries({ queryKey: aiImportsKeys.importBatch(workspaceId, activeBatchId!) });
      void queryClient.invalidateQueries({ queryKey: aiImportsKeys.importRows(workspaceId, activeBatchId!, rowView) });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Batch confirmation failed"),
  });

  const bulkExcludeMutation = useMutation({
    mutationFn: (action: "exclude" | "include") =>
      aiImportsApi.bulkImportAction(workspaceId, activeBatchId!, { row_ids: selectedRowIds, action }),
    onSuccess: () => {
      toast.success("Updated selected rows");
      setSelectedRowIds([]);
      void queryClient.invalidateQueries({ queryKey: aiImportsKeys.importRows(workspaceId, activeBatchId!, rowView) });
    },
  });

  const undoPreviewMutation = useMutation({
    mutationFn: () => aiImportsApi.undoImportBatch(workspaceId, activeBatchId!, true),
    onSuccess: (res) => setUndoPreview(res),
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Undo preview failed"),
  });

  const undoExecuteMutation = useMutation({
    mutationFn: () => aiImportsApi.undoImportBatch(workspaceId, activeBatchId!, false),
    onSuccess: (res) => {
      toast.success(`Reversed ${res.reversed_count} record(s) via void/reversal commands`);
      setUndoPreview(null);
      void queryClient.invalidateQueries({ queryKey: aiImportsKeys.importBatch(workspaceId, activeBatchId!) });
      void queryClient.invalidateQueries({ queryKey: aiImportsKeys.importRows(workspaceId, activeBatchId!, rowView) });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Undo failed"),
  });

  if (!canCreate && !canReview) {
    return (
      <Page>
        <PageHeader title="CSV Imports" description="Safe bank statement and transaction imports." />
        <Alert status="error" title="Permission required" description="You lack imports.create or imports.review permissions." />
      </Page>
    );
  }

  const effectiveHeaders = batchDetail.data?.headers.length ? batchDetail.data.headers : headers;
  const b = batchDetail.data?.batch;

  return (
    <Page>
      <PageHeader
        title="CSV Imports"
        description="Upload private CSV statements, map date/number conventions explicitly, review duplicates & matches, and confirm through deterministic posting."
        actions={
          activeBatchId ? (
            <div className="flex flex-wrap gap-2">
              {canReview ? (
                <a href={`/api/v1/workspaces/${workspaceId}/imports/${activeBatchId}/export-failures`} target="_blank" rel="noreferrer">
                  <AppButton variant="tertiary" startContent={<DownloadSimple size={16} />} label="Export failures CSV" />
                </a>
              ) : null}
              {canUndo && b && b.posted_count > 0 ? (
                <AppButton variant="secondary" startContent={<ArrowCounterClockwise size={16} />} label="Undo import" onPress={() => undoPreviewMutation.mutate()} />
              ) : null}
            </div>
          ) : null
        }
      />

      {canCreate ? (
        <div className="rounded-xl border border-default-200 bg-content1 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">1. Upload private CSV statement</p>
              <p className="text-xs text-default-500">UTF-8 CSV up to 2 MB / 2,000 rows. Exact duplicates are excluded by default.</p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-primary px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5">
              <UploadSimple size={16} />
              <span>{uploadMutation.isPending ? "Uploading..." : "Choose .csv file"}</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadMutation.mutate(f);
                }}
              />
            </label>
          </div>
        </div>
      ) : null}

      {activeBatchId && effectiveHeaders.length > 0 ? (
        <div className="rounded-xl border border-default-200 bg-content1 p-4 space-y-4">
          <p className="text-sm font-medium">2. Column Mapping & Format Conventions</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-xs space-y-1">
              <span>Target account</span>
              <select className="w-full rounded-lg border px-2 py-1.5 text-sm" value={targetAccId} onChange={(e) => setTargetAccId(e.target.value)}>
                <option value="">Select account...</option>
                {(accounts.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs space-y-1">
              <span>Date column</span>
              <select className="w-full rounded-lg border px-2 py-1.5 text-sm" value={dateCol} onChange={(e) => setDateCol(e.target.value)}>
                {effectiveHeaders.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </label>
            <label className="text-xs space-y-1">
              <span>Date format</span>
              <select className="w-full rounded-lg border px-2 py-1.5 text-sm" value={dateFormat} onChange={(e) => setDateFormat(e.target.value)}>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              </select>
            </label>
            <label className="text-xs space-y-1">
              <span>Description column</span>
              <select className="w-full rounded-lg border px-2 py-1.5 text-sm" value={descCol} onChange={(e) => setDescCol(e.target.value)}>
                {effectiveHeaders.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </label>
            <label className="text-xs space-y-1">
              <span>Amount model</span>
              <select className="w-full rounded-lg border px-2 py-1.5 text-sm" value={signConv} onChange={(e) => setSignConv(e.target.value)}>
                <option value="signed">Signed amount (+/-)</option>
                <option value="debit_credit">Separate Debit / Credit columns</option>
                <option value="inverted">Inverted signed amount</option>
              </select>
            </label>
            <label className="text-xs space-y-1">
              <span>Decimal separator</span>
              <select className="w-full rounded-lg border px-2 py-1.5 text-sm" value={decSep} onChange={(e) => setDecSep(e.target.value)}>
                <option value=".">Dot (1,250.50)</option>
                <option value=",">Comma (1.250,50)</option>
              </select>
            </label>
            {signConv === "debit_credit" ? (
              <>
                <label className="text-xs space-y-1">
                  <span>Debit column</span>
                  <select className="w-full rounded-lg border px-2 py-1.5 text-sm" value={debitCol} onChange={(e) => setDebitCol(e.target.value)}>
                    <option value="">Select...</option>
                    {effectiveHeaders.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs space-y-1">
                  <span>Credit column</span>
                  <select className="w-full rounded-lg border px-2 py-1.5 text-sm" value={creditCol} onChange={(e) => setCreditCol(e.target.value)}>
                    <option value="">Select...</option>
                    {effectiveHeaders.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <label className="text-xs space-y-1">
                <span>Amount column</span>
                <select className="w-full rounded-lg border px-2 py-1.5 text-sm" value={amtCol} onChange={(e) => setAmtCol(e.target.value)}>
                  {effectiveHeaders.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-xs space-y-1">
              <span>External Tx ID (optional)</span>
              <select className="w-full rounded-lg border px-2 py-1.5 text-sm" value={extIdCol} onChange={(e) => setExtIdCol(e.target.value)}>
                <option value="">None</option>
                {effectiveHeaders.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <AppButton
              variant="secondary"
              label="Save mapping & preview"
              isDisabled={!targetAccId}
              isLoading={mapMutation.isPending}
              onPress={() => mapMutation.mutate()}
            />
            <AppButton
              startContent={<MagnifyingGlass size={16} />}
              label="Analyze duplicates & matches"
              isDisabled={!b || b.status === "uploaded"}
              isLoading={analyzeMutation.isPending}
              onPress={() => analyzeMutation.mutate()}
            />
          </div>

          {previewRows.length > 0 ? (
            <div className="rounded-lg border p-3 text-xs space-y-1">
              <p className="font-semibold">Normalization preview (first {previewRows.length} rows):</p>
              {previewRows.map((pr) => (
                <div key={pr.row_number} className="flex justify-between">
                  <span>#{pr.row_number} {pr.effective_date || "Invalid date"} · {pr.description}</span>
                  <span className={pr.valid ? "font-mono" : "text-danger"}>
                    {pr.valid ? `${pr.direction} ${formatMinorAmount(pr.amount_minor, pr.currency, 2)}` : pr.error}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {b ? (
        <div className="rounded-xl border border-default-200 bg-content1 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">
              Batch #{b.id} · {b.total_rows} rows ({b.valid_count} ready, {b.match_count} matches, {b.duplicate_count} duplicates, {b.invalid_count} invalid, {b.posted_count} posted)
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedRowIds.length > 0 ? (
                <>
                  <AppButton size="sm" variant="ghost" label={`Exclude (${selectedRowIds.length})`} onPress={() => bulkExcludeMutation.mutate("exclude")} />
                  <AppButton size="sm" variant="ghost" label={`Include (${selectedRowIds.length})`} onPress={() => bulkExcludeMutation.mutate("include")} />
                </>
              ) : null}
              {canConfirm ? (
                <AppButton
                  size="sm"
                  startContent={<CheckCircle size={16} />}
                  label={selectedRowIds.length > 0 ? `Confirm selected (${selectedRowIds.length})` : "Confirm all ready rows"}
                  isLoading={confirmMutation.isPending}
                  onPress={() => confirmMutation.mutate(selectedRowIds.length > 0 ? selectedRowIds : undefined)}
                />
              ) : null}
            </div>
          </div>

          {batchDetail.data?.reconciliation ? (
            <Alert
              status={batchDetail.data.reconciliation.reconciled ? "success" : "warning"}
              title={batchDetail.data.reconciliation.reconciled ? "Batch counts reconciled" : "Unresolved rows remain"}
              description={`Source: ${batchDetail.data.reconciliation.source_row_count} = Posted (${batchDetail.data.reconciliation.posted_count}) + Matched (${batchDetail.data.reconciliation.matched_count}) + Duplicate/Excluded (${batchDetail.data.reconciliation.duplicate_excluded_count}) + Unresolved/Failed (${batchDetail.data.reconciliation.failed_unresolved_count})`}
            />
          ) : null}

          <Segmented aria-label="Import row filter" options={ROW_VIEWS} value={rowView} onChange={setRowView} />

          <DataView<ImportRow>
            title="Import rows"
            rows={rows.data ?? []}
            rowKey={(r) => r.id}
            isLoading={rows.isPending}
            isError={rows.isError}
            columns={[
              {
                key: "sel",
                label: "",
                render: (r) => (
                  <input
                    type="checkbox"
                    aria-label={`Select row ${r.row_number}`}
                    checked={selectedRowIds.includes(r.id)}
                    onChange={(e) =>
                      setSelectedRowIds((prev) => (e.target.checked ? [...prev, r.id] : prev.filter((id) => id !== r.id)))
                    }
                  />
                ),
              },
              { key: "num", label: "#", render: (r) => String(r.row_number) },
              { key: "date", label: "Date", render: (r) => (r.effective_date ? formatDate(r.effective_date) : "Invalid") },
              { key: "desc", label: "Description", render: (r) => r.description },
              { key: "amt", label: "Amount", align: "right", render: (r) => formatMinorAmount(r.amount_minor, r.currency, 2) },
              {
                key: "state",
                label: "State",
                render: (r) => (
                  <StatusPill tone={r.state === "posted" || r.state === "matched" ? "success" : r.state === "invalid" || r.state === "failed" ? "danger" : "warning"}>
                    {r.state.replaceAll("_", " ")}
                  </StatusPill>
                ),
              },
              { key: "err", label: "Notes", render: (r) => <span className="text-xs text-danger">{r.error_message}</span> },
            ]}
            renderCard={(r) => (
              <RecordCard
                icon={<FileCsv size={18} weight="duotone" />}
                reference={`Row #${r.row_number} · ${r.effective_date ?? "Invalid date"}`}
                title={r.description}
                amount={formatMinorAmount(r.amount_minor, r.currency, 2)}
                status={<StatusPill tone={r.state === "posted" ? "success" : "warning"}>{r.state}</StatusPill>}
              />
            )}
            empty={<EmptyState icon={FileCsv} title="No rows in this view" description="Run analysis or pick another filter tab." />}
          />
        </div>
      ) : (
        <DataView<ImportBatch>
          title="Recent import batches"
          rows={batches.data ?? []}
          rowKey={(item) => item.id}
          isLoading={batches.isPending}
          isError={batches.isError}
          columns={[
            { key: "id", label: "Batch", render: (item) => `#${item.id}` },
            { key: "status", label: "Status", render: (item) => <StatusPill tone="neutral">{item.status}</StatusPill> },
            { key: "rows", label: "Rows", render: (item) => `${item.posted_count}/${item.total_rows} posted` },
            { key: "date", label: "Created", render: (item) => formatDate(item.created_at) },
            {
              key: "open",
              label: "",
              align: "right",
              render: (item) => <AppButton size="sm" variant="ghost" label="Open" onPress={() => setActiveBatchId(item.id)} />,
            },
          ]}
          renderCard={(item) => (
            <div className="cursor-pointer" onClick={() => setActiveBatchId(item.id)}>
              <RecordCard
                icon={<FileCsv size={18} weight="duotone" />}
                reference={formatDate(item.created_at)}
                title={`Import Batch #${item.id}`}
                amount={`${item.posted_count}/${item.total_rows} posted`}
                status={<StatusPill tone="neutral">{item.status}</StatusPill>}
              />
            </div>
          )}
          empty={<EmptyState icon={FileCsv} title="No CSV imports yet" description="Upload a .csv bank statement above to start." />}
        />
      )}

      <FormDrawer
        isOpen={undoPreview !== null}
        onOpenChange={(open) => !open && setUndoPreview(null)}
        title="Undo import preview"
        submitLabel="Confirm reversal of eligible records"
        isSubmitting={undoExecuteMutation.isPending}
        onSubmit={(e) => {
          e.preventDefault();
          undoExecuteMutation.mutate();
        }}
      >
        {undoPreview ? (
          <div className="space-y-3 text-sm">
            <Alert
              status={undoPreview.blocked_count > 0 ? "warning" : "info"}
              description={`Eligible for reversal: ${undoPreview.eligible_count}. Blocked (locked period or already voided): ${undoPreview.blocked_count}.`}
            />
            {undoPreview.blocked_reasons?.map((reason, idx) => (
              <p key={idx} className="text-xs text-warning-600">{reason}</p>
            ))}
          </div>
        ) : null}
      </FormDrawer>
    </Page>
  );
}

export function CSVImportWorkspace() {
  return <WorkspaceGate>{(ws) => <CSVImportContent key={ws.workspaceId} {...ws} />}</WorkspaceGate>;
}
