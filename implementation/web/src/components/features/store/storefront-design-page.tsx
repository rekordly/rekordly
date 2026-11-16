"use client";

import { ArrowLeft, Desktop, DeviceMobile, ImageSquare, UploadSimple } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppSwitch } from "@/components/ui/app-switch";
import { AppTextarea } from "@/components/ui/app-textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Page, PageHeader, Segmented, StatusPill } from "@/components/ui/page";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { SideSheet } from "@/components/ui/side-sheet";
import { useFinanceAction, WorkspaceGate } from "@/components/features/finance/shared";
import { financeApi, formatMinorAmount, moneyKeys } from "@/lib/money";
import { createDefaultSections, FONT_STYLES, PALETTES, STORE_THEMES, resolvePalette, type BrandSettings, type StoreSection, type ThemeKey, type ThemeStoreData } from "@/lib/store-themes";
import { createIdempotencyKey } from "@/lib/utils";
import { uploadProductImage } from "@/lib/products";
import type { PublicStorefrontProduct, StorefrontDesign } from "@/types/finance";

type Draft = { theme_key: ThemeKey; name: string; brand: BrandSettings; sections: StoreSection[] };
type SaveState = "saved" | "pending" | "saving" | "error";
const SECTION_LABEL: Record<StoreSection["type"], string> = {
  announcement: "Announcement bar", hero: "Banner", product_grid: "Products", collections: "Collections", about: "About us", faq: "Questions and answers", contact: "Contact & WhatsApp",
};
const FONT_OPTIONS = [
  { key: "modern", label: "Modern" }, { key: "classic", label: "Classic" }, { key: "friendly", label: "Friendly" },
] as const;

function parsedBrand(value: BrandSettings | undefined, fallbackLogo?: string | null): BrandSettings {
  return {
    logo_url: value?.logo_url ?? fallbackLogo ?? undefined,
    palette: value?.palette ?? "green",
    custom_color: value?.custom_color,
    font_style: value?.font_style ?? "modern",
  };
}

function normalizeProduct(product: PublicStorefrontProduct) {
  return {
    id: product.id,
    product_id: product.product_id,
    title: product.title,
    description: product.description,
    image_urls: product.image_urls ?? [],
    price_minor: product.price_minor,
    currency: product.currency,
    currency_exponent: product.currency_exponent,
    variant_name: product.variant_name,
    availability_state: product.availability_state,
    is_featured: product.is_featured,
    collection_id: product.collection_id,
  };
}

function makePreviewStore(data: StorefrontDesign["contact"] & { name: string; slug: string; products?: PublicStorefrontProduct[]; collections?: { id: number; name: string; image_url?: string | null }[] }): ThemeStoreData {
  return {
    name: data.name,
    slug: data.slug,
    logo_url: undefined,
    phone: data.phone ?? undefined,
    whatsapp_number: data.whatsapp_number ?? undefined,
    address: data.address ?? undefined,
    business_hours: data.business_hours ?? {},
    products: (data.products ?? []).map(normalizeProduct),
    collections: data.collections ?? [],
  };
}

function makeDraft(design: StorefrontDesign): Draft {
  return {
    theme_key: design.draft_theme_key,
    name: design.draft_name || design.name,
    brand: parsedBrand(design.draft_brand, null),
    sections: design.draft_sections ?? [],
  };
}

function sectionsForThemeChoice(theme: ThemeKey, name: string, current: StoreSection[]): StoreSection[] {
  const defaults = createDefaultSections(theme, name);
  const used = new Map<string, number>();
  return defaults.map((section) => {
    const index = used.get(section.type) ?? 0;
    used.set(section.type, index + 1);
    const existing = current.filter((item) => item.type === section.type)[index];
    return existing
      ? { ...section, id: existing.id, enabled: existing.enabled, content: { ...section.content, ...existing.content } }
      : section;
  });
}

