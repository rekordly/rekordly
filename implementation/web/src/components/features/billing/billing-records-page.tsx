"use client";

import { toast } from "@heroui/react";
import { DownloadSimple, FileText, Receipt, ShieldCheck, WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { DataView } from "@/components/ui/data-view";
import { EmptyState, Page, PageHeader, StatusPill } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { billingApi, billingKeys } from "@/lib/billing";
import { formatDate } from "@/lib/format";
import { formatMinorAmount } from "@/lib/money";
import { PERMISSIONS } from "@/lib/permissions-catalog";
import { hasWorkspacePermission, useActiveWorkspace } from "@/stores/workspace-store";
import type { BillingDocument, BillingTransaction } from "@/types/billing";

import { WorkspaceGate, type WorkspaceInfo } from "../finance/shared";

function BillingTransactionsContent({ workspaceId }: WorkspaceInfo) {
  const scope = useActiveWorkspace();
  const canViewDocs = hasWorkspacePermission(scope, PERMISSIONS.BILLING_VIEW_DOCUMENTS);
  const subjectQ = useQuery({
    queryKey: billingKeys.workspaceSubject(workspaceId),
    queryFn: () => billingApi.getWorkspaceBillingSubject(workspaceId),
    enabled: canViewDocs,
  });
  const subjectId = subjectQ.data?.subject.id;
  const txQ = useQuery({
    queryKey: billingKeys.transactions(subjectId ?? 0),
    queryFn: () => billingApi.listTransactions(subjectId!),
    enabled: Boolean(subjectId) && canViewDocs,
  });

  if (!canViewDocs) {
    return (
      <Page>
        <PageHeader title="Billing Transactions" description="Rekordly subscription charges and refunds." />
        <Alert status="error" title="Permission required" description="Staff cannot view billing instruments or receipts by default (billing.view_documents required)." />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader title="Billing Transactions" description="Verified subscription charges, renewals, and refunds." />
      <DataView<BillingTransaction>
        title="Transactions"
        rows={txQ.data ?? []}
        rowKey={(t) => t.id}
        isLoading={txQ.isPending}
        isError={txQ.isError}
        columns={[
          { key: "date", label: "Date", render: (t) => formatDate(t.created_at) },
          { key: "type", label: "Type", render: (t) => t.tx_type },
          { key: "ref", label: "Reference", render: (t) => <span className="font-mono text-xs">{t.provider_ref || "—"}</span> },
          { key: "amt", label: "Amount", align: "right", render: (t) => formatMinorAmount(t.amount_minor, t.currency, 2) },
          { key: "status", label: "Status", render: (t) => <StatusPill tone={t.status === "succeeded" ? "success" : "warning"}>{t.status}</StatusPill> },
        ]}
        renderCard={(t) => (
          <RecordCard
            icon={<Receipt size={18} weight="duotone" />}
            reference={formatDate(t.created_at)}
            title={`${t.tx_type} · ${t.provider_ref || "internal"}`}
            amount={formatMinorAmount(t.amount_minor, t.currency, 2)}
            status={<StatusPill tone={t.status === "succeeded" ? "success" : "warning"}>{t.status}</StatusPill>}
          />
        )}
        empty={<EmptyState icon={Receipt} title="No billing transactions" description="No subscription charges have occurred yet." />}
      />
    </Page>
  );
}

function BillingDocumentsContent({ workspaceId }: WorkspaceInfo) {
  const scope = useActiveWorkspace();
  const canViewDocs = hasWorkspacePermission(scope, PERMISSIONS.BILLING_VIEW_DOCUMENTS);
  const subjectQ = useQuery({
    queryKey: billingKeys.workspaceSubject(workspaceId),
    queryFn: () => billingApi.getWorkspaceBillingSubject(workspaceId),
    enabled: canViewDocs,
  });
  const subjectId = subjectQ.data?.subject.id;
  const docsQ = useQuery({
    queryKey: billingKeys.documents(subjectId ?? 0),
    queryFn: () => billingApi.listDocuments(subjectId!),
    enabled: Boolean(subjectId) && canViewDocs,
  });

  if (!canViewDocs) {
    return (
      <Page>
        <PageHeader title="Billing Documents" description="Rekordly subscription receipts and invoices." />
        <Alert status="error" title="Permission required" description="Staff cannot view billing documents (billing.view_documents required)." />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader title="Billing Documents" description="Downloadable Rekordly receipts, separate from your Business customer invoices." />
      <DataView<BillingDocument>
        title="Documents"
        rows={docsQ.data ?? []}
        rowKey={(d) => d.id}
        isLoading={docsQ.isPending}
        isError={docsQ.isError}
        columns={[
          { key: "num", label: "Document #", render: (d) => <span className="font-mono text-xs">{d.document_number}</span> },
          { key: "type", label: "Type", render: (d) => d.document_type },
          { key: "period", label: "Service period", render: (d) => d.service_period },
          { key: "total", label: "Total", align: "right", render: (d) => formatMinorAmount(d.total_minor, d.currency, 2) },
          {
            key: "dl",
            label: "",
            align: "right",
            render: (d) => (
              <a href={`/api/v1/billing-documents/${d.id}/download`} target="_blank" rel="noreferrer">
                <AppButton size="sm" variant="ghost" startContent={<DownloadSimple size={14} />} label="Download" />
              </a>
            ),
          },
        ]}
        renderCard={(d) => (
          <RecordCard
            icon={<FileText size={18} weight="duotone" />}
            reference={d.service_period}
            title={d.document_number}
            amount={formatMinorAmount(d.total_minor, d.currency, 2)}
            status={<StatusPill tone="neutral">{d.document_type}</StatusPill>}
          />
        )}
        empty={<EmptyState icon={FileText} title="No billing documents yet" description="Receipts appear after verified subscription payments." />}
      />
    </Page>
  );
}

function DowngradeImpactContent({ workspaceId }: WorkspaceInfo) {
  const scope = useActiveWorkspace();
  const queryClient = useQueryClient();
  const canViewBilling = hasWorkspacePermission(scope, PERMISSIONS.BILLING_VIEW);
  const canManage = hasWorkspacePermission(scope, PERMISSIONS.BILLING_MANAGE_PLAN);
  const [targetPlanId, setTargetPlanId] = useState<string>("");

  const subjectQ = useQuery({
    queryKey: billingKeys.workspaceSubject(workspaceId),
    queryFn: () => billingApi.getWorkspaceBillingSubject(workspaceId),
    enabled: canViewBilling,
  });
  const plansQ = useQuery({
    queryKey: billingKeys.plans(),
    queryFn: () => billingApi.listPlans({ is_addon: false }),
    enabled: canViewBilling,
  });

  const subjectId = subjectQ.data?.subject.id;
  const resolvedTarget = Number(targetPlanId) || plansQ.data?.[0]?.id || 0;

  const impactQ = useQuery({
    queryKey: ["bp13", "downgrade-impact", subjectId, resolvedTarget],
    queryFn: () => billingApi.getDowngradeImpact(subjectId!, resolvedTarget),
    enabled: Boolean(subjectId && resolvedTarget),
  });

  const changeMut = useMutation({
    mutationFn: () => billingApi.changePlan(subjectId!, { target_plan_version_id: resolvedTarget, accept_downgrade: true }, `dg-${subjectId}-${Date.now()}`),
    onSuccess: () => {
      toast.success("Plan updated. All historical records remain preserved.");
      void queryClient.invalidateQueries({ queryKey: billingKeys.subscription(subjectId!) });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Plan change failed"),
  });

  if (!canViewBilling) {
    return (
      <Page>
        <PageHeader title="Downgrade Impact" description="Preview restrictions before changing plans." />
        <Alert status="error" title="Permission required" description="You lack billing.view permission." />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Downgrade Impact & Data Preservation"
        description="Downgrade restricts new capacity above target limits — it never deletes journals, transactions, invoices, customers, or files."
        actions={
          <Link href="/reports/accounting">
            <AppButton variant="tertiary" label="Export all records" />
          </Link>
        }
      />

      <div className="rounded-xl border border-default-200 bg-content1 p-4 space-y-3">
        <label className="block text-sm space-y-1">
          <span>Target plan version</span>
          <select className="w-full max-w-sm rounded-lg border px-3 py-2" value={String(resolvedTarget)} onChange={(e) => setTargetPlanId(e.target.value)}>
            {(plansQ.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name} (v{p.version}) — {formatMinorAmount(p.price_minor, p.currency, 2)}
              </option>
            ))}
          </select>
        </label>

        {impactQ.isPending ? (
          <p className="text-sm text-default-500">Calculating excess resources and preserved history...</p>
        ) : impactQ.isError ? (
          <Alert status="error" description="Unable to load downgrade impact." />
        ) : impactQ.data ? (
          <div className="space-y-3">
            <Alert status="info" title="Preservation guarantee" description={impactQ.data.preserved_guarantee} />
            {impactQ.data.excess_items.length === 0 ? (
              <Alert status="success" description="All active resources fit within the target plan limits." />
            ) : (
              <div className="space-y-2">
                {impactQ.data.excess_items.map((item) => (
                  <div key={item.resource_type} className="rounded-lg border p-3 text-sm">
                    <div className="flex justify-between font-medium">
                      <span className="font-mono text-xs">{item.resource_type}</span>
                      <span>
                        {item.current_count} active / {item.target_limit} limit ({item.excess_count} excess)
                      </span>
                    </div>
                    <p className="text-xs text-default-500 mt-1">{item.preservation}</p>
                  </div>
                ))}
              </div>
            )}
            {canManage ? (
              <AppButton
                variant="secondary"
                startContent={<WarningCircle size={16} />}
                label="Confirm plan change with preservation"
                isLoading={changeMut.isPending}
                onPress={() => changeMut.mutate()}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </Page>
  );
}

function EntitlementsMatrixContent({ workspaceId }: WorkspaceInfo) {
  const scope = useActiveWorkspace();
  const canViewBilling = hasWorkspacePermission(scope, PERMISSIONS.BILLING_VIEW);
  const subjectQ = useQuery({
    queryKey: billingKeys.workspaceSubject(workspaceId),
    queryFn: () => billingApi.getWorkspaceBillingSubject(workspaceId),
    enabled: canViewBilling,
  });
  const subjectId = subjectQ.data?.subject.id;
  const snapQ = useQuery({
    queryKey: billingKeys.subscription(subjectId ?? 0),
    queryFn: () => billingApi.getSubscription(subjectId!),
    enabled: Boolean(subjectId),
  });

  if (!canViewBilling) {
    return (
      <Page>
        <PageHeader title="Entitlements" description="Server-resolved feature keys." />
        <Alert status="error" title="Permission required" description="You lack billing.view permission." />
      </Page>
    );
  }

  const rows = Object.values(snapQ.data?.features ?? {});

  return (
    <Page>
      <PageHeader title="Feature Entitlements" description="Authoritative server-resolved feature keys for this workspace." />
      <DataView
        title="Resolved feature keys"
        rows={rows}
        rowKey={(r) => r.feature_key}
        isLoading={snapQ.isPending}
        isError={snapQ.isError}
        columns={[
          { key: "k", label: "Feature key", render: (r) => <span className="font-mono text-xs">{r.feature_key}</span> },
          { key: "t", label: "Type", render: (r) => r.grant_type },
          {
            key: "v",
            label: "Granted value",
            render: (r) =>
              r.grant_type === "boolean" ? (
                <StatusPill tone={r.bool_value ? "success" : "neutral"}>{r.bool_value ? "Enabled" : "Not included"}</StatusPill>
              ) : r.grant_type === "enum" ? (
                r.text_value
              ) : (
                String(r.int_value)
              ),
          },
          { key: "s", label: "Source", render: (r) => <span className="text-xs text-default-500">{r.source}</span> },
        ]}
        renderCard={(r) => (
          <RecordCard
            icon={<ShieldCheck size={18} weight="duotone" />}
            reference={r.source}
            title={r.feature_key}
            amount={r.grant_type === "boolean" ? (r.bool_value ? "Enabled" : "Locked") : r.grant_type === "enum" ? r.text_value : String(r.int_value)}
          />
        )}
        empty={<EmptyState icon={ShieldCheck} title="No entitlements loaded" description="Select a workspace to inspect entitlements." />}
      />
    </Page>
  );
}

export function BillingTransactionsPage() {
  return <WorkspaceGate>{(ws) => <BillingTransactionsContent key={ws.workspaceId} {...ws} />}</WorkspaceGate>;
}

export function BillingDocumentsPage() {
  return <WorkspaceGate>{(ws) => <BillingDocumentsContent key={ws.workspaceId} {...ws} />}</WorkspaceGate>;
}

export function BillingDowngradePage() {
  return <WorkspaceGate>{(ws) => <DowngradeImpactContent key={ws.workspaceId} {...ws} />}</WorkspaceGate>;
}

export function EntitlementsMatrixPage() {
  return <WorkspaceGate>{(ws) => <EntitlementsMatrixContent key={ws.workspaceId} {...ws} />}</WorkspaceGate>;
}
