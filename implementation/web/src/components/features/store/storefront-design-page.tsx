"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type MouseEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { UploadSimple, PaintBrush, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { WorkspaceGate, useFinanceAction } from "@/components/features/finance/shared";
import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppSelect } from "@/components/ui/app-select";
import { AppTextarea } from "@/components/ui/app-textarea";
import { AppSwitch } from "@/components/ui/app-switch";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { SideSheet } from "@/components/ui/side-sheet";
import { Page, PageHeader, StatusPill } from "@/components/ui/page";
import { FormPage, FormSection, StepNav } from "@/components/ui/form-kit";
import { financeApi, moneyKeys } from "@/lib/money";
import { uploadProductImage } from "@/lib/products";
import { createDefaultSections, STORE_THEMES, type StoreSection, type BrandSettings, type ThemeStoreData } from "@/lib/store-themes";
import type { StorefrontDesign, PublicStorefrontProjection } from "@/types/finance";
import { EssentialStoreFooter, StoreServiceCards } from "./essential-store-footer";

type Draft = { theme_key: "simple"; name: string; brand: BrandSettings; sections: StoreSection[] };
type FaqItem = { question: string; answer: string };
const steps = ["Banner", "Catalogue", "Store sections", "Preview & publish"];
const labels: Record<string, string> = { announcement: "Top banner message", about: "About us page", contact: "Contact information & WhatsApp", faq: "Frequently asked questions" };

function readFaqItems(section: StoreSection): FaqItem[] {
  if (!Array.isArray(section.content.items)) return [];
  return section.content.items.filter((item): item is FaqItem => Boolean(item && typeof item.question === "string" && typeof item.answer === "string")).slice(0, 10).map((item) => ({ ...item }));
}

function draftFrom(design: StorefrontDesign): Draft {
  const current = (design.draft_sections ?? []).map((section) => { if (section.type !== "hero") return section; const content = { ...section.content }; delete content.product_id; return { ...section, content }; });
  const defaults = createDefaultSections("simple", design.draft_name || design.name);
  const optional: StoreSection[] = [ { id: "announcement", type: "announcement", enabled: false, content: { text: "", link: "" } }, { id: "faq", type: "faq", enabled: false, content: { items: [] } } ];
  return { theme_key: "simple", name: design.draft_name || design.name, brand: design.draft_brand, sections: [...current, ...defaults.filter((item) => !current.some((section) => section.type === item.type)), ...optional.filter((item) => !current.some((section) => section.type === item.type))] };
}

function StorePreview({ data, draft }: { data: PublicStorefrontProjection; draft: Draft }) {
  const [page, setPage] = useState<"shop" | "about">("shop");
  const store: ThemeStoreData = { name: draft.name, slug: data.slug, tagline: data.tagline, description: data.description, logo_url: draft.brand.logo_url || data.logo_url, banner_url: data.banner_url, phone: data.contact_phone, email: data.contact_email, whatsapp_number: data.whatsapp_number, address: data.address, business_hours: data.business_hours, products: data.products, collections: data.collections };
  const Renderer = STORE_THEMES.simple.Renderer;
  const navigate = (event: MouseEvent<HTMLDivElement>) => { const link = (event.target as HTMLElement).closest("a"); if (link) { event.preventDefault(); const href = link.getAttribute("href") || ""; setPage(href.endsWith("/about") ? "about" : "shop"); } };
  return <div className="overflow-hidden rounded-2xl border border-border bg-white" onClickCapture={navigate}><Renderer store={store} brand={draft.brand} sections={draft.sections} page={page} headerAction={<span className="text-xs">Cart · preview</span>} />{page === "shop" ? <StoreServiceCards slug={data.slug} delivery={data.delivery_guidance} returns={data.return_policy} support={data.contact_email ? `mailto:${data.contact_email}` : undefined} /> : null}<EssentialStoreFooter store={store} brand={draft.brand} showContact={draft.sections.find((section) => section.type === "contact")?.enabled !== false} /></div>;
}