function ThemeThumbnail({ theme }: { theme: ThemeKey }) {
  const name = STORE_THEMES[theme].name;
  const background = theme === "boutique" ? "bg-[#fbf3ec]" : theme === "bold" ? "bg-[#12161c]" : theme === "market" ? "bg-[#f5f1e5]" : theme === "studio" ? "bg-white" : "bg-[#f7faf7]";
  return (
    <div className={`h-36 overflow-hidden rounded-xl border border-default ${background}`}>
      <div className={`border-b border-black/10 px-3 py-2 text-center text-[9px] font-bold ${theme === "bold" ? "bg-[#1d242d] text-white" : "bg-white/80"}`}>{theme === "boutique" ? "ADE  •  COLLECTION" : name.toUpperCase()}</div>
      {theme === "boutique" || theme === "studio" ? <div className="p-2"><div className={`h-14 rounded-lg ${theme === "studio" ? "bg-gradient-to-r from-[#c5b4a6] to-[#ede5dd]" : "bg-gradient-to-r from-[#b66b4c] to-[#e5b795]"}`} /><div className="mt-2 grid grid-cols-3 gap-1"><i className="h-8 rounded bg-[#e0c4b2]" /><i className="h-8 rounded bg-[#d7b6a1]" /><i className="h-8 rounded bg-[#c89578]" /></div></div> : theme === "bold" ? <div className="p-2"><div className="h-8 rounded bg-[#303b49]" /><div className="mt-2 grid grid-cols-4 gap-1">{[1, 2, 3, 4].map((n) => <i key={n} className="aspect-square rounded bg-[#252d37] shadow-sm"><span className="block h-3/4 rounded-t bg-[#56677b]" /></i>)}</div></div> : <div className="p-2"><div className="h-5 rounded bg-[#dce9d4]" /><div className="mt-2 grid grid-cols-4 gap-1">{[1, 2, 3, 4].map((n) => <i key={n} className="aspect-square rounded bg-white shadow-sm"><span className="block h-3/4 rounded-t bg-[#d7dfd8]" /></i>)}</div></div>}
    </div>
  );
}

