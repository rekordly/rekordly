"use client";

import { toast } from "@heroui/react";
import { CheckCircle, MagicWand, Scales, Sparkle, Trash } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
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
import type { AIDraft } from "@/types/ai-imports";

import { WorkspaceGate, type WorkspaceInfo } from "../finance/shared";

const STATUS_FILTERS = [
  { key: "", label: "All drafts" },
  { key: "needs_review", label: "Needs review" },
  { key: "draft", label: "Ready" },
  { key: "confirmed", label: "Confirmed" },
] as const;

function AICaptureContent({ workspaceId, currency, isBusiness }: WorkspaceInfo) {
  const scope = useActiveWorkspace();
  const queryClient = useQueryClient();
  const canUseAI = hasWorkspacePermission(scope, PERMISSIONS.AI_USE);
  const canConfirm = hasWorkspacePermission(scope, PERMISSIONS.IMPORTS_CONFIRM) || hasWorkspacePermission(scope, PERMISSIONS.MONEY_VIEW);

  const [narration, setNarration] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [editingDraft, setEditingDraft] = useState<AIDraft | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editAccountId, setEditAccountId] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [previewDraftId, setPreviewDraftId] = useState<number | null>(null);

  const usage = useQuery({
    queryKey: aiImportsKeys.aiUsage(workspaceId),
    queryFn: () => aiImportsApi.getAIUsage(workspaceId),
    enabled: canUseAI,
  });

  const drafts = useQuery({
    queryKey: aiImportsKeys.aiDrafts(workspaceId, statusFilter),
    queryFn: () => aiImportsApi.listAIDrafts(workspaceId, statusFilter || undefined),
    enabled: canUseAI,
  });

  const accounts = useQuery({
    queryKey: moneyKeys.accounts(workspaceId),
    queryFn: () => moneyApi.listAccounts({ workspaceId }),
    enabled: editingDraft !== null,
  });

  const preview = useQuery({
    queryKey: ["bp12", workspaceId, "ai-preview", previewDraftId],
    queryFn: () => aiImportsApi.previewAIDraft(workspaceId, previewDraftId!),
    enabled: previewDraftId !== null,
  });

  const parseMutation = useMutation({
    mutationFn: () =>
      aiImportsApi.parseMoneyDraft(
        workspaceId,
        { narration, scope_hint: isBusiness ? "business" : "personal" },
        `ai-parse-${workspaceId}-${Date.now()}`,
      ),
    onSuccess: (res) => {
      toast.success(`Created ${res.drafts.length} AI-assisted draft(s) for review`);
      setNarration("");
      void queryClient.invalidateQueries({ queryKey: aiImportsKeys.aiDrafts(workspaceId, statusFilter) });
      void queryClient.invalidateQueries({ queryKey: aiImportsKeys.aiUsage(workspaceId) });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "AI parsing failed — you can always enter manually."),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      aiImportsApi.updateAIDraft(workspaceId, editingDraft!.id, {
        amount_major: editAmount || undefined,
        effective_date: editDate || undefined,
        account_id: editAccountId ? Number(editAccountId) : undefined,
        description: editDesc || undefined,
      }),
    onSuccess: () => {
      toast.success("Draft updated");
      setEditingDraft(null);
      void queryClient.invalidateQueries({ queryKey: aiImportsKeys.aiDrafts(workspaceId, statusFilter) });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Failed to update draft"),
  });

  const confirmMutation = useMutation({
    mutationFn: (draftId: number) => aiImportsApi.confirmAIDraft(workspaceId, draftId, `confirm-ai-${workspaceId}-${draftId}`),
    onSuccess: () => {
      toast.success("Draft confirmed and posted through deterministic accounting rules");
      void queryClient.invalidateQueries({ queryKey: aiImportsKeys.aiDrafts(workspaceId, statusFilter) });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Confirmation blocked — check missing fields"),
  });

  const discardMutation = useMutation({
    mutationFn: (draftId: number) => aiImportsApi.discardAIDraft(workspaceId, draftId),
    onSuccess: () => {
      toast.success("Draft discarded");
      void queryClient.invalidateQueries({ queryKey: aiImportsKeys.aiDrafts(workspaceId, statusFilter) });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Failed to discard draft"),
  });

  if (!canUseAI) {
    return (
      <Page>
        <PageHeader title="Type what happened" description="AI-assisted money capture." />
        <Alert status="error" title="Permission required" description="You do not have permission (ai.use) to use AI capture in this workspace. Manual entry remains available." />
        <Link href="/transactions/new">
          <AppButton label="Switch to manual entry" />
        </Link>
      </Page>
    );
  }

  const u = usage.data;
  const noCredits = u ? u.credits_remaining <= 0 || !u.plan_entitled : false;

  return (
    <Page>
      <PageHeader
        title="Type what happened"
        description="Describe transactions in plain language. AI creates untrusted drafts only — nothing posts until you review and confirm."
        actions={
          <Link href="/transactions/new">
            <AppButton variant="tertiary" label="Switch to manual entry" />
          </Link>
        }
      />

      {u && !u.provider_configured ? (
        <Alert
          status="warning"
          title="AI provider offline or unconfigured"
          description="Server-side AI keys are not configured. Manual transaction entry remains fully available."
        />
      ) : null}

      {noCredits ? (
        <Alert
          status="warning"
          title="AI credits exhausted"
          description="Your workspace AI credit limit is reached. Switch to manual entry at any time."
        />
      ) : null}

      <div className="rounded-xl border border-default-200 bg-content1 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-default-500">
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <Sparkle size={16} weight="duotone" />
            AI-assisted draft parser ({u ? `${u.credits_remaining} of ${u.monthly_credit_limit} credits left` : "loading quota..."})
          </span>
          <span>Max 2,000 characters · Server-validated</span>
        </div>

        <textarea
          aria-label="Describe what happened"
          className="w-full min-h-[92px] rounded-lg border border-default-300 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder='Example: "I received ₦50,000 from Ada for design and spent ₦8,000 on data today."'
          value={narration}
          maxLength={2000}
          onChange={(e) => setNarration(e.target.value)}
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-default-500">
            Complex items (invoice allocation, loans, tax, inventory) will route to specialized manual forms.
          </span>
          <AppButton
            startContent={<MagicWand size={16} />}
            label="Create AI draft"
            isLoading={parseMutation.isPending}
            isDisabled={!narration.trim() || noCredits}
            onPress={() => parseMutation.mutate()}
          />
        </div>
      </div>

      <Segmented aria-label="Draft status filter" options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />

      <DataView<AIDraft>
        title="AI-assisted drafts"
        rows={drafts.data ?? []}
        rowKey={(d) => d.id}
        isLoading={drafts.isPending}
        isError={drafts.isError}
        columns={[
          {
            key: "desc",
            label: "Proposed record",
            render: (d) => (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{d.description || d.purpose}</span>
                  <StatusPill tone="neutral">AI-assisted</StatusPill>
                </div>
                {d.missing_fields.length > 0 ? (
                  <p className="text-xs text-warning-600">
                    Uncertain / missing: {d.missing_fields.join(", ")}
                  </p>
                ) : null}
                {d.route_to_manual_flow ? (
                  <p className="text-xs text-primary">
                    Specialized workflow required:{" "}
                    <Link href={d.route_to_manual_flow} className="underline">
                      Open {d.route_to_manual_flow}
                    </Link>
                  </p>
                ) : null}
              </div>
            ),
          },
          { key: "date", label: "Date", render: (d) => (d.effective_date ? formatDate(d.effective_date) : "Missing date") },
          {
            key: "amount",
            label: "Amount",
            align: "right",
            render: (d) => (d.amount_major ? formatMinorAmount(d.amount_minor, d.currency || currency, d.currency_exponent) : "Missing"),
          },
          {
            key: "status",
            label: "Status",
            render: (d) => (
              <StatusPill tone={d.status === "confirmed" ? "success" : d.status === "needs_review" ? "warning" : "neutral"}>
                {d.status === "needs_review" ? "Needs review" : d.status === "draft" ? "Ready to confirm" : d.status}
              </StatusPill>
            ),
          },
          {
            key: "actions",
            label: "Actions",
            align: "right",
            render: (d) =>
              d.status === "draft" || d.status === "needs_review" ? (
                <div className="flex justify-end gap-1.5">
                  <AppButton
                    size="sm"
                    variant="ghost"
                    label="Edit"
                    onPress={() => {
                      setEditingDraft(d);
                      setEditAmount(d.amount_major);
                      setEditDate(d.effective_date ?? "");
                      setEditAccountId(d.account_id ? String(d.account_id) : "");
                      setEditDesc(d.description);
                    }}
                  />
                  <AppButton size="sm" variant="ghost" startContent={<Scales size={14} />} label="Preview" onPress={() => setPreviewDraftId(d.id)} />
                  {canConfirm && d.status === "draft" && !d.route_to_manual_flow ? (
                    <AppButton
                      size="sm"
                      startContent={<CheckCircle size={14} />}
                      label="Confirm"
                      isLoading={confirmMutation.isPending}
                      onPress={() => confirmMutation.mutate(d.id)}
                    />
                  ) : null}
                  <AppButton size="sm" variant="ghost" startContent={<Trash size={14} />} label="Discard" onPress={() => discardMutation.mutate(d.id)} />
                </div>
              ) : null,
          },
        ]}
        renderCard={(d) => (
          <RecordCard
            icon={<Sparkle size={18} weight="duotone" />}
            reference={`AI-assisted · ${d.effective_date ?? "Missing date"}`}
            title={d.description || d.purpose}
            amount={d.amount_major ? formatMinorAmount(d.amount_minor, d.currency || currency, d.currency_exponent) : "Needs amount"}
            status={<StatusPill tone={d.status === "confirmed" ? "success" : d.status === "needs_review" ? "warning" : "neutral"}>{d.status}</StatusPill>}
          />
        )}
        empty={
          <EmptyState
            icon={Sparkle}
            title="No AI drafts yet"
            description="Describe a transaction above to create an AI-assisted draft, or switch to manual entry."
          />
        }
      />

      <FormDrawer
        isOpen={editingDraft !== null}
        onOpenChange={(open) => !open && setEditingDraft(null)}
        title="Review & clarify AI draft"
        submitLabel="Save draft"
        isSubmitting={updateMutation.isPending}
        onSubmit={(e) => {
          e.preventDefault();
          updateMutation.mutate();
        }}
      >
        <label className="block space-y-1 text-sm">
          <span>Description</span>
          <input className="w-full rounded-lg border px-3 py-2" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} required />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Amount ({editingDraft?.currency ?? currency})</span>
          <input className="w-full rounded-lg border px-3 py-2" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} required />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Effective date (YYYY-MM-DD)</span>
          <input type="date" className="w-full rounded-lg border px-3 py-2" value={editDate} onChange={(e) => setEditDate(e.target.value)} required />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Account</span>
          <select className="w-full rounded-lg border px-3 py-2" value={editAccountId} onChange={(e) => setEditAccountId(e.target.value)} required>
            <option value="">Select account...</option>
            {(accounts.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
        </label>
      </FormDrawer>

      <FormDrawer
        isOpen={previewDraftId !== null}
        onOpenChange={(open) => !open && setPreviewDraftId(null)}
        title="Deterministic accounting effect preview"
        submitLabel="Close"
        onSubmit={(e) => {
          e.preventDefault();
          setPreviewDraftId(null);
        }}
      >
        {preview.isPending ? (
          <p className="text-sm text-default-500">Computing balanced ledger lines from server posting template...</p>
        ) : preview.isError ? (
          <Alert status="warning" description="Fill missing amount, date, or account before previewing ledger lines." />
        ) : preview.data ? (
          <div className="space-y-2 text-sm">
            <p className="text-xs text-default-500">Template: {preview.data.template_key}</p>
            {preview.data.lines.map((l, i) => (
              <div key={i} className="flex justify-between rounded border p-2">
                <span>
                  {l.chart_account_code} {l.chart_account_name}
                </span>
                <span className="font-mono text-xs">
                  Dr {formatMinorAmount(l.debit_minor, currency, 2)} / Cr {formatMinorAmount(l.credit_minor, currency, 2)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </FormDrawer>
    </Page>
  );
}

export function AICaptureWorkspace() {
  return <WorkspaceGate>{(ws) => <AICaptureContent key={ws.workspaceId} {...ws} />}</WorkspaceGate>;
}
