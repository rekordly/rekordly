"use client";

import { toast } from "@heroui/react";
import { CheckCircle, CreditCard, Sparkle } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { DataView } from "@/components/ui/data-view";
import { EmptyState, Page, PageHeader, StatusPill } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { billingApi, billingKeys } from "@/lib/billing";
import { formatMinorAmount } from "@/lib/money";
import { PERMISSIONS } from "@/lib/permissions-catalog";
import { hasWorkspacePermission, useActiveWorkspace } from "@/stores/workspace-store";
import type { PlanVersion } from "@/types/billing";

import { WorkspaceGate, type WorkspaceInfo } from "../finance/shared";

function PlansCompareContent({ workspaceId }: WorkspaceInfo) {
  const scope = useActiveWorkspace();
  const router = useRouter();
  const canViewBilling = hasWorkspacePermission(scope, PERMISSIONS.BILLING_VIEW);
  const canManagePlan = hasWorkspacePermission(scope, PERMISSIONS.BILLING_MANAGE_PLAN);

  const modeQ = useQuery({
    queryKey: billingKeys.commercialMode(),
    queryFn: () => billingApi.getCommercialMode(),
  });

  const plansQ = useQuery({
    queryKey: billingKeys.plans(),
    queryFn: () => billingApi.listPlans(),
  });

  const subjectQ = useQuery({
    queryKey: billingKeys.workspaceSubject(workspaceId),
    queryFn: () => billingApi.getWorkspaceBillingSubject(workspaceId),
    enabled: canViewBilling,
  });

  const checkoutMut = useMutation({
    mutationFn: (planVersionId: number) =>
      billingApi.createCheckoutIntent(subjectQ.data!.subject.id, planVersionId, `chk-${workspaceId}-${planVersionId}-${Date.now()}`),
    onSuccess: (intent) => {
      if (intent.authorization_url) {
        window.location.href = intent.authorization_url;
      } else {
        toast.success(`Checkout intent ${intent.reference} created`);
        router.push(`/billing/checkout?intentId=${intent.id}`);
      }
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Checkout unavailable"),
  });

  if (!canViewBilling) {
    return (
      <Page>
        <PageHeader title="Compare Plans" description="Free, Personal Plus, Business, and add-ons." />
        <Alert status="error" title="Permission required" description="You lack billing.view permission." />
      </Page>
    );
  }

  const checkoutEnabled = modeQ.data?.checkout_enabled ?? false;
  const currentPlanId = subjectQ.data?.subscription.plan_version_id;

  return (
    <Page>
      <PageHeader
        title="Plans & Add-ons"
        description="Immutable versioned plans in minor units. Personal Plus never unlocks Business; staff inherit employer Business grants."
        actions={
          <Link href="/billing">
            <AppButton variant="tertiary" label="Back to billing" />
          </Link>
        }
      />

      {modeQ.isError ? <Alert status="error" description="Unable to load commercial mode status." /> : null}

      {modeQ.data && !checkoutEnabled ? (
        <Alert
          status="info"
          title={`Commercial mode: ${modeQ.data.mode.replaceAll("_", " ")}`}
          description="Paid checkout is currently disabled. You can compare plan hypotheses and limits without any charge."
        />
      ) : null}

      <DataView<PlanVersion>
        title="Plan versions & add-ons"
        rows={plansQ.data ?? []}
        rowKey={(p) => p.id}
        isLoading={plansQ.isPending}
        isError={plansQ.isError}
        columns={[
          {
            key: "name",
            label: "Plan / Add-on",
            render: (p) => (
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.display_name}</span>
                  <StatusPill tone="neutral">{`v${p.version}`}</StatusPill>
                  {p.is_addon ? <StatusPill tone="warning">Add-on</StatusPill> : null}
                </div>
                <p className="text-xs text-default-500">
                  {p.subject_type} · {p.billing_interval} · {p.tax_behavior} tax
                </p>
              </div>
            ),
          },
          { key: "price", label: "Price", align: "right", render: (p) => formatMinorAmount(p.price_minor, p.currency, 2) },
          {
            key: "action",
            label: "",
            align: "right",
            render: (p) =>
              currentPlanId === p.id ? (
                <StatusPill tone="success">Current plan</StatusPill>
              ) : canManagePlan && checkoutEnabled && Number(p.price_minor) > 0 ? (
                <AppButton
                  size="sm"
                  startContent={<CreditCard size={14} />}
                  label="Select"
                  isLoading={checkoutMut.isPending}
                  onPress={() => checkoutMut.mutate(p.id)}
                />
              ) : (
                <StatusPill tone="neutral">{checkoutEnabled ? "Included" : "Beta preview"}</StatusPill>
              ),
          },
        ]}
        renderCard={(p) => (
          <RecordCard
            icon={p.is_addon ? <Sparkle size={18} weight="duotone" /> : <CheckCircle size={18} weight="duotone" />}
            reference={`${p.subject_type} · ${p.billing_interval} · v${p.version}`}
            title={p.display_name}
            amount={formatMinorAmount(p.price_minor, p.currency, 2)}
            status={<StatusPill tone={currentPlanId === p.id ? "success" : "neutral"}>{currentPlanId === p.id ? "Current" : p.is_addon ? "Add-on" : "Plan"}</StatusPill>}
          />
        )}
        empty={<EmptyState icon={CreditCard} title="No plans available" description="Plan versions have not been configured." />}
      />
    </Page>
  );
}

export function PlansComparePage() {
  return <WorkspaceGate>{(ws) => <PlansCompareContent key={ws.workspaceId} {...ws} />}</WorkspaceGate>;
}