function StorefrontDesignContent({ workspaceId }: { workspaceId: number }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const designQuery = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "storefront-design"], queryFn: () => financeApi.getStorefrontDesign(workspaceId), retry: false });
  const [draftState, setDraft] = useState<Draft | null>(null);
  const [customizing, setCustomizing] = useState(false);
  const [phoneView, setPhoneView] = useState(false);
  const [phonePreviewOpen, setPhonePreviewOpen] = useState(false);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [previewThemeKey, setPreviewThemeKey] = useState<ThemeKey | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const design = designQuery.data;
  const versionRef = useRef(0);
  const draftRef = useRef<Draft | null>(null);
  const savedFingerprintRef = useRef("");
  const activeSaveRef = useRef(false);
  const initialDraft = useMemo(() => design ? makeDraft(design) : null, [design]);
  const draft = draftState ?? initialDraft;
  const saveFingerprint = useMemo(() => draft ? JSON.stringify(draft) : "", [draft]);

  useEffect(() => {
    if (!design || draftState !== null || !initialDraft) return;
    draftRef.current = initialDraft;
    savedFingerprintRef.current = JSON.stringify(initialDraft);
    versionRef.current = design.version;
  }, [design, draftState, initialDraft]);

  const previewQuery = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "storefront-design-preview"],
    queryFn: () => financeApi.getStorefrontDesignPreview(workspaceId),
    enabled: Boolean(design),
    staleTime: 20_000,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: Draft) => financeApi.saveStorefrontDesignDraft(workspaceId, {
      theme_key: payload.theme_key,
      name: payload.name,
      brand: payload.brand,
      sections: payload.sections,
      expected_version: versionRef.current,
      idempotency_key: createIdempotencyKey("store-design-draft"),
    }),
    onSuccess: (saved) => {
      versionRef.current = saved.version;
      savedFingerprintRef.current = JSON.stringify(makeDraft(saved));
      queryClient.setQueryData([...moneyKeys.workspace(workspaceId), "storefront-design"], saved);
      setSaveState("saved");
    },
    onError: () => setSaveState("error"),
    onSettled: () => { activeSaveRef.current = false; },
  });

  useEffect(() => {
    if (!customizing || !draft || !design || saveFingerprint === JSON.stringify(makeDraft(design)) || saveState === "error") return;
    if (activeSaveRef.current) return;
    const timer = setTimeout(() => {
      if (activeSaveRef.current || !draftRef.current) return;
      activeSaveRef.current = true;
      setSaveState("saving");
      saveMutation.mutate(draftRef.current);
    }, 800);
    return () => clearTimeout(timer);
  }, [customizing, design, draft, saveFingerprint, saveState, saveMutation]);

  const updateDraft = useCallback((update: (current: Draft) => Draft) => {
    setDraft((current) => {
      const base = current ?? draftRef.current;
      if (!base) return current;
      const next = update(base);
      draftRef.current = next;
      setSaveState("pending");
      return next;
    });
  }, []);

  const publishAction = useFinanceAction(workspaceId, async () => {
    if (!design) throw new Error("Store template has not loaded yet");
    if (activeSaveRef.current || saveState !== "saved" || saveFingerprint !== savedFingerprintRef.current) throw new Error("Wait for your changes to save first");
    const result = await financeApi.publishStorefrontDesign(workspaceId, { expected_version: versionRef.current, idempotency_key: createIdempotencyKey("store-design-publish") });
    versionRef.current = result.version;
    queryClient.setQueryData([...moneyKeys.workspace(workspaceId), "storefront-design"], result);
    await queryClient.invalidateQueries({ queryKey: [...moneyKeys.workspace(workspaceId), "storefront-design-preview"] });
    return result;
  }, { success: "Your storefront template is live" });

  const discardAction = useFinanceAction(workspaceId, async () => {
    if (!design) throw new Error("Store template has not loaded yet");
    const result = await financeApi.discardStorefrontDesign(workspaceId, { expected_version: versionRef.current, idempotency_key: createIdempotencyKey("store-design-discard") });
    versionRef.current = result.version;
    const reset = makeDraft(result);
    draftRef.current = reset;
    savedFingerprintRef.current = JSON.stringify(reset);
    setDraft(reset);
    setSaveState("saved");
    setConfirmDiscard(false);
    setCustomizing(false);
    queryClient.setQueryData([...moneyKeys.workspace(workspaceId), "storefront-design"], result);
    return result;
  }, { success: "Draft changes discarded" });

  const themeCheckout = useMutation({
    mutationFn: (themeKey: ThemeKey) => financeApi.createStorefrontThemeCheckout(workspaceId, themeKey, createIdempotencyKey("store-theme-checkout")),
    onSuccess: (intent) => {
      if (intent.authorization_url) window.location.assign(intent.authorization_url);
      else router.push(`/billing/checkout?intentId=${intent.id}`);
    },
    onError: (error) => setCheckoutError(error instanceof Error ? error.message : "Theme checkout is unavailable."),
  });

  const publishOrPurchaseTheme = () => {
    if (!design || !draft) return;
    const option = design.available_themes.find((theme) => theme.key === draft.theme_key);
    if (option?.owned) {
      publishAction.mutate(undefined);
      return;
    }
    if (option?.purchasable) {
      setCheckoutError("");
      themeCheckout.mutate(draft.theme_key);
      return;
    }
    setCheckoutError("This theme is ready to preview. Its Billing price has not been configured yet.");
  };

  const currentSection = draft?.sections.find((section) => section.id === selectedSection) ?? null;

  const patchSection = (sectionID: string, content: Record<string, unknown>) => updateDraft((current) => ({
    ...current,
    sections: current.sections.map((section) => section.id === sectionID ? { ...section, content: { ...section.content, ...content } } : section),
  }));

  const uploadImage = async (file?: File) => {
    if (!file) return;
    setImageBusy(true);
    setImageError("");
    try {
      const url = await uploadProductImage(workspaceId, file);
      updateDraft((current) => ({ ...current, brand: { ...current.brand, logo_url: url } }));
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Could not upload this image.");
    } finally {
      setImageBusy(false);
    }
  };

  if (designQuery.isPending) return <Page><PageHeader title="Store templates" description="Loading your storefront template…" /></Page>;
  if (designQuery.isError || !design || !draft) {
    return <Page><PageHeader title="Store templates" description="Choose a template and make your store yours." />
      <div className="rounded-2xl border border-default bg-surface p-6 text-sm text-muted">Create your store first to start choosing a theme.</div>
    </Page>;
  }

  const previewData = previewQuery.data?.storefront;
  const previewStore = previewData ? makePreviewStore({
    name: draft.name,
    slug: design.slug,
    phone: previewData.contact_phone,
    whatsapp_number: previewData.whatsapp_number,
    address: previewData.address,
    business_hours: previewData.business_hours,
    products: previewData.products,
    collections: previewData.collections,
  }) : makePreviewStore({ name: draft.name, slug: design.slug, ...design.contact });
  const Renderer = STORE_THEMES[draft.theme_key].Renderer;
  const visibleSections = draft.sections.filter((section) => Boolean(STORE_THEMES[draft.theme_key].sections[section.type]));
  const dirty = saveFingerprint !== JSON.stringify(makeDraft(design)) || design.has_unpublished_changes;
  const statusLabel = design.status === "published" ? (dirty ? "Unpublished changes" : "Live") : "Draft";
  const selectedTheme = design.available_themes.find((theme) => theme.key === draft.theme_key);
  const selectedThemePrice = selectedTheme?.price_minor && selectedTheme.currency
    ? formatMinorAmount(selectedTheme.price_minor, selectedTheme.currency, 2)
    : "";
  const publishLabel = selectedTheme?.owned
    ? (design.has_unpublished_changes ? "Publish changes" : "Publish")
    : selectedTheme?.purchasable
      ? `Buy ${STORE_THEMES[draft.theme_key].name} & publish${selectedThemePrice ? ` · ${selectedThemePrice}` : ""}`
      : "Billing price not configured";

  const sectionRows = (sections: StoreSection[]) => sections.map((section) => (
    <div key={section.id} className="flex items-center gap-2 rounded-xl border border-default bg-surface p-3">
      <button type="button" onClick={() => setSelectedSection(section.id)} className="min-w-0 flex-1 truncate text-left text-sm font-medium">{SECTION_LABEL[section.type]}</button>
      <div className="flex items-center gap-1">
        <AppSwitch isSelected={section.enabled} onChange={(enabled) => updateDraft((current) => ({ ...current, sections: current.sections.map((row) => row.id === section.id ? { ...row, enabled } : row) }))} aria-label={`Show ${SECTION_LABEL[section.type]}`} />
        <button type="button" aria-label={`Edit ${SECTION_LABEL[section.type]}`} onClick={() => setSelectedSection(section.id)} className="grid size-8 place-items-center rounded-lg text-lg text-muted hover:bg-default">›</button>
      </div>
    </div>
  ));

  const sectionDrawer = currentSection ? (
    <SideSheet isOpen onClose={() => setSelectedSection(null)} title={SECTION_LABEL[currentSection.type]} description="Changes are saved to your draft." footer={<><AppButton variant="ghost" label="Close" onPress={() => setSelectedSection(null)} /><AppButton label="Done" onPress={() => setSelectedSection(null)} /></>}>
      <div className="space-y-4">
        {currentSection.type === "announcement" ? <>
          <AppInput label="Message" value={String(currentSection.content.text ?? "")} onChange={(e) => patchSection(currentSection.id, { text: e.target.value })} maxLength={120} />
          <AppInput label="Link (optional)" value={String(currentSection.content.link ?? "")} onChange={(e) => patchSection(currentSection.id, { link: e.target.value })} placeholder="/collections/new" />
        </> : null}
        {currentSection.type === "hero" ? <>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-default px-4 py-2 text-sm font-medium"><UploadSimple size={16} />Upload banner<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={async (event) => { const file = event.target.files?.[0]; if (file) { setImageBusy(true); try { const image = await uploadProductImage(workspaceId, file); patchSection(currentSection.id, { image }); } catch { setImageError("Could not upload this image."); } finally { setImageBusy(false); } } }} /></label>
          <AppInput label="Heading" value={String(currentSection.content.heading ?? "")} onChange={(e) => patchSection(currentSection.id, { heading: e.target.value })} maxLength={80} />
          <AppTextarea label="Short description" value={String(currentSection.content.subheading ?? "")} onChange={(e) => patchSection(currentSection.id, { subheading: e.target.value })} rows={3} />
          <AppInput label="Button label" value={String(currentSection.content.button_label ?? "")} onChange={(e) => patchSection(currentSection.id, { button_label: e.target.value })} maxLength={28} />
        </> : null}
        {currentSection.type === "product_grid" ? <>
          <AppInput label="Section title" value={String(currentSection.content.title ?? "")} onChange={(e) => patchSection(currentSection.id, { title: e.target.value })} maxLength={48} />
          <label className="block space-y-1 text-sm"><span className="font-medium">Show</span><select value={String(currentSection.content.source ?? "new")} onChange={(e) => patchSection(currentSection.id, { source: e.target.value })} className="h-10 w-full rounded-xl border border-default bg-surface px-3"><option value="new">Newest products</option><option value="best_sellers">Best sellers</option><option value="featured">Featured products</option><option value="collection">One collection</option></select></label>
          {currentSection.content.source === "collection" ? <label className="block space-y-1 text-sm"><span className="font-medium">Collection</span><select value={String(currentSection.content.collection_id ?? "")} onChange={(e) => patchSection(currentSection.id, { collection_id: e.target.value ? Number(e.target.value) : undefined })} className="h-10 w-full rounded-xl border border-default bg-surface px-3"><option value="">Choose a collection</option>{(previewData?.collections ?? []).map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></label> : null}
          <AppInput label="How many products" type="number" value={String(currentSection.content.limit ?? 12)} onChange={(e) => patchSection(currentSection.id, { limit: Number(e.target.value) })} min={1} max={48} />
        </> : null}
        {currentSection.type === "collections" ? <div className="space-y-2"><p className="text-sm font-medium">Show these collections</p>{(previewData?.collections ?? []).map((collection) => {
          const selected = Array.isArray(currentSection.content.collection_ids) && (currentSection.content.collection_ids as number[]).includes(collection.id);
          return <AppSwitch key={collection.id} isSelected={selected} onChange={(on) => { const current = Array.isArray(currentSection.content.collection_ids) ? currentSection.content.collection_ids as number[] : []; patchSection(currentSection.id, { collection_ids: on ? [...current, collection.id] : current.filter((id) => id !== collection.id) }); }} label={collection.name} />;
        })}</div> : null}
        {currentSection.type === "about" ? <>
          <AppInput label="Heading" value={String(currentSection.content.heading ?? "")} onChange={(e) => patchSection(currentSection.id, { heading: e.target.value })} maxLength={80} />
          <RichTextEditor label="About your business" value={String(currentSection.content.body ?? "")} onChange={(body) => patchSection(currentSection.id, { body })} />
          <AppInput label="Image link" value={String(currentSection.content.image ?? "")} onChange={(e) => patchSection(currentSection.id, { image: e.target.value })} />
        </> : null}
        {currentSection.type === "faq" ? <FaqEditor section={currentSection} update={(content) => patchSection(currentSection.id, content)} /> : null}
        {currentSection.type === "contact" ? <p className="text-sm text-muted">This section uses your phone, WhatsApp, address and opening hours from Store settings.</p> : null}
        {imageError ? <p role="alert" className="text-sm text-danger">{imageError}</p> : null}
      </div>
    </SideSheet>
  ) : null;

  const discardButton = <AppButton variant="secondary" label="Delete draft" isDisabled={!design.has_unpublished_changes} isLoading={discardAction.isPending} onPress={() => setConfirmDiscard(true)} />;

  if (!customizing) {
    const publishedTheme = STORE_THEMES[design.published_theme_key];
    const draftTheme = STORE_THEMES[draft.theme_key];
    return <Page>
      <PageHeader title="Store templates" description="Preview a template with your products, then use it as your store’s draft." back={<Link href="/store" className="inline-flex items-center gap-1"><ArrowLeft size={14} />Store overview</Link>} actions={<StatusPill tone={design.status === "published" ? "success" : "neutral"}>{statusLabel}</StatusPill>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-default bg-surface p-5">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted">Published store</p><h2 className="mt-1 text-lg font-semibold">{publishedTheme.name}</h2><p className="mt-1 text-sm text-muted">This is the template shoppers see on your public store.</p></div><StatusPill tone={design.status === "published" ? "success" : "neutral"}>{design.status === "published" ? "Live" : "Not published"}</StatusPill></div>
          <div className="mt-4"><ThemeThumbnail theme={design.published_theme_key} /></div>
        </section>
        <section className="rounded-2xl border border-default bg-surface p-5">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted">Active draft</p><h2 className="mt-1 text-lg font-semibold">{draftTheme.name}</h2><p className="mt-1 text-sm text-muted">Changes stay private until you publish them.</p></div><StatusPill tone={design.has_unpublished_changes ? "warning" : "neutral"}>{design.has_unpublished_changes ? "Unpublished changes" : "No changes"}</StatusPill></div>
          <div className="mt-4"><ThemeThumbnail theme={draft.theme_key} /></div>
          <div className="mt-4 flex flex-wrap gap-2"><AppButton label="Continue editing" onPress={() => setCustomizing(true)} />{discardButton}</div>
        </section>
      </div>
      <div className="mt-2"><h2 className="text-lg font-semibold">Theme library</h2><p className="mt-1 text-sm text-muted">Each template has a fixed layout. Add your store details, then preview before publishing.</p></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(["simple"] as ThemeKey[]).map((key) => {
          const theme = STORE_THEMES[key];
          const active = draft.theme_key === key;
          const option = design.available_themes.find((item) => item.key === key);
          const price = option?.price_minor && option.currency ? formatMinorAmount(option.price_minor, option.currency, 2) : option?.owned ? "Free" : "Preview available · price not set";
          return <article key={key} className="rounded-2xl border border-default bg-surface p-4">
            <ThemeThumbnail theme={key} />
            <div className="mt-4 flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="font-semibold">{theme.name}</h2>{active ? <StatusPill tone="success">Draft</StatusPill> : null}{option?.owned ? <StatusPill tone="neutral">Owned</StatusPill> : null}</div><p className="mt-1 text-sm text-muted">{theme.description}</p><p className="mt-2 text-xs text-muted">Best for {theme.bestFor.join(", ")}</p><p className="mt-2 text-sm font-semibold">{price}</p></div>
              <AppButton size="sm" variant={active ? "secondary" : "primary"} label="Preview template" onPress={() => setPreviewThemeKey(key)} />
            </div>
          </article>;
        })}
      </div>
      {checkoutError ? <p role="alert" className="text-sm text-danger">{checkoutError}</p> : null}
      <ConfirmDialog isOpen={confirmDiscard} onOpenChange={setConfirmDiscard} title="Delete this draft?" description="This discards all unpublished theme and content changes. Your published storefront stays live as it is." confirmLabel="Delete draft" isDanger onConfirm={() => discardAction.mutate(undefined)} isLoading={discardAction.isPending} />
      {previewThemeKey ? <ThemePreviewSheet themeKey={previewThemeKey} name={draft.name} brand={draft.brand} sections={sectionsForThemeChoice(previewThemeKey, draft.name, draft.sections)} store={previewStore} previewDataReady={Boolean(previewData)} loading={previewQuery.isPending} onClose={() => setPreviewThemeKey(null)} onUse={() => { const key = previewThemeKey; updateDraft((current) => ({ ...current, theme_key: key, sections: sectionsForThemeChoice(key, current.name, current.sections) })); setPreviewThemeKey(null); setCustomizing(true); }} /> : null}
    </Page>;
  }

  const previewRenderer = <Renderer
    store={{ ...previewStore, name: draft.name, logo_url: draft.brand.logo_url }}
    brand={{ ...draft.brand, resolved_palette: resolvePalette(draft.brand.palette, draft.brand.custom_color) }}
    sections={draft.sections}
    preview
    onSectionClick={(section) => setSelectedSection(section.id)}
  />;

  return <Page className="max-w-none space-y-0">
    <PageHeader title="Customise your template" description="Your edits save to a draft as you go." back={<button type="button" onClick={() => setCustomizing(false)} className="inline-flex items-center gap-1"><ArrowLeft size={14} />Templates</button>} actions={<div className="flex items-center gap-2"><button type="button" onClick={() => setPhoneView(false)} aria-label="Desktop preview" aria-pressed={!phoneView} className={`grid size-9 place-items-center rounded-lg ${!phoneView ? "bg-default" : ""}`}><Desktop size={17} /></button><button type="button" onClick={() => setPhoneView(true)} aria-label="Phone preview" aria-pressed={phoneView} className={`grid size-9 place-items-center rounded-lg ${phoneView ? "bg-default" : ""}`}><DeviceMobile size={17} /></button></div>} />
    <div className="grid min-h-[calc(100dvh-180px)] grid-cols-1 gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-5 lg:max-h-[calc(100dvh-190px)] lg:overflow-y-auto lg:pr-1">
        <section className="space-y-3 rounded-2xl border border-default bg-surface p-4">
          <h2 className="font-semibold">Brand</h2>
          <div className="flex items-center gap-3"><div className="grid size-12 place-items-center overflow-hidden rounded-xl bg-default">{draft.brand.logo_url ? <Image src={draft.brand.logo_url} alt="Store logo" width={48} height={48} unoptimized className="size-full object-cover" /> : <ImageSquare size={20} className="text-muted" />}</div><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-default px-3 py-2 text-sm"><UploadSimple size={15} />{imageBusy ? "Uploading…" : "Upload logo"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={imageBusy} onChange={(e) => { void uploadImage(e.target.files?.[0]); e.currentTarget.value = ""; }} /></label></div>
          <AppInput label="Store name" value={draft.name} onChange={(e) => updateDraft((current) => ({ ...current, name: e.target.value }))} maxLength={120} />
          <div><p className="mb-2 text-sm font-medium">Colour</p><div className="flex flex-wrap gap-2">{Object.entries(PALETTES).map(([key, palette]) => <button key={key} type="button" aria-label={`${key} colour palette`} aria-pressed={draft.brand.palette === key} onClick={() => updateDraft((current) => ({ ...current, brand: { ...current.brand, palette: key as BrandSettings["palette"], custom_color: undefined } }))} className={`size-9 rounded-full border-2 ${draft.brand.palette === key ? "border-foreground ring-2 ring-offset-2" : "border-white shadow"}`} style={{ background: palette.primary }} />)}<label aria-label="Choose a custom colour" className="relative grid size-9 cursor-pointer place-items-center rounded-full border border-dashed border-default text-muted">+<input type="color" value={draft.brand.custom_color ?? "#166534"} onChange={(e) => updateDraft((current) => ({ ...current, brand: { ...current.brand, palette: "custom", custom_color: e.target.value } }))} className="absolute inset-0 cursor-pointer opacity-0" /></label></div></div>
          <div><p className="mb-2 text-sm font-medium">Style</p><Segmented aria-label="Text style" value={draft.brand.font_style} onChange={(font_style) => updateDraft((current) => ({ ...current, brand: { ...current.brand, font_style } }))} options={FONT_OPTIONS.map((option) => ({ ...option }))} />{draft.brand.font_style === "classic" ? <p className="mt-2 font-serif text-sm">Aa · A calmer, classic feel</p> : <p className="mt-2 text-sm font-medium">Aa · {FONT_STYLES[draft.brand.font_style].label} style</p>}</div>
          {imageError ? <p role="alert" className="text-xs text-danger">{imageError}</p> : null}
        </section>
        <section className="space-y-3 rounded-2xl border border-default bg-surface p-4">
          <div><h2 className="font-semibold">Template content</h2><p className="mt-1 text-xs text-muted">Edit the content in this template’s built-in sections.</p></div>
          {sectionRows(visibleSections)}
        </section>
        <div className="sticky bottom-0 space-y-3 rounded-2xl border border-default bg-surface/95 p-3 backdrop-blur">
          <p className="text-xs text-muted" role="status">{saveState === "saving" ? "Saving changes…" : saveState === "error" ? "Could not save. Edit a field to try again." : saveState === "pending" ? "Saving soon…" : "All changes saved"}</p>
          <div className="flex flex-wrap gap-2"><AppButton variant="secondary" label="Delete draft" isDisabled={!design.has_unpublished_changes} isLoading={discardAction.isPending} onPress={() => setConfirmDiscard(true)} /><AppButton label={publishLabel} isDisabled={!design.has_unpublished_changes || saveState !== "saved" || (!selectedTheme?.owned && !selectedTheme?.purchasable)} isLoading={publishAction.isPending || themeCheckout.isPending} onPress={publishOrPurchaseTheme} /></div>
        </div>
      </div>
      <div className={`hidden min-w-0 rounded-2xl border border-default bg-surface p-3 lg:block ${phoneView ? "mx-auto w-[390px] max-w-full" : ""}`}>
        <div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold">Live preview</p><span className="text-xs text-muted">{phoneView ? "Phone · 390px" : "Desktop"}</span></div>
        <div className="h-[calc(100%-40px)] overflow-auto rounded-xl border border-default bg-white">{previewQuery.isPending ? <p className="p-6 text-sm text-muted">Loading products…</p> : previewData ? previewRenderer : <p className="p-6 text-sm text-muted">Preview is not available yet.</p>}</div>
      </div>
      <div className="lg:hidden"><AppButton variant="secondary" startContent={<DeviceMobile size={16} />} label="Preview" onPress={() => setPhonePreviewOpen(true)} /></div>
    </div>
    <SideSheet isOpen={phonePreviewOpen} onClose={() => setPhonePreviewOpen(false)} title="Store preview" footer={<AppButton label="Back to editing" onPress={() => setPhonePreviewOpen(false)} />}>
      <div className="-mx-3 overflow-hidden rounded-xl border border-default bg-white">{previewData ? previewRenderer : <p className="p-6 text-sm text-muted">Loading preview…</p>}</div>
    </SideSheet>
    {sectionDrawer}
    <ConfirmDialog isOpen={confirmDiscard} onOpenChange={setConfirmDiscard} title="Delete this draft?" description="This discards all unpublished theme and content changes. Your published storefront stays live as it is." confirmLabel="Delete draft" isDanger onConfirm={() => discardAction.mutate(undefined)} isLoading={discardAction.isPending} />
  </Page>;
}