function Content({ workspaceId }: { workspaceId: number }) {
  const pathname = usePathname();
  const customizing = pathname.includes("/customization/");
  const client = useQueryClient();
  const key = [...moneyKeys.workspace(workspaceId), "storefront-design"];
  const query = useQuery({ queryKey: key, queryFn: () => financeApi.getStorefrontDesign(workspaceId), retry: false });
  const preview = useQuery({ queryKey: [...key, "private-preview"], queryFn: () => financeApi.getStorefrontDesignPreview(workspaceId), enabled: Boolean(query.data), retry: false });
  const [edited, setEdited] = useState<Draft | null>(null);
  const [step, setStep] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [faqItems, setFaqItems] = useState<FaqItem[] | null>(null);
  const draft = edited ?? (query.data ? draftFrom(query.data) : null);
  const save = useFinanceAction(workspaceId, async () => {
    if (!draft || !query.data) throw new Error("Wait for the template to load.");
    if (Array.from(String(draft.sections.find((section) => section.type === "about")?.content.body || "")).length > 3000) throw new Error("About your store is too long. Shorten the content before saving.");
    const saved = await financeApi.saveStorefrontDesignDraft(workspaceId, { ...draft, expected_version: query.data.version, idempotency_key: crypto.randomUUID() });
    client.setQueryData(key, saved);
    setEdited(draftFrom(saved));
    await preview.refetch();
    return saved;
  }, { success: "Template draft saved" });
  const publish = useFinanceAction(workspaceId, async () => {
    const banner = draft?.sections.find((item) => item.type === "hero");
    if (banner?.enabled && !banner.content.image && !preview.data?.storefront.banner_url) throw new Error("Upload a banner image before publishing, or hide the banner.");
    const saved = await save.mutateAsync(undefined) as StorefrontDesign;
    const published = await financeApi.publishStorefrontDesign(workspaceId, { expected_version: saved.version, idempotency_key: crypto.randomUUID() });
    client.setQueryData(key, published);
    setEdited(draftFrom(published));
    return published;
  }, { success: "Template published" });
  const patch = (type: StoreSection["type"], content: Record<string, unknown>) => { if (draft) setEdited((current) => { const base = current ?? draft; return { ...base, sections: base.sections.map((item) => item.type === type ? { ...item, content: { ...item.content, ...content } } : item) }; }); };
  const toggle = (type: StoreSection["type"], enabled: boolean) => { if (draft) setEdited({ ...draft, sections: draft.sections.map((item) => item.type === type ? { ...item, enabled } : item) }); };
  if (query.isPending) return <Page><PageHeader title="Templates" description="Loading your templates…" /></Page>;
  if (!query.data || !draft) return <Page><PageHeader title="Templates" description="Create your store information to get started." /><Link href="/store/information" className="text-primary">Store information</Link></Page>;
  if (!customizing) return <Page>
    <PageHeader title="Templates" description="Choose a complete store template, then customise its sections." />
    <h2 className="text-lg font-semibold">My templates</h2>
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"><Link href="/store/templates/customization/simple" className="group block">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-[#eeeae4] p-5"><div aria-hidden="true" inert className="pointer-events-none absolute left-4 top-5 w-[1200px] origin-top-left scale-[0.23] bg-white shadow-xl">{preview.data ? <StorePreview data={preview.data.storefront} draft={draft} /> : <p className="p-10 text-sm">Loading Essential…</p>}</div><div className="absolute inset-0 grid place-items-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><span className="flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black"><PaintBrush />Customise</span></div></div>
      <div className="mt-3 flex items-center justify-between"><span className="font-medium">Essential</span><StatusPill tone="success">{query.data.published_theme_key === "simple" ? "Active" : "Installed"}</StatusPill></div><p className="mt-1 text-xs text-muted">Free · Catalogue with category filters</p>
    </Link></div>
    <section className="mt-8 border-t border-border pt-6"><h2 className="text-lg font-semibold">More templates</h2><p className="mt-2 text-sm text-muted">More templates will appear here as they become available.</p></section>
  </Page>;
  const hero = draft.sections.find((item) => item.type === "hero")!;
  const products = draft.sections.find((item) => item.type === "product_grid")!;
  const aside = <section className="space-y-3 rounded-2xl border border-border bg-surface p-5"><StatusPill tone="neutral">Essential · Free</StatusPill><h2 className="font-semibold">Your store template</h2><p className="text-sm leading-6 text-muted">A banner, a catalogue with categories at the side, and separate product and customer information pages.</p><Link href="/store/information" className="block text-sm text-primary">Edit brand colours & fonts →</Link><p className="text-xs leading-5 text-muted">Uses your primary and secondary colours. A colour you leave unset uses Essential’s default.</p></section>;
  return <FormPage pinActions title="Customise Essential" description="Save a private draft, preview it, then publish when it is ready." back={{ href: "/store/templates", label: "Templates" }} aside={step === 3 ? undefined : aside} actions={<>
    <AppButton variant="ghost" label="Back" isDisabled={step === 0} onPress={() => setStep(step - 1)} />
    <AppButton variant="secondary" label="Save draft" isLoading={save.isPending} isDisabled={uploading || publish.isPending} onPress={() => save.mutate(undefined)} />
    {step < 3 ? <AppButton label="Continue" onPress={() => setStep(step + 1)} /> : <><AppButton variant="secondary" label="Refresh saved preview" isDisabled={save.isPending || publish.isPending} onPress={() => save.mutate(undefined)} /><AppButton label="Publish" isLoading={publish.isPending} isDisabled={save.isPending || uploading} onPress={() => publish.mutate(undefined)} /></>}
  </>}>
    <StepNav steps={steps.map((label, index) => ({ label, description: ["Hero image and introduction", "Products and categories", "Optional content", "Review your private draft"][index] }))} current={step + 1} onStep={(value) => setStep(value - 1)} canJump />
    {step === 0 ? <FormSection title="Shop banner" description="Upload a wide image for your shop banner.">
      <AppSwitch label="Display custom banner" isSelected={hero.enabled} onChange={(enabled) => toggle("hero", enabled)} />
      {hero.enabled ? <>{hero.content.image || preview.data?.storefront.banner_url ? <div className="relative aspect-[16/5] overflow-hidden rounded-xl border border-border bg-default"><Image src={String(hero.content.image || preview.data?.storefront.banner_url)} alt="Uploaded shop banner" fill sizes="(max-width: 768px) 100vw, 720px" unoptimized className="object-cover" /></div> : null}<label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm"><UploadSimple />{uploading ? "Uploading…" : hero.content.image ? "Change banner image" : "Upload banner image"}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; setUploading(true); setUploadError(""); try { const image = await uploadProductImage(workspaceId, file); patch("hero", { image }); } catch (error) { setUploadError(error instanceof Error ? error.message : "Image upload failed."); } finally { setUploading(false); } }} /></label>
      <AppInput label="Banner heading" maxLength={80} value={String(hero.content.heading ?? "Shop")} onChange={(event) => patch("hero", { heading: event.target.value })} /><AppInput label="Short banner description" maxLength={180} description={`${String(hero.content.subheading ?? "").length}/180 characters`} value={String(hero.content.subheading ?? "")} onChange={(event) => patch("hero", { subheading: event.target.value })} /></> : null}
      {uploadError ? <p role="alert" className="text-sm text-danger">{uploadError}</p> : null}
    </FormSection> : null}
    {step === 1 ? <FormSection title="Product listing" description="Categories appear beside your products on desktop and in a filter menu on phones."><AppSwitch label="Display products" isSelected={products.enabled} onChange={(enabled) => toggle("product_grid", enabled)} /><AppSelect label="Product listing" selectedKey={String(products.content.source || "new")} options={[{ key: "new", label: "All published products" }, { key: "featured", label: "Featured products" }, { key: "collection", label: "One collection" }]} onSelectionChange={(value) => patch("product_grid", { source: value })} />{products.content.source === "collection" ? <AppSelect label="Collection" options={(preview.data?.storefront.collections ?? []).map((item) => ({ key: String(item.id), label: item.name }))} selectedKey={String(products.content.collection_id || "")} onSelectionChange={(value) => patch("product_grid", { collection_id: Number(value) })} /> : null}<p className="text-sm text-muted">Every product opens its own page. Product options are chosen before adding an item to the cart.</p></FormSection> : null}
    {step === 2 ? <FormSection title="Store sections">
      <div className="divide-y divide-border">
        {draft.sections.filter((section) => labels[section.type]).map((section) => <div key={section.id} className="space-y-4 py-5 first:pt-0">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{labels[section.type]}</span>
            <div className="flex shrink-0 items-center gap-3">
              {section.type === "faq" && section.enabled ? <AppButton size="sm" variant="secondary" startContent={<PencilSimple />} label="Edit FAQ" onPress={() => setFaqItems(readFaqItems(section))} /> : null}
              <AppSwitch aria-label={"Display " + labels[section.type]} isSelected={section.enabled} onChange={(enabled) => toggle(section.type, enabled)} />
            </div>
          </div>
          {section.enabled && section.type === "about" ? <>
            <AppInput label="Heading" maxLength={80} value={String(section.content.heading || "About us")} onChange={(event) => patch("about", { heading: event.target.value })} />
            <RichTextEditor label="About your store" value={String(section.content.body || "")} onChange={(body) => patch("about", { body })} />
          </> : null}
          {section.enabled && section.type === "announcement" ? <AppInput label="Message" maxLength={120} value={String(section.content.text || "")} onChange={(event) => patch("announcement", { text: event.target.value })} /> : null}
        </div>)}
        <div className="flex items-center justify-between gap-3 pt-5"><span className="text-sm font-medium">Policies</span><Link className="text-sm font-medium text-primary" href="/store/settings">Edit policies</Link></div>
      </div>
    </FormSection> : null}
    <SideSheet isOpen={faqItems !== null} onClose={() => setFaqItems(null)} title="Frequently asked questions" footer={<>
      <AppButton variant="ghost" label="Cancel" onPress={() => setFaqItems(null)} />
      <AppButton label="Done" isDisabled={faqItems?.some((item) => !item.question.trim() || !item.answer.trim()) ?? false} onPress={() => { if (faqItems) patch("faq", { items: faqItems.map((item) => ({ question: item.question.trim(), answer: item.answer.trim() })) }); setFaqItems(null); }} />
    </>}>
      <div className="space-y-5">
        {(faqItems ?? []).map((item, index) => <section key={index} className="space-y-3 rounded-xl border border-border p-4">
          <div className="flex items-center justify-between"><h3 className="text-sm font-medium">Question {index + 1}</h3><AppButton isIconOnly size="sm" variant="ghost" aria-label={"Remove question " + (index + 1)} startContent={<Trash />} onPress={() => setFaqItems((current) => current?.filter((_, i) => i !== index) ?? null)} /></div>
          <AppInput label="Question" isRequired maxLength={240} value={item.question} onChange={(event) => setFaqItems((current) => current?.map((row, i) => i === index ? { ...row, question: event.target.value } : row) ?? null)} />
          <AppTextarea label="Answer" isRequired rows={4} maxLength={1500} value={item.answer} onChange={(event) => setFaqItems((current) => current?.map((row, i) => i === index ? { ...row, answer: event.target.value } : row) ?? null)} />
        </section>)}
        <AppButton variant="secondary" startContent={<Plus />} label="Add question" isDisabled={(faqItems?.length ?? 0) >= 10} onPress={() => setFaqItems((current) => [...(current ?? []), { question: "", answer: "" }])} />
      </div>
    </SideSheet>
    {step === 3 ? <FormSection title="Private preview" description="This preview is available only within your signed-in workspace. Publishing is a separate action.">{preview.isPending ? <p>Loading your catalogue…</p> : preview.data ? <StorePreview data={preview.data.storefront} draft={draft} /> : <p role="alert" className="text-sm text-danger">Could not load the private preview. Save your draft and try again.</p>}</FormSection> : null}
  </FormPage>;
}

export function StorefrontDesignPage() { return <WorkspaceGate businessOnly>{({ workspaceId }) => <Content key={workspaceId} workspaceId={workspaceId} />}</WorkspaceGate>; }
