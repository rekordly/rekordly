"use client";

import { toast } from "@heroui/react";
import { ArrowsClockwise, BellRinging, Play, Plus, WarningOctagon, XCircle } from "@phosphor-icons/react";
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
import { PERMISSIONS } from "@/lib/permissions-catalog";
import { hasWorkspacePermission, useActiveWorkspace } from "@/stores/workspace-store";
import type { AutomationRule, FailedJob } from "@/types/ai-imports";

import { WorkspaceGate, type WorkspaceInfo } from "../finance/shared";

const TABS = [
  { key: "rules", label: "Automation Rules" },
  { key: "jobs", label: "Failed & Dead-Letter Jobs" },
] as const;

const RULE_TYPES = [
  { key: "invoice_due_reminder", label: "Invoice due reminders" },
  { key: "bill_due_reminder", label: "Bill due reminders" },
  { key: "budget_threshold", label: "Budget threshold alerts" },
  { key: "low_stock_alert", label: "Low-stock & expiry alerts" },
  { key: "import_categorization", label: "Import categorization rules" },
  { key: "document_delivery_retry", label: "Document delivery retries" },
  { key: "domain_verification_poll", label: "Domain verification polling" },
];

function AutomationJobsContent({ workspaceId }: WorkspaceInfo) {
  const scope = useActiveWorkspace();
  const queryClient = useQueryClient();
  const canManageAuto = hasWorkspacePermission(scope, PERMISSIONS.AUTOMATION_MANAGE);
  const canViewJobs = hasWorkspacePermission(scope, PERMISSIONS.JOBS_VIEW_FAILURES);
  const canRetryJobs = hasWorkspacePermission(scope, PERMISSIONS.JOBS_RETRY);

  const [tab, setTab] = useState<"rules" | "jobs">("rules");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ruleKey, setRuleKey] = useState("");
  const [ruleName, setRuleName] = useState("");
  const [ruleType, setRuleType] = useState("invoice_due_reminder");

  const automations = useQuery({
    queryKey: aiImportsKeys.automations(workspaceId),
    queryFn: () => aiImportsApi.listAutomations(workspaceId),
    enabled: canManageAuto,
  });

  const failedJobs = useQuery({
    queryKey: aiImportsKeys.failedJobs(workspaceId),
    queryFn: () => aiImportsApi.listFailedJobs(workspaceId),
    enabled: canViewJobs,
  });

  const saveRule = useMutation({
    mutationFn: () =>
      aiImportsApi.upsertAutomation(workspaceId, ruleKey.trim().toLowerCase(), {
        name: ruleName.trim(),
        rule_type: ruleType,
        is_enabled: true,
      }),
    onSuccess: () => {
      toast.success("Automation rule saved");
      setDrawerOpen(false);
      setRuleKey("");
      setRuleName("");
      void queryClient.invalidateQueries({ queryKey: aiImportsKeys.automations(workspaceId) });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Failed to save rule"),
  });

  const toggleRule = useMutation({
    mutationFn: (r: AutomationRule) =>
      aiImportsApi.upsertAutomation(workspaceId, r.rule_key, {
        name: r.name,
        rule_type: r.rule_type,
        is_enabled: !r.is_enabled,
      }),
    onSuccess: () => {
      toast.success("Automation rule updated");
      void queryClient.invalidateQueries({ queryKey: aiImportsKeys.automations(workspaceId) });
    },
  });

  const runRule = useMutation({
    mutationFn: (key: string) => aiImportsApi.runAutomation(workspaceId, key),
    onSuccess: (res) => {
      toast.success(res.summary);
      void queryClient.invalidateQueries({ queryKey: aiImportsKeys.automations(workspaceId) });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Failed to run rule"),
  });

  const retryJob = useMutation({
    mutationFn: (jobId: number) => aiImportsApi.retryFailedJob(workspaceId, jobId),
    onSuccess: () => {
      toast.success("Retry job queued");
      void queryClient.invalidateQueries({ queryKey: aiImportsKeys.failedJobs(workspaceId) });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Retry failed"),
  });

  const cancelJob = useMutation({
    mutationFn: (jobId: number) => aiImportsApi.cancelFailedJob(workspaceId, jobId),
    onSuccess: () => {
      toast.success("Failed job cancelled");
      void queryClient.invalidateQueries({ queryKey: aiImportsKeys.failedJobs(workspaceId) });
    },
  });

  if (!canManageAuto && !canViewJobs) {
    return (
      <Page>
        <PageHeader title="Automation & Jobs" description="Deterministic rules and background job recovery." />
        <Alert status="error" title="Permission denied" description="You lack automation.manage or jobs.view_failures permissions." />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Automation & Jobs"
        description="Explicit, versioned, alert-only deterministic rules and bounded background job recovery."
        actions={
          canManageAuto && tab === "rules" ? (
            <AppButton startContent={<Plus weight="bold" />} label="Add rule" onPress={() => setDrawerOpen(true)} />
          ) : null
        }
      />

      <Segmented aria-label="Automation sections" options={TABS} value={tab} onChange={setTab} />

      {tab === "rules" ? (
        <DataView<AutomationRule>
          title="Deterministic automation rules"
          rows={automations.data?.rules ?? []}
          rowKey={(r) => r.id}
          isLoading={automations.isPending}
          isError={automations.isError}
          columns={[
            { key: "name", label: "Rule", render: (r) => <span className="font-medium">{r.name}</span> },
            { key: "type", label: "Type", render: (r) => r.rule_type.replaceAll("_", " ") },
            { key: "ver", label: "Version", render: (r) => `v${r.version}` },
            {
              key: "status",
              label: "State",
              render: (r) => <StatusPill tone={r.is_enabled ? "success" : "neutral"}>{r.is_enabled ? "Enabled" : "Disabled"}</StatusPill>,
            },
            {
              key: "actions",
              label: "Actions",
              align: "right",
              render: (r) => (
                <div className="flex justify-end gap-2">
                  <AppButton size="sm" variant="ghost" label={r.is_enabled ? "Disable" : "Enable"} onPress={() => toggleRule.mutate(r)} />
                  <AppButton size="sm" variant="secondary" startContent={<Play size={14} />} label="Run now" onPress={() => runRule.mutate(r.rule_key)} />
                </div>
              ),
            },
          ]}
          renderCard={(r) => (
            <RecordCard
              icon={<BellRinging size={18} weight="duotone" />}
              reference={`${r.rule_type} · v${r.version}`}
              title={r.name}
              amount={r.is_enabled ? "Enabled" : "Disabled"}
              status={<StatusPill tone={r.is_enabled ? "success" : "neutral"}>{r.is_enabled ? "Enabled" : "Disabled"}</StatusPill>}
            />
          )}
          empty={
            <EmptyState
              icon={BellRinging}
              title="No automation rules yet"
              description="Add safe, versioned reminder or categorization rules. Rules never post journals automatically."
            />
          }
        />
      ) : (
        <DataView<FailedJob>
          title="Dead-letter & failed jobs"
          rows={failedJobs.data ?? []}
          rowKey={(j) => j.id}
          isLoading={failedJobs.isPending}
          isError={failedJobs.isError}
          columns={[
            { key: "type", label: "Job type", render: (j) => <span className="font-mono text-xs">{j.job_type}</span> },
            { key: "err", label: "Error class", render: (j) => <StatusPill tone="danger">{j.last_error_class}</StatusPill> },
            { key: "msg", label: "Detail", render: (j) => <span className="text-xs text-default-500">{j.last_error_message}</span> },
            { key: "att", label: "Attempts", render: (j) => String(j.attempts) },
            { key: "date", label: "Failed at", render: (j) => formatDate(j.created_at) },
            {
              key: "actions",
              label: "",
              align: "right",
              render: (j) =>
                canRetryJobs && j.status === "open" ? (
                  <div className="flex justify-end gap-1.5">
                    <AppButton size="sm" startContent={<ArrowsClockwise size={14} />} label="Retry" onPress={() => retryJob.mutate(j.job_id)} />
                    <AppButton size="sm" variant="ghost" startContent={<XCircle size={14} />} label="Cancel" onPress={() => cancelJob.mutate(j.job_id)} />
                  </div>
                ) : (
                  <StatusPill tone="neutral">{j.status}</StatusPill>
                ),
            },
          ]}
          renderCard={(j) => (
            <RecordCard
              icon={<WarningOctagon size={18} weight="duotone" />}
              reference={`${j.job_type} · ${j.attempts} attempts`}
              title={j.last_error_class}
              amount={j.status}
              status={<StatusPill tone={j.status === "open" ? "danger" : "neutral"}>{j.status}</StatusPill>}
            />
          )}
          empty={
            <EmptyState
              icon={WarningOctagon}
              title="No failed jobs"
              description="All background AI, import, and automation jobs are healthy."
            />
          }
        />
      )}

      <FormDrawer
        isOpen={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Add deterministic automation rule"
        submitLabel="Save rule"
        isSubmitting={saveRule.isPending}
        onSubmit={(e) => {
          e.preventDefault();
          saveRule.mutate();
        }}
      >
        <label className="block space-y-1 text-sm">
          <span>Rule key</span>
          <input className="w-full rounded-lg border px-3 py-2" placeholder="invoice-due-3d" value={ruleKey} onChange={(e) => setRuleKey(e.target.value)} required />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Name</span>
          <input className="w-full rounded-lg border px-3 py-2" placeholder="Invoice due reminder (3 days)" value={ruleName} onChange={(e) => setRuleName(e.target.value)} required />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Rule type</span>
          <select className="w-full rounded-lg border px-3 py-2" value={ruleType} onChange={(e) => setRuleType(e.target.value)}>
            {RULE_TYPES.map((rt) => (
              <option key={rt.key} value={rt.key}>
                {rt.label}
              </option>
            ))}
          </select>
        </label>
      </FormDrawer>
    </Page>
  );
}

export function AutomationJobsPage() {
  return <WorkspaceGate>{(ws) => <AutomationJobsContent key={ws.workspaceId} {...ws} />}</WorkspaceGate>;
}
