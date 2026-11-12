"use client";

import { toast } from "@heroui/react";
import { ArrowCounterClockwise, CreditCard, Export, Gauge, ShieldCheck, WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { DataView } from "@/components/ui/data-view";
import { EmptyState, Page, PageHeader, StatusPill } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { StatCard } from "@/components/ui/stat-card";
import { billingApi, billingKeys } from "@/lib/billing";
import { formatDate } from "@/lib/format";
import { formatMinorAmount } from "@/lib/money";
import { PERMISSIONS } from "@/lib/permissions-catalog";
import { hasWorkspacePermission, useActiveWorkspace } from "@/stores/workspace-store";
import type { UsageMeter } from "@/types/billing";

import { WorkspaceGate, type WorkspaceInfo } from "../finance/shared";

function BillingOverviewContent({ workspaceId }: WorkspaceInfo) {
  const scope = useActiveWorkspace();
  const queryClient = useQueryClient();
  const canViewBilling = hasWorkspacePermission(scope, PERMISSIONS.BILLING_VIEW);
  const canCancelResume = hasWorkspacePermission(scope, PERMISSIONS.BILLING_CANCEL_RESUME);
  const canViewDocs = hasWorkspacePermission(scope, PERMISSIONS.BILLING_VIEW_DOCUMENTS);

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

  const usageQ = useQuery({
    queryKey: billingKeys.usage(subjectId ?? 0),
    queryFn: () => billingApi.getUsage(subjectId!),
    enabled: Boolean(subjectId),
  });

  const cancelMut = useMutation({
    mutationFn: () => billingApi.cancelSubscription(subjectId!, "Voluntary cancellation from billing overview"),
    onSuccess: () => {
      toast.success("Subscription set to cancel at period end. All your financial records remain preserved.");
      void queryClient.invalidateQueries({ queryKey: billingKeys.subscription(subjectId!) });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Failed to cancel subscription"),
  });

  const resumeMut = useMutation({
    mutationFn: () => billingApi.resumeSubscription(subjectId!),
    onSuccess: () => {
      toast.success("Subscription resumed");
      void queryClient.invalidateQueries({ queryKey: billingKeys.subscription(subjectId!) });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Failed to resume subscription"),
  });

  if (!canViewBilling) {
    return (
      <Page>
        <PageHeader title="Plan & Billing" description="Workspace subscription and usage meters." />
        <Alert status="error" title="Permission required" description="You lack billing.view permission for this workspace." />
      </Page>
    );
  }

  const snap = snapQ.data;
  const sub = snap?.subscription;
  const plan = snap?.plan;

  return (
    <Page>
      <PageHeader
        title="Plan & Billing"
        description="Subject-scoped entitlements, commercial mode, and usage meters. Downgrade or expiry never deletes owned financial records."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/plans">
              <AppButton variant="secondary" label="Compare plans" />
            </Link>
            <Link href="/settings/entitlements">
              <AppButton variant="tertiary" label="Entitlements" />
            </Link>
            {canViewDocs ? (
              <Link href="/billing/documents">
                <AppButton variant="tertiary" label="Receipts" />
              </Link>
            ) : null}
          </div>
        }
      />

      {snapQ.isError || subjectQ.isError ? (
        <Alert status="warning" title="Offline or stale entitlement snapshot" description="Unable to refresh subscription state from server. Read access and local drafts remain preserved." />
      ) : null}

      {snap?.commercial_mode === "controlled_beta" ? (
        <Alert
          status="info"
          title="Controlled Beta (Free)"
          description="December beta is free with bounded entitlements. Paid checkout and charges are disabled until paid launch."
        />
      ) : null}

      {sub?.state === "past_due" || sub?.state === "grace" ? (
        <Alert
          status="warning"
          title={`Subscription ${sub.state.replaceAll("_", " ")}`}
          description={`Payment recovery needed before ${sub.grace_ends_at ? formatDate(sub.grace_ends_at) : "grace ends"}. Your financial history and exports remain preserved.`}
        />
      ) : null}

      {sub?.state === "pending" ? (
        <Alert status="info" title="Payment confirmation pending" description="We are verifying your checkout with Paystack. Do not retry payment blindly." />
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tag="Current plan"
          tone="primary"
          compact
          isLoading={snapQ.isPending}
          title={plan ? `${plan.display_name} (v${plan.version})` : "—"}
          description={snap ? `Mode: ${snap.commercial_mode.replaceAll("_", " ")}` : ""}
          icon={<CreditCard size={22} />}
        />
        <StatCard
          tag="Price"
          tone="secondary"
          compact
          isLoading={snapQ.isPending}
          title={plan ? formatMinorAmount(plan.price_minor, plan.currency, 2) : "—"}
          description={plan ? `${plan.billing_interval} · rev #${snap?.entitlement_revision ?? 1}` : ""}
          icon={<ShieldCheck size={22} />}
        />
        <StatCard
          tag="Lifecycle state"
          tone={sub?.state === "active" ? "success" : "warning"}
          compact
          isLoading={snapQ.isPending}
          title={sub ? sub.state.replaceAll("_", " ") : "—"}
          description={sub?.paid_through_at ? `Paid through ${formatDate(sub.paid_through_at)}` : "Beta grant"}
          icon={<WarningCircle size={22} />}
        />
        <StatCard
          tag="Billing subject"
          tone="secondary"
          compact
          isLoading={snapQ.isPending}
          title={snap?.subject.subject_type === "business" ? "Business Owner" : "Personal Owner"}
          description={snap?.subject.billing_email || snap?.subject.billing_name || "Workspace owner"}
          icon={<Gauge size={22} />}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/billing/downgrade">
          <AppButton variant="ghost" label="Preview downgrade impact" />
        </Link>
        <Link href="/reports/accounting">
          <AppButton variant="tertiary" startContent={<Export size={16} />} label="Export owned records" />
        </Link>
        {canViewDocs ? (
          <Link href="/billing/transactions">
            <AppButton variant="ghost" label="Billing transactions" />
          </Link>
        ) : null}
        {canCancelResume && sub?.state === "active" ? (
          <AppButton variant="ghost" label="Cancel at period end" isLoading={cancelMut.isPending} onPress={() => cancelMut.mutate()} />
        ) : canCancelResume && sub?.state === "cancel_at_period_end" ? (
          <AppButton startContent={<ArrowCounterClockwise size={16} />} label="Resume subscription" isLoading={resumeMut.isPending} onPress={() => resumeMut.mutate()} />
        ) : null}
      </div>

      <DataView<UsageMeter>
        title="Usage meters"
        rows={usageQ.data ?? []}
        rowKey={(m) => m.feature_key}
        isLoading={usageQ.isPending}
        isError={usageQ.isError}
        columns={[
          { key: "feat", label: "Metric", render: (m) => <span className="font-mono text-xs">{m.feature_key}</span> },
          { key: "used", label: "Used / Reserved", render: (m) => `${m.consumed} / ${m.reserved} reserved` },
          { key: "limit", label: "Limit", align: "right", render: (m) => String(m.limit) },
          {
            key: "warn",
            label: "Status",
            render: (m) => (
              <StatusPill tone={m.warning_level === "reached_100" ? "danger" : m.warning_level === "ok" ? "success" : "warning"}>
                {m.warning_level === "reached_100"
                  ? "100% limit reached"
                  : m.warning_level === "warn_90"
                    ? `${m.percent_used}% (near limit)`
                    : m.warning_level === "warn_70"
                      ? `${m.percent_used}% warning`
                      : `${m.percent_used}% OK`}
              </StatusPill>
            ),
          },
          { key: "reset", label: "Resets", render: (m) => formatDate(m.period_end) },
        ]}
        renderCard={(m) => (
          <RecordCard
            icon={<Gauge size={18} weight="duotone" />}
            reference={`Resets ${formatDate(m.period_end)}`}
            title={m.feature_key}
            amount={`${m.consumed} / ${m.limit}`}
            status={<StatusPill tone={m.warning_level === "reached_100" ? "danger" : "neutral"}>{m.percent_used}%</StatusPill>}
          />
        )}
        empty={<EmptyState icon={Gauge} title="No usage meters yet" description="Usage counters appear as records and AI drafts are created." />}
      />
    </Page>
  );
}

export function BillingOverviewPage() {
  return <WorkspaceGate>{(ws) => <BillingOverviewContent key={ws.workspaceId} {...ws} />}</WorkspaceGate>;
}
