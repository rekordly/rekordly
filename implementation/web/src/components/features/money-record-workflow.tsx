"use client";

import { toast } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle, FileArrowUp, LinkSimple, Paperclip, PencilSimple, ShieldCheck } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppSelect } from "@/components/ui/app-select";
import { AppTextarea } from "@/components/ui/app-textarea";
import { DashboardCard } from "@/components/ui/dashboard-card";
import { MoneyInput } from "@/components/ui/money-input";
import { DetailList, Segmented, StatusPill } from "@/components/ui/page";
import { openPrivateEvidence, uploadPrivateEvidence, validateEvidenceFile } from "@/lib/evidence";
import { formatMinorAmount, listRecords, moneyApi, moneyKeys } from "@/lib/money";
import { OfflineDraftQueueLimitError, queueOfflineMoneyDraft, type OfflineMoneyDraftPayload } from "@/lib/offline-drafts";
import { moneyRecordDraftSchema, type MoneyRecordDraftValues } from "@/lib/schemas/money.schemas";
import { createIdempotencyKey } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useActiveWorkspace } from "@/stores/workspace-store";
import type { EvidenceAsset, Invoice, MoneyRecordConfirmation, MoneyRecordDraft, MoneyRecordPreview, Purchase, Sale } from "@/types/finance";

const DIRECTION_OPTIONS = [
  { key: "money_out", label: "Money out" },
  { key: "money_in", label: "Money in" },
  { key: "transfer", label: "Transfer" },
] as const;

const LINK_TYPE_OPTIONS = [
  { key: "sale", label: "Sale" },
  { key: "purchase", label: "Purchase" },
  { key: "invoice", label: "Invoice" },
];

type LinkedDocument = Sale | Purchase | Invoice;

function linkedDocumentLabel(document: LinkedDocument): string {
  if ("invoice_number" in document) return `${document.invoice_number} · ${document.customer_name}`;
  return `#${document.id} · ${"customer_name" in document ? document.customer_name : document.supplier_name}`;
}

const PERSONAL_PURPOSES = {
  money_in: ["normal_income", "loan_borrowed", "loan_collected", "investment_income", "asset_disposal", "refund", "not_yet_classified"],
  money_out: ["normal_expense", "loan_repaid", "loan_lent", "investment_contribution", "asset_purchase", "refund", "owner_transfer", "not_yet_classified"],
  transfer: ["transfer"],
} as const;

const BUSINESS_PURPOSES = {
  money_in: ["immediate_sale", "customer_advance", "loan_proceeds", "owner_capital", "tax_refund", "other_income", "not_yet_known"],
  money_out: ["immediate_purchase", "supplier_advance", "loan_repayment", "owner_drawing", "tax_payment", "customer_refund", "supplier_refund", "other_expense", "not_yet_known"],
  transfer: ["transfer"],
} as const;

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Converts API minor units to an editable decimal string without JavaScript money arithmetic. */
function editableMajorAmount(amountMinor: string, exponent: number): string {
  const raw = amountMinor.trim();
  if (!/^\d+$/.test(raw)) return "";
  if (exponent === 0) return raw;
  const padded = raw.padStart(exponent + 1, "0");
  return `${padded.slice(0, -exponent)}.${padded.slice(-exponent)}`;
}

function purposeFor(workspaceKind: "personal" | "business", direction: "money_in" | "money_out" | "transfer") {
  if (direction === "transfer") return "transfer";
  if (workspaceKind === "personal") return direction === "money_in" ? "normal_income" : "normal_expense";
  return direction === "money_in" ? "other_income" : "other_expense";
}

