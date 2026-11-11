"use client";

import { CheckCircle, Eye, MagicWand, PencilSimple } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { DashboardCard } from "@/components/ui/dashboard-card";
import { EmptyState, Page, PageHeader, SectionHeader, Segmented, StatusPill } from "@/components/ui/page";
import { openPrivateEvidence } from "@/lib/evidence";
import { formatMinorAmount, moneyApi, moneyKeys } from "@/lib/money";
import { createIdempotencyKey } from "@/lib/utils";
import { useActiveWorkspace } from "@/stores/workspace-store";
import type { MoneyRecordDraft } from "@/types/finance";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "ai", label: "AI review" },
  { key: "offline", label: "Offline drafts" },
] as const;

type Filter = (typeof FILTERS)[number]["key"];

function sourceFor(draft: MoneyRecordDraft): { label: string; tone: "warning" | "accent" | "neutral" } {
  if (draft.entry_method === "ai_assisted") return { label: "AI review", tone: "warning" };
  if (draft.entry_method === "offline") return { label: "Offline draft", tone: "accent" };
  return { label: "Manual review", tone: "neutral" };
}

function titleFor(draft: MoneyRecordDraft): string {
  return draft.description || draft.counterparty_name || `${draft.direction === "money_in" ? "Income" : draft.direction === "transfer" ? "Transfer" : "Expense"} record`;
}

function displayState(draft: MoneyRecordDraft): { label: string; tone: "warning" | "accent" | "neutral" } {
  if (draft.state === "needs_review") return { label: "Needs review", tone: "warning" };
  if (draft.state === "saved") return { label: "Ready for preview", tone: "accent" };
  return { label: draft.state, tone: "neutral" };
}

export function ReviewInboxWorkspace() {
  const { active, mode } = useActiveWorkspace();
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirmationKey = useRef(createIdempotencyKey("review-confirm"));
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);

  const reviewDrafts = useQuery({
    queryKey: active ? [...moneyKeys.workspace(active.id), "drafts", "needs_review"] : ["money", "no-workspace", "drafts"],
    queryFn: () => moneyApi.listMoneyRecordDrafts(active!.id, "needs_review"),
    enabled: Boolean(active),
  });
  const savedDrafts = useQuery({
    queryKey: active ? [...moneyKeys.workspace(active.id), "drafts", "saved"] : ["money", "no-workspace", "saved-drafts"],
    queryFn: () => moneyApi.listMoneyRecordDrafts(active!.id, "saved"),
    enabled: Boolean(active),
  });
  const drafts = useMemo(() => {
    const merged = [...(reviewDrafts.data?.drafts ?? []), ...(savedDrafts.data?.drafts ?? [])];
    return merged.filter((draft, index) => merged.findIndex((candidate) => candidate.id === draft.id) === index);
  }, [reviewDrafts.data?.drafts, savedDrafts.data?.drafts]);
  const filtered = drafts.filter((draft) => filter === "all" || (filter === "ai" ? draft.entry_method === "ai_assisted" : draft.entry_method === "offline"));
  const selected = filtered.find((draft) => draft.id === selectedId) ?? filtered[0] ?? null;
  const preview = useQuery({
    queryKey: active && selected ? [...moneyKeys.workspace(active.id), "draft-preview", selected.id, selected.version] : ["money", "empty-preview"],
    queryFn: () => moneyApi.previewMoneyRecordDraft(active!.id, selected!.id),
    enabled: Boolean(active && selected),
  });
  const draftDetail = useQuery({
    queryKey: active && selected ? [...moneyKeys.workspace(active.id), "draft", selected.id] : ["money", "empty-draft-detail"],
    queryFn: () => moneyApi.getMoneyRecordDraft(active!.id, selected!.id),
    enabled: Boolean(active && selected),
  });
  const currentDraft = draftDetail.data?.draft ?? selected;
  const confirm = useMutation({
    mutationFn: () => moneyApi.confirmMoneyRecord(active!.id, currentDraft!.id, currentDraft!.version, confirmationKey.current),
    onSuccess: () => {
      confirmationKey.current = createIdempotencyKey("review-confirm");
      setSelectedId(null);
      void queryClient.invalidateQueries({ queryKey: moneyKeys.workspace(active!.id) });
    },
  });

  if (!active || mode === "all") {
    return <Page><PageHeader title="Review inbox" description="Choose Personal or Business to review records in that space." /><DashboardCard><EmptyState icon={Eye} title="Choose one space" description="Reviews are always scoped to one Personal or Business workspace." /></DashboardCard></Page>;
  }

  const isLoading = reviewDrafts.isPending || savedDrafts.isPending;
  const error = reviewDrafts.error ?? savedDrafts.error ?? preview.error ?? draftDetail.error ?? confirm.error;
  const openEvidence = async (evidenceID: string) => {
    if (!active) return;
    try {
      setAccessError(null);
      await openPrivateEvidence(active.id, evidenceID);
    } catch (openError) {
      setAccessError(openError instanceof Error ? openError.message : "Unable to open this private evidence file.");
    }
  };
  const nextPreview = preview.data?.preview;

  return (
    <Page>
      <PageHeader title="Review inbox" description="Review the normalized record and accounting effect before anything posts." />
      {error ? <Alert status="error" title="Unable to load review work" description={error instanceof Error ? error.message : "Try again in a moment."} /> : null}
      {accessError ? <Alert className="mt-4" status="error" title="Unable to open evidence" description={accessError} onDismiss={() => setAccessError(null)} /> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,1.1fr)]">
        <DashboardCard>
          <SectionHeader title="Records needing attention" description="AI suggestions and returned offline drafts stay unposted here." />
          <div className="mt-5"><Segmented aria-label="Review source" size="sm" options={FILTERS} value={filter} onChange={setFilter} /></div>
          {isLoading ? <div className="mt-5 space-y-3">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-2xl bg-default" />)}</div> : null}
          {!isLoading && filtered.length === 0 ? <EmptyState icon={MagicWand} title="Nothing needs review" description="AI-assisted and offline drafts will appear here before they can affect your records." /> : null}
          {filtered.length > 0 ? <ul className="mt-5 space-y-2">{filtered.map((draft) => {
            const source = sourceFor(draft);
            const state = displayState(draft);
            const activeRow = draft.id === selected?.id;
            return <li key={draft.id}><button type="button" className={`w-full rounded-2xl p-4 text-left transition-colors ${activeRow ? "bg-primary-soft" : "bg-default hover:bg-primary-soft/50"}`} onClick={() => setSelectedId(draft.id)}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[14px] font-semibold text-foreground">{titleFor(draft)}</p><p className="mt-1 text-[12px] text-muted">{formatMinorAmount(draft.amount_minor, draft.currency, draft.currency_exponent)} · {draft.effective_date}</p></div><StatusPill tone={state.tone}>{state.label}</StatusPill></div><div className="mt-3 flex flex-wrap gap-2"><StatusPill tone={source.tone}>{source.label}</StatusPill><StatusPill tone="neutral">{draft.purpose.replaceAll("_", " ")}</StatusPill></div></button></li>;
          })}</ul> : null}
        </DashboardCard>

        <DashboardCard>
          {!currentDraft ? <EmptyState icon={Eye} title="Select a draft" description="Choose an item to inspect the server-calculated accounting effect." /> : <ReviewDetail draft={currentDraft} supporting={draftDetail.data} preview={nextPreview} loading={preview.isPending || draftDetail.isPending} confirming={confirm.isPending} onEdit={() => router.push(`/capture/drafts/${encodeURIComponent(currentDraft.id)}`)} onConfirm={() => confirm.mutate()} onOpenEvidence={(evidenceID) => void openEvidence(evidenceID)} />}
        </DashboardCard>
      </div>
    </Page>
  );
}