function ThemePreviewSheet({ themeKey, name, brand, sections, store, previewDataReady, loading, onClose, onUse }: { themeKey: ThemeKey; name: string; brand: BrandSettings; sections: StoreSection[]; store: ThemeStoreData; previewDataReady: boolean; loading: boolean; onClose: () => void; onUse: () => void }) {
  const Renderer = STORE_THEMES[themeKey].Renderer;
  return <SideSheet isOpen onClose={onClose} title={`${STORE_THEMES[themeKey].name} preview`} description="Preview this coded template with your store catalogue." footer={<><AppButton variant="ghost" label="Close" onPress={onClose} /><AppButton label="Use this theme" onPress={onUse} /></>}>
    <div className="overflow-hidden rounded-xl border border-default bg-white">{loading ? <p className="p-6 text-sm text-muted">Loading your catalogue…</p> : previewDataReady ? <Renderer store={{ ...store, name, logo_url: brand.logo_url }} brand={{ ...brand, resolved_palette: resolvePalette(brand.palette, brand.custom_color) }} sections={sections} preview /> : <p className="p-6 text-sm text-muted">Store preview data is not available yet.</p>}</div>
  </SideSheet>;
}

function FaqEditor({ section, update }: { section: StoreSection; update: (content: Record<string, unknown>) => void }) {
  const raw = Array.isArray(section.content.items) ? section.content.items as { question?: string; answer?: string }[] : [];
  const edit = (index: number, key: "question" | "answer", value: string) => update({ items: raw.map((item, i) => i === index ? { ...item, [key]: value } : item) });
  return <div className="space-y-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Questions</h3><AppButton size="sm" variant="secondary" label="Add question" isDisabled={raw.length >= 10} onPress={() => update({ items: [...raw, { question: "", answer: "" }] })} /></div>{raw.map((item, index) => <div key={index} className="space-y-3 rounded-xl border border-default p-3"><AppInput label={`Question ${index + 1}`} value={item.question ?? ""} onChange={(event) => edit(index, "question", event.target.value)} maxLength={240} /><AppTextarea label="Answer" value={item.answer ?? ""} onChange={(event) => edit(index, "answer", event.target.value)} rows={3} /><button type="button" onClick={() => update({ items: raw.filter((_, i) => i !== index) })} className="text-xs text-danger">Remove question</button></div>)}</div>;
}

export function StorefrontDesignPage() {
  return <WorkspaceGate businessOnly>{({ workspaceId }) => <StorefrontDesignContent key={workspaceId} workspaceId={workspaceId} />}</WorkspaceGate>;
}
