"use client";

import { ArrowDown, ArrowLeft, ArrowUp, Desktop, DeviceMobile, ImageSquare, Plus, UploadSimple } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppSwitch } from "@/components/ui/app-switch";
import { AppTextarea } from "@/components/ui/app-textarea";
import { Page, PageHeader, Segmented, StatusPill } from "@/components/ui/page";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { SideSheet } from "@/components/ui/side-sheet";
import { useFinanceAction, WorkspaceGate } from "@/components/features/finance/shared";
import { financeApi, moneyKeys } from "@/lib/money";
import { FONT_STYLES, PALETTES, STORE_THEMES, resolvePalette, type BrandSettings, type StoreSection, type ThemeKey, type ThemeStoreData } from "@/lib/store-themes";
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

function ThemeThumbnail({ theme }: { theme: ThemeKey }) {
  return (
    <div className={`h-36 overflow-hidden rounded-xl border border-default ${theme === "boutique" ? "bg-[#fbf3ec]" : "bg-[#f7faf7]"}`}>
      <div className={`border-b border-black/10 px-3 py-2 text-center text-[9px] font-bold ${theme === "boutique" ? "bg-white" : "bg-white/80"}`}>{theme === "boutique" ? "ADE  •  COLLECTION" : "Ade Stores"}</div>
      {theme === "boutique" ? (
        <div className="p-2"><div className="h-14 rounded-lg bg-gradient-to-r from-[#b66b4c] to-[#e5b795]" /><div className="mt-2 grid grid-cols-3 gap-1"><i className="h-8 rounded bg-[#e0c4b2]" /><i className="h-8 rounded bg-[#d7b6a1]" /><i className="h-8 rounded bg-[#c89578]" /></div></div>
      ) : (
        <div className="p-2"><div className="h-8 rounded bg-[#d8e8db]" /><div className="mt-2 grid grid-cols-4 gap-1">{[1, 2, 3, 4].map((n) => <i key={n} className="aspect-square rounded bg-white shadow-sm"><span className="block h-3/4 rounded-t bg-[#d7dfd8]" /></i>)}</div></div>
      )}
    </div>
  );
}

