"use client";

// Store → Templates (the gallery) and Templates → Customise (a short step form).
// Customising edits a private draft; the last step previews it before Publish.

import { ArrowLeft, ArrowRight, ImageSquare, PaintBrush, PencilSimple, UploadSimple } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useState, type MouseEvent, type ReactNode } from "react";

import { useFinanceAction, WorkspaceGate } from "@/components/features/finance/shared";
import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppSelect } from "@/components/ui/app-select";
import { AppSwitch } from "@/components/ui/app-switch";
import { FormPage, FormSection, StepNav } from "@/components/ui/form-kit";
import { Page, PageHeader, StatusPill } from "@/components/ui/page";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { financeApi, formatMinorAmount, moneyKeys } from "@/lib/money";
import { uploadProductImage } from "@/lib/products";
import { createDefaultSections, STORE_THEMES, type BrandSettings, type StoreSection, type ThemeStoreData } from "@/lib/store-themes";
import type { PublicStorefrontProjection, StorefrontDesign } from "@/types/finance";

import { EssentialStoreFooter, StoreServiceCards } from "./essential-store-footer";
import { StoreFaqDrawer, type StoreFaqItem } from "./store-faq-drawer";

export const SELECTABLE_TEMPLATES = ["simple", "studio", "market"] as const;
export type SelectableTemplate = (typeof SELECTABLE_TEMPLATES)[number];

type Draft = { theme_key: SelectableTemplate; name: string; brand: BrandSettings; sections: StoreSection[] };
const STEPS = ["Header & banner", "Products", "Sections", "Preview"];
const SECTION_LABELS: Record<string, string> = { announcement: "Top banner message", about: "About us", contact: "Contact & WhatsApp", faq: "Questions (FAQ)" };

function readFaqItems(section: StoreSection): StoreFaqItem[] {
  if (!Array.isArray(section.content.items)) return [];
  return section.content.items
    .filter((item): item is StoreFaqItem => Boolean(item && typeof item.question === "string" && typeof item.answer === "string"))
    .slice(0, 10)
    .map((item) => ({ ...item }));
}

function draftFrom(design: StorefrontDesign, theme: SelectableTemplate): Draft {
  const saved = design.theme_drafts?.[theme];
  const activeDraft = design.draft_theme_key === theme;
  const activePublished = design.published_theme_key === theme;
  const source = activeDraft ? design.draft_sections : saved?.sections ?? (activePublished ? design.published_sections : []);
  const current = (source ?? []).map((section) => {
    if (section.type !== "hero") return section;
    const content = { ...section.content };
    delete content.product_id;
    return { ...section, content };
  });
  const name = (activeDraft ? design.draft_name : saved?.name) || design.name;
  const defaults = createDefaultSections(theme, name);
  const optional: StoreSection[] = [
    { id: "announcement", type: "announcement", enabled: false, content: { text: "", link: "" } },
    { id: "faq", type: "faq", enabled: false, content: { items: [] } },
    { id: "about", type: "about", enabled: false, content: { heading: "", body: "" } },
  ];
  const missing = (item: StoreSection) => !current.some((section) => section.type === item.type);
  const brand = activeDraft ? design.draft_brand : saved?.brand ?? design.published_brand;
  const shared = design.draft_brand;
  return {
    theme_key: theme,
    name,
    brand: { ...brand, colors: shared.colors, heading_font: shared.heading_font, body_font: shared.body_font, logo_url: shared.logo_url },
    sections: [...current, ...defaults.filter(missing), ...optional.filter((section) => missing(section) && !defaults.some((item) => item.type === section.type))],
  };
}