function ReviewDetail({ draft, supporting, preview, loading, confirming, onEdit, onConfirm, onOpenEvidence }: { draft: MoneyRecordDraft; supporting?: Awaited<ReturnType<typeof moneyApi.getMoneyRecordDraft>>; preview?: Awaited<ReturnType<typeof moneyApi.previewMoneyRecordDraft>>["preview"]; loading: boolean; confirming: boolean; onEdit: () => void; onConfirm: () => void; onOpenEvidence: (evidenceID: string) => void }) {
  const source = sourceFor(draft);
  const accountingEffects = Array.isArray(preview?.accounting_effects) ? preview.accounting_effects : [];
  const warnings = Array.isArray(preview?.warnings) ? preview.warnings : [];
  return <><SectionHeader title="Confirm this record" description="This is a server-calculated preview. Posting remains a separate explicit action." actions={<StatusPill tone={source.tone}>{source.label}</StatusPill>} />
    <div className="mt-6 rounded-2xl bg-default p-4"><p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted">Normalized amount</p><p className="mt-2 tabular text-[26px] font-bold tracking-[-0.03em] text-foreground">{formatMinorAmount(draft.amount_minor, draft.currency, draft.currency_exponent)}</p><p className="mt-2 text-[13px] text-muted">{titleFor(draft)}</p></div>
    {loading ? <div className="mt-5 h-32 animate-pulse rounded-2xl bg-default" /> : null}
    {preview ? <div className="mt-5"><p className="text-[14px] font-medium text-foreground">{preview.balance_effect}</p><ul className="mt-4 space-y-2">{accountingEffects.map((effect) => <li key={effect} className="flex gap-2 text-[13px] text-muted"><CheckCircle size={16} weight="duotone" className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />{effect}</li>)}</ul>{warnings.map((warning) => <Alert key={warning} className="mt-3" status="warning" description={warning} />)}</div> : null}
    {supporting ? <div className="mt-5 rounded-2xl bg-default p-4"><p className="text-[13px] font-medium text-foreground">Supporting detail</p><p className="mt-1 text-[12px] text-muted">{supporting.evidence.length ? `${supporting.evidence.length} private evidence file${supporting.evidence.length === 1 ? "" : "s"} attached` : "No evidence attached"} · {supporting.links.length ? `${supporting.links.length} linked document${supporting.links.length === 1 ? "" : "s"}` : "No linked documents"}</p>{supporting.evidence.length ? <ul className="mt-3 space-y-2">{supporting.evidence.map((asset) => <li key={asset.id} className="flex items-center justify-between gap-3 text-[12px]"><span className="min-w-0 truncate text-muted">{asset.original_file_name} · {asset.status}</span><AppButton size="sm" variant="ghost" label="Open" onPress={() => onOpenEvidence(asset.id)} /></li>)}</ul> : null}</div> : null}
    <div className="mt-7 flex flex-wrap justify-end gap-2"><AppButton variant="ghost" label="Edit details" startContent={<PencilSimple />} onPress={onEdit} /><AppButton label="Confirm and post" startContent={<CheckCircle />} isLoading={confirming} isDisabled={!preview?.can_confirm} onPress={onConfirm} /></div>
  </>;
}