function StorefrontDesignContent({ workspaceId }: { workspaceId: number }) {
  const queryClient = useQueryClient();
  const designQuery = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "storefront-design"], queryFn: () => financeApi.getStorefrontDesign(workspaceId), retry: false });
  const [draftState, setDraft] = useState<Draft | null>(null);
  const [customizing, setCustomizing] = useState(false);
  const [phoneView, setPhoneView] = useState(false);
  const [phonePreviewOpen, setPhonePreviewOpen] = useState(false);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState("");
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
    enabled: customizing,
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
    if (!design) throw new Error("Store design has not loaded yet");
    if (activeSaveRef.current || saveState !== "saved" || saveFingerprint !== savedFingerprintRef.current) throw new Error("Wait for your changes to save first");
    const result = await financeApi.publishStorefrontDesign(workspaceId, { expected_version: versionRef.current, idempotency_key: createIdempotencyKey("store-design-publish") });
    versionRef.current = result.version;
    queryClient.setQueryData([...moneyKeys.workspace(workspaceId), "storefront-design"], result);
    await queryClient.invalidateQueries({ queryKey: [...moneyKeys.workspace(workspaceId), "storefront-design-preview"] });
    return result;
  }, { success: "Your store design is live" });

  const discardAction = useFinanceAction(workspaceId, async () => {
    if (!design) throw new Error("Store design has not loaded yet");
    const result = await financeApi.discardStorefrontDesign(workspaceId, { expected_version: versionRef.current, idempotency_key: createIdempotencyKey("store-design-discard") });
    versionRef.current = result.version;
    const reset = makeDraft(result);
    draftRef.current = reset;
    savedFingerprintRef.current = JSON.stringify(reset);
    setDraft(reset);
    setSaveState("saved");
    queryClient.setQueryData([...moneyKeys.workspace(workspaceId), "storefront-design"], result);
    return result;
  }, { success: "Draft changes discarded" });

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

  if (designQuery.isPending) return <Page><PageHeader title="Store design" description="Loading your store design…" /></Page>;
  if (designQuery.isError || !design || !draft) {
    return <Page><PageHeader title="Store design" description="Choose a theme and make your store yours." />
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

  const sectionRows = (sections: StoreSection[]) => sections.map((section, index) => (
    <div key={section.id} className="flex items-center gap-2 rounded-xl border border-default bg-surface p-3">
      <span aria-hidden="true" className="px-1 text-muted">⠿</span>
      <button type="button" onClick={() => setSelectedSection(section.id)} className="min-w-0 flex-1 truncate text-left text-sm font-medium">{SECTION_LABEL[section.type]}</button>
      <div className="flex items-center gap-1">
        <button type="button" aria-label={`Move ${SECTION_LABEL[section.type]} up`} disabled={index === 0} onClick={() => updateDraft((current) => { const list = [...current.sections]; const at = list.findIndex((row) => row.id === section.id); if (at > 0) [list[at - 1], list[at]] = [list[at], list[at - 1]]; return { ...current, sections: list }; })} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-default disabled:opacity-30"><ArrowUp size={15} /></button>
        <button type="button" aria-label={`Move ${SECTION_LABEL[section.type]} down`} disabled={index === sections.length - 1} onClick={() => updateDraft((current) => { const list = [...current.sections]; const at = list.findIndex((row) => row.id === section.id); if (at < list.length - 1) [list[at + 1], list[at]] = [list[at], list[at + 1]]; return { ...current, sections: list }; })} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-default disabled:opacity-30"><ArrowDown size={15} /></button>
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

  if (!customizing) {
    return <Page>
      <PageHeader title="Store design" description="Choose a look for your online store." back={<Link href="/store" className="inline-flex items-center gap-1"><ArrowLeft size={14} />Store overview</Link>} actions={<div className="flex items-center gap-2"><StatusPill tone={design.status === "published" ? "success" : "neutral"}>{statusLabel}</StatusPill><AppButton label="Customise" onPress={() => setCustomizing(true)} /></div>} />
      <div className="grid gap-4 md:grid-cols-2">
        {(Object.keys(STORE_THEMES) as ThemeKey[]).map((key) => {
          const theme = STORE_THEMES[key];
          const active = draft.theme_key === key;
          return <article key={key} className="rounded-2xl border border-default bg-surface p-4">
            <ThemeThumbnail theme={key} />
            <div className="mt-4 flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="font-semibold">{theme.name}</h2>{active ? <StatusPill tone="success">Current</StatusPill> : null}</div><p className="mt-1 text-sm text-muted">{theme.description}</p><p className="mt-2 text-xs text-muted">Best for {theme.bestFor.join(", ")}</p></div>
              <AppButton size="sm" variant={active ? "secondary" : "primary"} label={active ? "Selected" : "Use this theme"} isDisabled={active} onPress={() => updateDraft((current) => ({ ...current, theme_key: key }))} />
            </div>
          </article>;
        })}
      </div>
      <div className="flex flex-wrap gap-2"><AppButton label="Publish" isDisabled={!dirty || saveState !== "saved" || !design.has_unpublished_changes} isLoading={publishAction.isPending} onPress={() => publishAction.mutate(undefined)} /><AppButton variant="secondary" label="Discard changes" isDisabled={!design.has_unpublished_changes} isLoading={discardAction.isPending} onPress={() => discardAction.mutate(undefined)} /></div>
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
    <PageHeader title="Customise your store" description="Your edits save to a draft as you go." back={<button type="button" onClick={() => setCustomizing(false)} className="inline-flex items-center gap-1"><ArrowLeft size={14} />Design</button>} actions={<div className="flex items-center gap-2"><button type="button" onClick={() => setPhoneView(false)} aria-label="Desktop preview" aria-pressed={!phoneView} className={`grid size-9 place-items-center rounded-lg ${!phoneView ? "bg-default" : ""}`}><Desktop size={17} /></button><button type="button" onClick={() => setPhoneView(true)} aria-label="Phone preview" aria-pressed={phoneView} className={`grid size-9 place-items-center rounded-lg ${phoneView ? "bg-default" : ""}`}><DeviceMobile size={17} /></button></div>} />
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
          <div className="flex items-center justify-between"><h2 className="font-semibold">Sections</h2><span className="text-xs text-muted">Drag with the arrows</span></div>
          {sectionRows(visibleSections)}
          <div className="flex flex-wrap gap-2"><AppButton size="sm" variant="secondary" startContent={<Plus size={15} />} label="Add products" onPress={() => updateDraft((current) => ({ ...current, sections: [...current.sections, { id: createIdempotencyKey("products"), type: "product_grid", enabled: true, content: { title: "More to explore", source: "new", limit: 8 } }] }))} /><AppButton size="sm" variant="secondary" startContent={<Plus size={15} />} label="Add collections" onPress={() => updateDraft((current) => ({ ...current, sections: [...current.sections, { id: createIdempotencyKey("collections"), type: "collections", enabled: true, content: { collection_ids: [] } }] }))} /></div>
        </section>
        <div className="sticky bottom-0 space-y-3 rounded-2xl border border-default bg-surface/95 p-3 backdrop-blur">
          <p className="text-xs text-muted" role="status">{saveState === "saving" ? "Saving changes…" : saveState === "error" ? "Could not save. Edit a field to try again." : saveState === "pending" ? "Saving soon…" : "All changes saved"}</p>
          <div className="flex flex-wrap gap-2"><AppButton variant="secondary" label="Discard changes" isDisabled={!design.has_unpublished_changes} isLoading={discardAction.isPending} onPress={() => discardAction.mutate(undefined)} /><AppButton label={design.has_unpublished_changes ? "Publish changes" : "Publish"} isDisabled={!design.has_unpublished_changes || saveState !== "saved"} isLoading={publishAction.isPending} onPress={() => publishAction.mutate(undefined)} /></div>
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
  </Page>;
}

function FaqEditor({ section, update }: { section: StoreSection; update: (content: Record<string, unknown>) => void }) {
  const raw = Array.isArray(section.content.items) ? section.content.items as { question?: string; answer?: string }[] : [];
  const edit = (index: number, key: "question" | "answer", value: string) => update({ items: raw.map((item, i) => i === index ? { ...item, [key]: value } : item) });
  return <div className="space-y-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Questions</h3><AppButton size="sm" variant="secondary" label="Add question" isDisabled={raw.length >= 10} onPress={() => update({ items: [...raw, { question: "", answer: "" }] })} /></div>{raw.map((item, index) => <div key={index} className="space-y-3 rounded-xl border border-default p-3"><AppInput label={`Question ${index + 1}`} value={item.question ?? ""} onChange={(event) => edit(index, "question", event.target.value)} maxLength={240} /><AppTextarea label="Answer" value={item.answer ?? ""} onChange={(event) => edit(index, "answer", event.target.value)} rows={3} /><button type="button" onClick={() => update({ items: raw.filter((_, i) => i !== index) })} className="text-xs text-danger">Remove question</button></div>)}</div>;
}

export function StorefrontDesignPage() {
  return <WorkspaceGate businessOnly>{({ workspaceId }) => <StorefrontDesignContent key={workspaceId} workspaceId={workspaceId} />}</WorkspaceGate>;
}