export function StorePreview({ data, draft }: { data: PublicStorefrontProjection; draft: Draft }) {
  const [page, setPage] = useState<"home" | "shop" | "about">(draft.theme_key === "simple" ? "shop" : "home");
  const store: ThemeStoreData = {
    name: draft.name,
    slug: data.slug,
    tagline: data.tagline,
    description: data.description,
    logo_url: draft.brand.logo_url || data.logo_url,
    banner_url: data.banner_url,
    phone: data.contact_phone,
    email: data.contact_email,
    whatsapp_number: data.whatsapp_number,
    address: data.address,
    business_hours: data.business_hours,
    products: data.products,
    collections: data.collections,
  };
  const Renderer = STORE_THEMES[draft.theme_key].Renderer;
  // Links inside the preview switch pages here instead of leaving the editor.
  const navigate = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as HTMLElement).closest("a");
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute("href") || "";
    if (href.endsWith("/about")) setPage("about");
    else if (href === "/s/" + encodeURIComponent(store.slug)) setPage("home");
    else setPage("shop");
  };
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white" onClickCapture={navigate} onSubmitCapture={(event) => { event.preventDefault(); setPage("shop"); }}>
      <Renderer store={store} brand={draft.brand} sections={draft.sections} page={page} />
      {page === "shop" ? <StoreServiceCards slug={data.slug} delivery={data.delivery_guidance} returns={data.return_policy} support={data.contact_email ? `mailto:${data.contact_email}` : undefined} /> : null}
      <EssentialStoreFooter store={store} brand={draft.brand} showContact={draft.sections.find((section) => section.type === "contact")?.enabled !== false} />
    </div>
  );
}

/** An image field: thumbnail plus an upload button. */
function ImageField({ label, src, shape = "wide", uploading, onUpload, fallback }: { label: string; src?: string; shape?: "wide" | "square"; uploading: boolean; onUpload: (file: File) => void; fallback?: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium">{label}</p>
      <div className={`flex gap-3 ${shape === "square" ? "items-center" : "flex-col"}`}>
        <div className={`relative grid shrink-0 place-items-center overflow-hidden border border-border bg-surface-secondary ${shape === "square" ? "size-14 rounded-xl" : "aspect-[16/5] w-full rounded-xl"}`}>
          {src ? <Image src={src} alt="" fill sizes={shape === "square" ? "56px" : "(max-width: 768px) 100vw, 720px"} unoptimized className="object-cover" /> : (fallback ?? <ImageSquare size={22} className="text-muted" aria-hidden="true" />)}
        </div>
        <label className="inline-flex h-10 w-fit cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-4 text-[13px] font-medium transition-colors hover:bg-surface-secondary">
          <UploadSimple size={16} aria-hidden="true" />
          {uploading ? "Uploading…" : src ? "Change" : "Upload"}
          <input
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onUpload(file);
            }}
          />
        </label>
      </div>
    </div>
  );
}