function labelPurpose(purpose: string): string {
  return purpose.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function requiresCounterpartyFor(purpose: string): boolean {
  return ["customer_advance", "supplier_advance", "customer_refund", "supplier_refund", "loan_proceeds", "loan_repayment", "owner_capital", "owner_drawing"].includes(purpose);
}

function requiresCategoryFor(purpose: string): boolean {
  return !["transfer", "not_yet_known", "not_yet_classified", "customer_advance", "supplier_advance", "loan_proceeds", "loan_repayment", "owner_capital", "owner_drawing", "tax_payment", "tax_refund"].includes(purpose);
}

/** Blueprint 03's deliberate draft → preview → confirmation flow. */
export function MoneyRecordWorkflow({ initialDraftId }: { initialDraftId?: string | null }) {
  const { active } = useActiveWorkspace();
  if (!active) {
    return <Alert status="info" title="Choose a space first" description="Select Personal or Business before creating a money record." />;
  }
  const workspaceKind = active.kind === "business" ? "business" : "personal";
  return <MoneyRecordWorkflowForm key={`${active.id}:${initialDraftId ?? "new"}`} workspaceId={active.id} workspaceKind={workspaceKind} initialDraftId={initialDraftId} />;
}

function MoneyRecordWorkflowForm({ workspaceId, workspaceKind, initialDraftId }: { workspaceId: number; workspaceKind: "personal" | "business"; initialDraftId?: string | null }) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirmKey = useRef(createIdempotencyKey());
  const [draft, setDraft] = useState<MoneyRecordDraft | null>(null);
  const [preview, setPreview] = useState<MoneyRecordPreview | null>(null);
  const [evidence, setEvidence] = useState<EvidenceAsset[]>([]);
  const [offlineEvidence, setOfflineEvidence] = useState<File[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [linkType, setLinkType] = useState("sale");
  const [linkedRecordId, setLinkedRecordId] = useState("");
  const [dismissedInitialDraft, setDismissedInitialDraft] = useState(false);
  const initialDraft = useQuery({
    queryKey: initialDraftId ? [...moneyKeys.workspace(workspaceId), "draft", initialDraftId] : ["money", workspaceId, "draft", "none"],
    queryFn: () => moneyApi.getMoneyRecordDraft(workspaceId, initialDraftId!),
    enabled: Boolean(initialDraftId),
  });
  const loadedDraft = dismissedInitialDraft ? null : initialDraft.data?.draft ?? null;
  const activeDraft = draft ?? loadedDraft;
  const form = useForm<MoneyRecordDraftValues>({
    resolver: zodResolver(moneyRecordDraftSchema),
    defaultValues: {
      entry_method: "manual",
      direction: "money_out",
      amount: "",
      effective_date: today(),
      money_account_id: "",
      destination_account_id: "",
      category_id: "",
      purpose: purposeFor(workspaceKind, "money_out"),
      counterparty_name: "",
      notes: "",
      reference: "",
    },
  });
  useEffect(() => {
    if (!loadedDraft || draft) return;
    form.reset({
      entry_method: loadedDraft.entry_method === "ai_assisted" ? "ai_assisted" : "manual",
      direction: loadedDraft.direction,
      amount: editableMajorAmount(loadedDraft.amount_minor, loadedDraft.currency_exponent),
      effective_date: loadedDraft.effective_date,
      money_account_id: loadedDraft.money_account_id ?? "",
      destination_account_id: loadedDraft.destination_account_id ?? "",
      category_id: loadedDraft.category_id ?? "",
      purpose: loadedDraft.purpose,
      counterparty_name: loadedDraft.counterparty_name ?? "",
      notes: loadedDraft.description ?? "",
      reference: loadedDraft.reference ?? "",
    });
  }, [draft, form, loadedDraft]);
  const loadedEvidence = loadedDraft ? (initialDraft.data?.evidence ?? []) : [];
  const loadedLinks = loadedDraft ? (initialDraft.data?.links ?? []).map((link) => `${link.link_type} #${link.linked_record_id}`) : [];
  const visibleEvidence = activeDraft?.id === loadedDraft?.id ? [...loadedEvidence, ...evidence] : evidence;
  const visibleLinks = activeDraft?.id === loadedDraft?.id ? [...loadedLinks, ...links] : links;
  const direction = useWatch({ control: form.control, name: "direction" });
  const purpose = useWatch({ control: form.control, name: "purpose" });
  const accountId = useWatch({ control: form.control, name: "money_account_id" });
  const accounts = useQuery({ queryKey: moneyKeys.accounts(workspaceId), queryFn: () => moneyApi.listAccounts({ workspaceId }) });
  const categories = useQuery({
    queryKey: moneyKeys.categories(workspaceId, direction),
    queryFn: () => moneyApi.listCategories({ workspaceId, direction }),
    enabled: direction !== "transfer",
  });
  const linkedDocuments = useQuery<LinkedDocument[]>({
    queryKey: [...moneyKeys.workspace(workspaceId), "linkable-documents", linkType],
    queryFn: async () => {
      if (linkType === "sale") return listRecords<Sale>(workspaceId, "sales");
      if (linkType === "purchase") return listRecords<Purchase>(workspaceId, "purchases");
      return listRecords<Invoice>(workspaceId, "invoices");
    },
    enabled: Boolean(activeDraft),
  });
  const selectedAccount = accounts.data?.find((account) => String(account.id) === accountId);
  const currency = selectedAccount?.currency ?? "NGN";
  const exponent = selectedAccount?.currency_exponent ?? 2;
  const accountOptions = (accounts.data ?? []).map((account) => ({ key: String(account.id), label: `${account.name} · ${account.currency}` }));
  const allowedPurposes = (workspaceKind === "business" ? BUSINESS_PURPOSES : PERSONAL_PURPOSES)[direction];
  const purposeOptions = allowedPurposes.map((item) => ({ key: item, label: labelPurpose(item) }));
  const linkedDocumentOptions = (linkedDocuments.data ?? []).map((document) => ({ key: String(document.id), label: linkedDocumentLabel(document) }));
  const categoryRequired = direction !== "transfer" && requiresCategoryFor(purpose);
  const counterpartyRequired = requiresCounterpartyFor(purpose);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const draftRequest = (
    values: MoneyRecordDraftValues,
    entryMethod: MoneyRecordDraftValues["entry_method"] | "offline",
    clientCommandId?: string,
  ) => ({
    entry_method: entryMethod,
    direction: values.direction,
    scope_type: values.direction === "transfer" ? "transfer" : workspaceKind,
    purpose: values.purpose,
    amount: values.amount,
    currency,
    effective_date: values.effective_date,
    money_account_id: Number(values.money_account_id),
    destination_account_id: values.direction === "transfer" ? Number(values.destination_account_id) : undefined,
    category_id: values.direction === "transfer" || !values.category_id ? undefined : Number(values.category_id),
    counterparty_name: values.counterparty_name || undefined,
    description: values.notes || undefined,
    reference: values.reference || undefined,
    payload: clientCommandId ? { source: "capture" as const, offline: true as const } : { source: "capture" },
    ...(clientCommandId ? { client_command_id: clientCommandId } : {}),
  });

  const saveAndPreview = useMutation({
    mutationFn: async (values: MoneyRecordDraftValues) => {
      const body = draftRequest(values, activeDraft?.entry_method === "offline" ? "offline" : activeDraft?.entry_method === "ai_assisted" ? "ai_assisted" : "manual");
      const saved = activeDraft
        ? await moneyApi.updateMoneyRecordDraft(workspaceId, activeDraft.id, { ...body, expected_version: activeDraft.version })
        : await moneyApi.createMoneyRecordDraft(workspaceId, body);
      const nextDraft = saved.draft;
      const previewed = await moneyApi.previewMoneyRecordDraft(workspaceId, nextDraft.id);
      return { draft: nextDraft, preview: previewed.preview };
    },
    onSuccess: ({ draft: nextDraft, preview: nextPreview }) => {
      setDraft(nextDraft);
      setPreview(nextPreview);
      setError(null);
      toast.success(nextDraft.state === "needs_review" ? "Review draft saved" : "Draft saved for review");
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const saveOfflineDraft = async (values: MoneyRecordDraftValues) => {
    if (!user) {
      setError("Your session is still loading. Please wait a moment before saving this offline draft.");
      return;
    }
    const clientCommandId = createIdempotencyKey("offline-draft");
    try {
      await queueOfflineMoneyDraft({
        userId: user.id,
        workspaceId,
        clientCommandId,
        idempotencyKey: createIdempotencyKey("offline-sync"),
        payload: draftRequest(values, "offline", clientCommandId) as OfflineMoneyDraftPayload,
        evidenceFiles: offlineEvidence.map((file) => ({ file, fileName: file.name, mimeType: file.type, sizeBytes: file.size })),
      });
      setDraft(null);
      setPreview(null);
      setEvidence([]);
      setOfflineEvidence([]);
      setLinks([]);
      setError(null);
      setOfflineNotice("Saved on this device. It is not posted and will need an online server preview before you can confirm it.");
      form.reset();
      toast.success("Offline draft saved on this device");
    } catch (queueError) {
      setError(
        queueError instanceof OfflineDraftQueueLimitError
          ? queueError.message
          : "This device could not save the offline draft. Check available storage and try again.",
      );
    }
  };

  const confirm = useMutation({
    mutationFn: () => moneyApi.confirmMoneyRecord(workspaceId, activeDraft!.id, activeDraft!.version, confirmKey.current),
    onSuccess: (result: MoneyRecordConfirmation) => {
      setDraft(result.draft);
      setEvidence(result.evidence);
      setError(null);
      confirmKey.current = createIdempotencyKey();
      toast.success(result.was_duplicate ? "Record was already confirmed" : "Money record confirmed");
      void queryClient.invalidateQueries({ queryKey: moneyKeys.workspace(workspaceId) });
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const addLink = useMutation({
    mutationFn: async () => {
      if (!activeDraft || !/^\d+$/.test(linkedRecordId)) throw new Error("Enter the numeric ID of the record to link.");
      return moneyApi.createMoneyRecordDraftLink(workspaceId, activeDraft.id, { link_type: linkType, linked_record_id: Number(linkedRecordId) });
    },
    onSuccess: () => {
      setLinks((current) => [...current, `${linkType} #${linkedRecordId}`]);
      setLinkedRecordId("");
      toast.success("Link added to draft");
    },
  });

  const uploadEvidence = async (file: File) => {
    if (!activeDraft) return;
    try {
      setError(null);
      const registered = await uploadPrivateEvidence({
        workspaceId,
        draftId: activeDraft.id,
        evidence: { file, fileName: file.name, mimeType: file.type, sizeBytes: file.size },
      });
      setEvidence((current) => [...current, registered]);
      toast.success("Private evidence attached");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to attach evidence right now.");
    }
  };

  const openEvidence = async (evidenceID: string) => {
    try {
      setError(null);
      await openPrivateEvidence(workspaceId, evidenceID);
    } catch (accessError) {
      setError(accessError instanceof Error ? accessError.message : "Unable to open this private evidence file.");
    }
  };

  const selectEvidence = (files: FileList | null) => {
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    if (activeDraft) {
      void Promise.all(selected.map(uploadEvidence));
      return;
    }
    if (isOnline) return;
    const invalid = selected.map((file) => validateEvidenceFile({ file, fileName: file.name, mimeType: file.type, sizeBytes: file.size })).find(Boolean);
    if (invalid) {
      setError(invalid);
      return;
    }
    setOfflineEvidence((current) => [...current, ...selected]);
  };

  const reset = () => {
    setDraft(null);
    setPreview(null);
    setEvidence([]);
    setOfflineEvidence([]);
    setLinks([]);
    setError(null);
    setOfflineNotice(null);
    setDismissedInitialDraft(true);
    confirmKey.current = createIdempotencyKey();
    form.reset();
  };
  const isConfirmed = activeDraft?.state === "confirmed";

  return (
    <div className="grid max-w-4xl gap-6">
      <DashboardCard>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary"><ShieldCheck size={21} weight="duotone" aria-hidden="true" /></span>
          <div><h2 className="text-[16px] font-bold text-foreground">Review before posting</h2><p className="mt-0.5 text-[13px] text-muted">Save a draft, inspect its accounting effect, then confirm it once.</p></div>
        </div>
        {error ? <Alert className="mt-5" status="error" description={error} onDismiss={() => setError(null)} /> : null}
        {initialDraft.error ? <Alert className="mt-5" status="error" title="Unable to load this draft" description="Return to the Review inbox and try again." /> : null}
        {offlineNotice ? <Alert className="mt-5" status="warning" title="Offline draft saved" description={offlineNotice} onDismiss={() => setOfflineNotice(null)} /> : null}
        <form noValidate className="mt-6 grid gap-5" onSubmit={(event) => void form.handleSubmit((values) => { if (!isOnline) return saveOfflineDraft(values); saveAndPreview.mutate(values); })(event)}>
          <Controller control={form.control} name="direction" render={({ field }) => <div><p className="mb-2 text-[13px] font-medium text-foreground">What happened?</p><Segmented aria-label="Money direction" options={DIRECTION_OPTIONS} value={field.value} onChange={(value) => { field.onChange(value); form.setValue("purpose", purposeFor(workspaceKind, value), { shouldValidate: true }); form.setValue("category_id", ""); }} /></div>} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller control={form.control} name="amount" render={({ field, fieldState }) => <MoneyInput label="Amount" isRequired placeholder="0.00" currency={currency} exponent={exponent} value={field.value} onValueChange={field.onChange} onBlur={field.onBlur} errorMessage={fieldState.error?.message} />} />
            <Controller control={form.control} name="effective_date" render={({ field, fieldState }) => <AppInput label="Date" type="date" isRequired max={today()} value={field.value} onChange={(event) => field.onChange(event.target.value)} onBlur={field.onBlur} errorMessage={fieldState.error?.message} />} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller control={form.control} name="money_account_id" render={({ field, fieldState }) => <AppSelect label={direction === "money_in" ? "Money arrived in" : direction === "transfer" ? "From account" : "Paid from"} isRequired placeholder={accounts.isPending ? "Loading accounts…" : "Choose account"} options={accountOptions} selectedKey={field.value || undefined} onSelectionChange={field.onChange} error={fieldState.error?.message} />} />
            {direction === "transfer" ? <Controller control={form.control} name="destination_account_id" render={({ field, fieldState }) => <AppSelect label="To account" isRequired placeholder="Choose destination" options={accountOptions.filter((item) => item.key !== accountId)} selectedKey={field.value || undefined} onSelectionChange={field.onChange} error={fieldState.error?.message} />} /> : <Controller control={form.control} name="purpose" render={({ field, fieldState }) => <AppSelect label="What is this for?" isRequired placeholder="Choose what this money represents" options={purposeOptions} selectedKey={field.value || undefined} onSelectionChange={(value) => { field.onChange(value); form.setValue("category_id", ""); }} error={fieldState.error?.message} />} />}
          </div>
          {direction !== "transfer" ? <>
            <div className="grid gap-4 sm:grid-cols-2">
              {categoryRequired ? <Controller control={form.control} name="category_id" render={({ field, fieldState }) => <AppSelect label="Category" isRequired placeholder="Choose category" options={(categories.data ?? []).map((category) => ({ key: String(category.id), label: category.name }))} selectedKey={field.value || undefined} onSelectionChange={field.onChange} error={fieldState.error?.message} />} /> : <div className="hidden sm:block" />}
              <Controller control={form.control} name="counterparty_name" render={({ field, fieldState }) => <AppInput label="Customer, supplier or other party" isRequired={counterpartyRequired} placeholder={counterpartyRequired ? "Required for this purpose" : "Optional external party"} value={field.value} onChange={(event) => field.onChange(event.target.value)} onBlur={field.onBlur} errorMessage={fieldState.error?.message} />} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller control={form.control} name="reference" render={({ field }) => <AppInput label="Reference" placeholder="Optional receipt or bank reference" value={field.value} onChange={(event) => field.onChange(event.target.value)} onBlur={field.onBlur} />} />
              <div className="hidden sm:block" />
            </div>
          </> : <Controller control={form.control} name="reference" render={({ field }) => <AppInput label="Reference" placeholder="Optional receipt or bank reference" value={field.value} onChange={(event) => field.onChange(event.target.value)} onBlur={field.onBlur} />} />}
          <Controller control={form.control} name="notes" render={({ field }) => <AppTextarea label="Description" placeholder="What happened?" value={field.value} onChange={(event) => field.onChange(event.target.value)} onBlur={field.onBlur} />} />
          {!activeDraft && !isOnline ? <OfflineEvidenceStage files={offlineEvidence} onSelectEvidence={() => fileInputRef.current?.click()} onRemoveEvidence={(name) => setOfflineEvidence((current) => current.filter((file) => file.name !== name))} /> : null}
          {!isConfirmed ? <div className="flex justify-end"><AppButton type="submit" size="lg" label={!isOnline ? "Save offline draft" : activeDraft ? "Save changes and refresh preview" : "Save draft and preview"} isLoading={saveAndPreview.isPending} endContent={<PencilSimple />} /></div> : null}
        </form>
      </DashboardCard>

      {activeDraft && !isConfirmed ? <DraftSupportingData evidence={visibleEvidence} links={visibleLinks} linkType={linkType} linkedRecordId={linkedRecordId} linkedDocumentOptions={linkedDocumentOptions} isLoadingDocuments={linkedDocuments.isPending} onLinkTypeChange={(value) => { setLinkType(value); setLinkedRecordId(""); }} onLinkedRecordIdChange={setLinkedRecordId} onAddLink={() => addLink.mutate()} isLinking={addLink.isPending} onSelectEvidence={() => fileInputRef.current?.click()} onOpenEvidence={(evidenceID) => void openEvidence(evidenceID)} /> : null}
      {preview && !isConfirmed ? <PreviewCard preview={preview} onEdit={() => setPreview(null)} onConfirm={() => confirm.mutate()} isConfirming={confirm.isPending} /> : null}
      {isConfirmed && activeDraft ? <ConfirmedCard draft={activeDraft} evidence={visibleEvidence} onReset={reset} /> : null}
      <input ref={fileInputRef} type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { selectEvidence(event.target.files); event.target.value = ""; }} />
    </div>
  );
}

function OfflineEvidenceStage({ files, onSelectEvidence, onRemoveEvidence }: { files: File[]; onSelectEvidence: () => void; onRemoveEvidence: (name: string) => void }) {
  return <div className="rounded-2xl bg-default p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[13px] font-medium text-foreground">Receipt or evidence</p><p className="mt-0.5 text-[12px] text-muted">It stays only in this browser’s local storage until the draft can be synced. PDF, JPEG, PNG or WebP · 10 MB each.</p></div><AppButton variant="outline" label="Attach evidence" startContent={<FileArrowUp />} onPress={onSelectEvidence} /></div>{files.length ? <ul className="mt-3 space-y-2">{files.map((file) => <li key={`${file.name}-${file.lastModified}`} className="flex items-center justify-between gap-3 rounded-xl bg-content1 px-3 py-2 text-[12px]"><span className="min-w-0 truncate text-foreground">{file.name}</span><AppButton size="sm" variant="ghost" label="Remove" onPress={() => onRemoveEvidence(file.name)} /></li>)}</ul> : null}</div>;
}

function DraftSupportingData({ evidence, links, linkType, linkedRecordId, linkedDocumentOptions, isLoadingDocuments, onLinkTypeChange, onLinkedRecordIdChange, onAddLink, isLinking, onSelectEvidence, onOpenEvidence }: { evidence: EvidenceAsset[]; links: string[]; linkType: string; linkedRecordId: string; linkedDocumentOptions: { key: string; label: string }[]; isLoadingDocuments: boolean; onLinkTypeChange: (value: string) => void; onLinkedRecordIdChange: (value: string) => void; onAddLink: () => void; isLinking: boolean; onSelectEvidence: () => void; onOpenEvidence: (evidenceID: string) => void }) {
  return <DashboardCard><div className="flex items-center gap-2"><Paperclip size={18} weight="duotone" className="text-primary" aria-hidden="true" /><h2 className="text-[16px] font-bold text-foreground">Supporting detail</h2></div><p className="mt-1 text-[13px] text-muted">Link an existing sale, purchase or invoice. Evidence remains private and copies to the confirmed record.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><AppSelect label="Link type" options={LINK_TYPE_OPTIONS} selectedKey={linkType} onSelectionChange={onLinkTypeChange} /><AppSelect label="Document" placeholder={isLoadingDocuments ? "Loading documents…" : "Choose document"} options={linkedDocumentOptions} selectedKey={linkedRecordId || undefined} onSelectionChange={onLinkedRecordIdChange} /></div><div className="mt-3 flex flex-wrap gap-2"><AppButton variant="outline" label="Add link" startContent={<LinkSimple />} isLoading={isLinking} isDisabled={!linkedRecordId} onPress={onAddLink} /><AppButton variant="outline" label="Attach evidence" startContent={<FileArrowUp />} onPress={onSelectEvidence} /></div>{links.length > 0 ? <p className="mt-4 text-[12px] text-muted">Links: {links.join(", ")}</p> : null}{evidence.length > 0 ? <ul className="mt-4 space-y-2">{evidence.map((asset) => <li key={asset.id} className="flex items-center justify-between gap-3 rounded-xl bg-default px-3 py-2 text-[12px]"><span className="min-w-0 truncate text-foreground">{asset.original_file_name}</span><div className="flex shrink-0 items-center gap-2"><StatusPill tone="success">Verified</StatusPill><AppButton size="sm" variant="ghost" label="Open" onPress={() => onOpenEvidence(asset.id)} /></div></li>)}</ul> : null}</DashboardCard>;
}

function PreviewCard({ preview, onEdit, onConfirm, isConfirming }: { preview: MoneyRecordPreview; onEdit: () => void; onConfirm: () => void; isConfirming: boolean }) {
  const accountingEffects = Array.isArray(preview.accounting_effects) ? preview.accounting_effects : [];
  const warnings = Array.isArray(preview.warnings) ? preview.warnings : [];
  return <DashboardCard><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-[16px] font-bold text-foreground">Accounting preview</h2><p className="mt-1 text-[13px] text-muted">Nothing has been posted yet.</p></div><StatusPill tone={preview.can_confirm ? "success" : "warning"}>{preview.can_confirm ? "Ready to confirm" : "Needs changes"}</StatusPill></div><p className="mt-5 text-[14px] font-medium text-foreground">{preview.balance_effect}</p><ul className="mt-4 space-y-2 text-[13px] text-muted">{accountingEffects.map((effect) => <li key={effect} className="flex gap-2"><CheckCircle size={16} weight="duotone" className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />{effect}</li>)}</ul>{warnings.length > 0 ? <div className="mt-5 space-y-2">{warnings.map((warning) => <Alert key={warning} status="warning" description={warning} />)}</div> : null}<div className="mt-6 flex flex-wrap justify-end gap-2"><AppButton variant="ghost" label="Edit details" onPress={onEdit} /><AppButton label="Confirm and post" isDisabled={!preview.can_confirm} isLoading={isConfirming} startContent={<CheckCircle />} onPress={onConfirm} /></div></DashboardCard>;
}

function ConfirmedCard({ draft, evidence, onReset }: { draft: MoneyRecordDraft; evidence: EvidenceAsset[]; onReset: () => void }) {
  return <DashboardCard><div className="flex items-center gap-2"><CheckCircle size={21} weight="fill" className="text-success" aria-hidden="true" /><h2 className="text-[16px] font-bold text-foreground">Record confirmed</h2></div><DetailList className="mt-5" items={[{ label: "Amount", value: formatMinorAmount(draft.amount_minor, draft.currency, draft.currency_exponent) }, { label: "Date", value: draft.effective_date }, { label: "Evidence", value: evidence.length ? `${evidence.length} verified file${evidence.length === 1 ? "" : "s"}` : "None" }, { label: "Record", value: draft.confirmed_record_id ? `#${draft.confirmed_record_id}` : "Posted" }]} /><div className="mt-6 flex justify-end"><AppButton label="Record another" onPress={onReset} /></div></DashboardCard>;
}