function Content({ workspaceId, template }: { workspaceId: number; template?: SelectableTemplate }) {
  const theme = template ?? "simple";
  const customizing = Boolean(template);
  const client = useQueryClient();
  const key = [...moneyKeys.workspace(workspaceId), "storefront-design"];
  const query = useQuery({ queryKey: key, queryFn: () => financeApi.getStorefrontDesign(workspaceId), retry: false });
  const preview = useQuery({ queryKey: [...key, "private-preview"], queryFn: () => financeApi.getStorefrontDesignPreview(workspaceId), enabled: Boolean(query.data), retry: false });
  const [edited, setEdited] = useState<Draft | null>(null);
  const [step, setStep] = useState(0);
  const [uploading, setUploading] = useState<"" | "banner" | "favicon" | "story">("");
  const [uploadError, setUploadError] = useState("");
  const [faqItems, setFaqItems] = useState<StoreFaqItem[] | null>(null);
  const draft = edited ?? (query.data ? draftFrom(query.data, theme) : null);

  const save = useFinanceAction(
    workspaceId,
    async () => {
      if (!draft || !query.data) throw new Error("Wait for the template to load.");
      if (Array.from(String(draft.sections.find((section) => section.type === "about")?.content.body || "")).length > 3000) throw new Error("About us is too long. Shorten it before saving.");
      const saved = await financeApi.saveStorefrontDesignDraft(workspaceId, { ...draft, expected_version: query.data.version, idempotency_key: crypto.randomUUID() });
      client.setQueryData(key, saved);
      setEdited(draftFrom(saved, theme));
      await preview.refetch();
      return saved;
    },
    { success: "Draft saved" },
  );
  const publish = useFinanceAction(
    workspaceId,
    async () => {
      const banner = draft?.sections.find((item) => item.type === "hero");
      if (theme === "simple" && banner?.enabled && !banner.content.image && !preview.data?.storefront.banner_url) throw new Error("Upload a banner image, or turn the banner off.");
      const saved = (await save.mutateAsync(undefined)) as StorefrontDesign;
      const published = await financeApi.publishStorefrontDesign(workspaceId, { expected_version: saved.version, idempotency_key: crypto.randomUUID() });
      client.setQueryData(key, published);
      setEdited(draftFrom(published, theme));
      return published;
    },
    { success: "Template published" },
  );

  const purchase = useFinanceAction(workspaceId, async () => {
    await save.mutateAsync(undefined);
    const intent = await financeApi.createStorefrontThemeCheckout(workspaceId, theme, crypto.randomUUID());
    if (!intent.authorization_url) throw new Error("Payment checkout is unavailable.");
    window.location.assign(intent.authorization_url);
  }, { success: "Opening template checkout" });

  const update = (change: (base: Draft) => Draft) => setEdited((current) => (current ?? draft ? change((current ?? draft)!) : current));
  const patch = (type: StoreSection["type"], content: Record<string, unknown>) => update((base) => ({ ...base, sections: base.sections.map((item) => (item.type === type ? { ...item, content: { ...item.content, ...content } } : item)) }));
  const toggle = (type: StoreSection["type"], enabled: boolean) => update((base) => ({ ...base, sections: base.sections.map((item) => (item.type === type ? { ...item, enabled } : item)) }));
  const upload = async (target: "banner" | "favicon" | "story", file: File) => {
    setUploading(target);
    setUploadError("");
    try {
      const url = await uploadProductImage(workspaceId, file);
      if (target === "banner") patch("hero", { image: url });
      else if (target === "story") patch("about", { image: url });
      else update((base) => ({ ...base, brand: { ...base.brand, favicon_url: url } }));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "The image could not be uploaded.");
    } finally {
      setUploading("");
    }
  };

  if (query.isPending) return <Page><PageHeader title="Templates" /><div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"><div className="aspect-[4/3] animate-pulse rounded-2xl bg-default" /></div></Page>;
  if (!query.data || !draft) {
    return (
      <Page>
        <PageHeader title="Templates" description="Add your store information first." actions={<Link href="/store/information"><AppButton label="Store information" /></Link>} />
      </Page>
    );
  }

  if (!customizing) {
    const design = query.data;
    const cards = SELECTABLE_TEMPLATES.map((key) => ({ key, option: design.available_themes.find((item) => item.key === key) }));
    const owned = cards.filter(({ key, option }) => key === "simple" || option?.owned);
    const library = cards.filter((card) => !owned.includes(card));
    const cardGrid = (items: typeof cards) => <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(({ key, option }) => {
        const manifest = STORE_THEMES[key];
        const active = design.published_theme_key === key;
        const price = key === "simple" ? "Free" : option?.price_minor && option.currency
          ? formatMinorAmount(option.price_minor, option.currency, 2) + " one time" : "Premium";
        return <article key={key} className="min-w-0">
          <Link href={"/store/templates/customization/" + key} className="group block">
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-surface-secondary">
              {key === "simple" ? <div aria-hidden="true" inert className="pointer-events-none absolute top-0 left-0 w-[1280px] origin-top-left scale-[0.24] bg-white">
                {preview.data ? <StorePreview data={preview.data.storefront} draft={draftFrom(design, key)} /> : null}
              </div> : <Image src={"/storefront-demos/media/" + key + "-preview.jpg"} alt={manifest.name + " storefront screenshot"} fill sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" className="object-cover object-top" /> }
              <div className="absolute inset-0 grid place-items-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <span className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black"><PaintBrush size={16} aria-hidden="true" />{option?.owned || key === "simple" ? "Customise" : "Try template"}</span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{manifest.name}</h3>
              {active ? <StatusPill tone="success">Active</StatusPill> : null}
            </div>
          </Link>
          <p className="mt-1 text-xs text-muted">{price}</p>
          <p className="mt-2 text-sm text-muted">{manifest.description}</p>
          {key !== "simple" ? <Link href={"/storefront-demos/" + key} className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">View live demo</Link> : null}
        </article>;
      })}
    </div>;
    return <Page>
      <PageHeader title="Templates" description="Choose a template, then customise it." />
      <section className="space-y-4"><h2 className="text-base font-semibold">My templates</h2>{cardGrid(owned)}</section>
      {library.length ? <section className="space-y-4 border-t border-border pt-6"><h2 className="text-base font-semibold">Premium templates</h2>{cardGrid(library)}</section> : null}
    </Page>;
  }

  const option = query.data.available_themes.find((item) => item.key === theme);
  const ownsTemplate = theme === "simple" || option?.owned;
  const hero = draft.sections.find((item) => item.type === "hero")!;
  const products = draft.sections.find((item) => item.type === "product_grid")!;
  const bannerSrc = String(hero.content.image || preview.data?.storefront.banner_url || "");
  const logo = draft.brand.logo_url || preview.data?.storefront.logo_url || "";
  const last = step === STEPS.length - 1;
  const busy = save.isPending || publish.isPending || purchase.isPending || Boolean(uploading);

  return (
    <FormPage
      pinActions
      title={"Customise " + STORE_THEMES[theme].name}
      back={{ href: "/store/templates", label: "Templates" }}
      actions={
        <>
          {step > 0 ? <AppButton variant="ghost" className="mr-auto" startContent={<ArrowLeft size={15} />} label="Back" onPress={() => setStep(step - 1)} /> : <span className="mr-auto" />}
          <AppButton variant="secondary" label="Save draft" isLoading={save.isPending && !publish.isPending} isDisabled={busy} onPress={() => save.mutate(undefined)} />
          {last ? (
            ownsTemplate ? <AppButton label="Publish" isLoading={publish.isPending} isDisabled={busy} onPress={() => publish.mutate(undefined)} /> : <AppButton label={option?.purchasable ? "Buy template" : "Purchase unavailable"} isLoading={purchase.isPending} isDisabled={busy || !option?.purchasable} onPress={() => purchase.mutate(undefined)} />
          ) : (
            <AppButton endContent={<ArrowRight size={15} />} label="Continue" onPress={() => setStep(step + 1)} />
          )}
        </>
      }
    >
      <StepNav steps={STEPS.map((label) => ({ label }))} current={step + 1} onStep={(value) => setStep(value - 1)} canJump />

      {step === 0 ? (
        <FormSection title="Header & banner">
          <ImageField
            label="Favicon"
            shape="square"
            src={draft.brand.favicon_url || undefined}
            uploading={uploading === "favicon"}
            onUpload={(file) => void upload("favicon", file)}
            fallback={logo ? <Image src={logo} alt="" fill sizes="56px" unoptimized className="object-cover opacity-60" /> : undefined}
          />
          {!draft.brand.favicon_url ? <p className="-mt-2 text-[12px] text-muted">Uses your logo until you upload one.</p> : null}
          <div className="flex items-center justify-between gap-3 border-t border-separator pt-5">
            <span className="text-[14px] font-semibold">{theme === "studio" ? "Campaign banner" : theme === "market" ? "Promotional banner" : "Banner"}</span>
            <AppSwitch aria-label="Show banner" isSelected={hero.enabled} onChange={(enabled) => toggle("hero", enabled)} />
          </div>
          {hero.enabled ? (
            <>
              <ImageField label="Banner image" src={bannerSrc || undefined} uploading={uploading === "banner"} onUpload={(file) => void upload("banner", file)} />
              <AppInput label="Heading" maxLength={80} value={String(hero.content.heading ?? "Shop")} onChange={(event) => patch("hero", { heading: event.target.value })} />
              <AppInput label="Text under the heading" maxLength={180} value={String(hero.content.subheading ?? "")} onChange={(event) => patch("hero", { subheading: event.target.value })} />
            </>
          ) : null}
          {uploadError ? <p role="alert" className="text-[13px] text-danger">{uploadError}</p> : null}
        </FormSection>
      ) : null}

      {step === 1 ? (
        <FormSection title={theme === "simple" ? "Products" : "Home page products"} action={<AppSwitch aria-label="Show products" isSelected={products.enabled} onChange={(enabled) => toggle("product_grid", enabled)} />}>
          {products.enabled ? (
            <>
              <AppSelect
                label="Which products"
                selectedKey={String(products.content.source || "new")}
                options={[
                  { key: "new", label: "All products" },
                  { key: "featured", label: "Featured products" },
                  { key: "collection", label: "One collection" },
                ]}
                onSelectionChange={(value) => patch("product_grid", { source: value })}
              />
              {products.content.source === "collection" ? (
                <AppSelect
                  label="Collection"
                  options={(preview.data?.storefront.collections ?? []).map((item) => ({ key: String(item.id), label: item.name }))}
                  selectedKey={String(products.content.collection_id || "")}
                  onSelectionChange={(value) => patch("product_grid", { collection_id: Number(value) })}
                />
              ) : null}
            </>
          ) : null}
        </FormSection>
      ) : null}

      {step === 2 ? (
        <FormSection title={theme === "studio" ? "Collections & story" : theme === "market" ? "Categories & store information" : "Sections"}>
          {uploadError ? <p role="alert" className="text-sm text-danger">{uploadError}</p> : null}
          <div className="divide-y divide-separator">
            {theme !== "simple" ? (() => {
              const category = draft.sections.find((section) => section.type === "collections");
              const collections = preview.data?.storefront.collections ?? [];
              const chosen = Array.isArray(category?.content.collection_ids) ? category.content.collection_ids.map(Number) : [];
              return category ? <div className="space-y-3 pb-4">
                <div className="flex justify-between gap-3"><p className="text-sm font-medium">{theme === "studio" ? "Curated collections" : "Category shortcuts"}</p><AppSwitch aria-label="Show home page collections" isSelected={category.enabled} onChange={(enabled) => toggle("collections", enabled)} /></div>
                {category.enabled && collections.length ? <fieldset className="space-y-2"><legend className="mb-2 text-xs text-muted">Choose collections, or leave all unchecked to show every collection.</legend>
                  {collections.map((item) => <label key={item.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={chosen.includes(item.id)} onChange={(event) => patch("collections", { collection_ids: event.target.checked ? [...chosen, item.id] : chosen.filter((id) => id !== item.id) })} />{item.name}</label>)}
                </fieldset> : null}
              </div> : null;
            })() : null}
            {draft.sections
              .filter((section) => SECTION_LABELS[section.type])
              .map((section) => (
                <div key={section.id} className="space-y-4 py-4 first:pt-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[14px] font-medium">{SECTION_LABELS[section.type]}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      {section.type === "faq" && section.enabled ? <AppButton size="sm" variant="secondary" startContent={<PencilSimple />} label="Edit" onPress={() => setFaqItems(readFaqItems(section))} /> : null}
                      <AppSwitch aria-label={`Show ${SECTION_LABELS[section.type]}`} isSelected={section.enabled} onChange={(enabled) => toggle(section.type, enabled)} />
                    </div>
                  </div>
                  {section.enabled && section.type === "about" ? (
                    <>
                      <AppInput label="Heading" maxLength={80} value={String(section.content.heading || "About us")} onChange={(event) => patch("about", { heading: event.target.value })} />
                      <RichTextEditor label={theme === "studio" ? "Brand story" : "About your store"} value={String(section.content.body || "")} onChange={(body) => patch("about", { body })} />
                      {theme === "studio" ? <ImageField label="Story image" src={String(section.content.image || "")} uploading={uploading === "story"} onUpload={(file) => void upload("story", file)} /> : null}
                    </>
                  ) : null}
                  {section.enabled && section.type === "announcement" ? <AppInput label="Message" maxLength={120} value={String(section.content.text || "")} onChange={(event) => patch("announcement", { text: event.target.value })} /> : null}
                </div>
              ))}
            <div className="flex items-center justify-between gap-3 pt-4">
              <span className="text-[14px] font-medium">Policies</span>
              <Link className="text-[13px] font-semibold text-primary hover:underline" href="/store/settings">
                Edit in settings
              </Link>
            </div>
          </div>
        </FormSection>
      ) : null}

      {last ? (
        <FormSection title="Preview">
          {preview.isPending ? (
            <div className="aspect-[16/10] animate-pulse rounded-2xl bg-default" />
          ) : preview.data ? (
            <StorePreview data={preview.data.storefront} draft={draft} />
          ) : (
            <p role="alert" className="text-[13px] text-danger">The preview could not load. Save your draft and try again.</p>
          )}
        </FormSection>
      ) : null}

      {faqItems !== null ? (
        <StoreFaqDrawer
          items={faqItems}
          onClose={() => setFaqItems(null)}
          onDone={(items) => {
            patch("faq", { items });
            setFaqItems(null);
          }}
        />
      ) : null}
    </FormPage>
  );
}

export function StorefrontDesignPage({ template }: { template?: SelectableTemplate }) {
  return <WorkspaceGate businessOnly>{({ workspaceId }) => <Content key={workspaceId + ":" + (template ?? "gallery")} workspaceId={workspaceId} template={template} />}</WorkspaceGate>;
}
