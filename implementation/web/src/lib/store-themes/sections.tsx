import Image from "next/image";
import type { ReactNode } from "react";
import { RichText } from "@/components/ui/rich-text-editor";

import { formatMinorAmount } from "@/lib/money";
import type { StoreSection, ThemeRendererProps, ThemeSectionManifest, ThemeStoreData } from "./types";

const text = (section: StoreSection, key: string, fallback = "") => {
  const value = section.content[key];
  return typeof value === "string" ? value : fallback;
};
const ids = (section: StoreSection, key: string): number[] => {
  const value = section.content[key];
  return Array.isArray(value) ? value.filter((id): id is number => typeof id === "number") : [];
};
const hrefFor = (raw: string) => /^https?:\/\//i.test(raw) ? raw : raw.startsWith("/") ? raw : `/${raw}`;

export const SECTION_MANIFEST: Record<string, ThemeSectionManifest> = {
  announcement: { fields: ["text", "link"], limits: { text: 120 } },
  hero: { fields: ["image", "heading", "subheading", "button_label"], limits: { heading: 80, subheading: 180, button_label: 28 }, max_slides: 1 },
  product_grid: { fields: ["title", "source", "collection_id", "limit"], limits: { title: 48 } },
  collections: { fields: ["collection_ids"] },
  about: { fields: ["heading", "body", "image"], limits: { heading: 80, body: 3000 } },
  faq: { fields: ["items"], limits: { items: 10 } },
  contact: { fields: [] },
};

function Frame({ section, children, onClick, preview }: { section: StoreSection; children: ReactNode; onClick?: (section: StoreSection) => void; preview?: boolean }) {
  return <section onClick={preview ? (event) => { event.preventDefault(); onClick?.(section); } : undefined} className={preview ? "cursor-pointer rounded-xl outline-none transition hover:outline hover:outline-2 hover:outline-primary/50 focus-visible:outline focus-visible:outline-2" : ""}>{children}</section>;
}

export function AnnouncementSection({ section, onSectionClick: onClick, preview }: { section: StoreSection } & Pick<ThemeRendererProps, "onSectionClick" | "preview">) {
  const message = text(section, "text");
  if (!message) return null;
  const link = text(section, "link");
  return <Frame section={section} preview={preview} onClick={onClick}><div className="px-4 py-2 text-center text-sm font-medium text-white" style={{ background: "var(--store-primary)" }}>{link ? <a href={hrefFor(link)}>{message}</a> : message}</div></Frame>;
}

export function HeroSection({ section, boutique, essential, store, brandLogoUrl, onSectionClick: onClick, preview }: { section: StoreSection; boutique?: boolean; essential?: boolean; store?: ThemeStoreData; brandLogoUrl?: string | null } & Pick<ThemeRendererProps, "onSectionClick" | "preview">) {
  const configuredHeading = text(section, "heading");
  const heading = essential
    ? store?.tagline?.trim() || (configuredHeading && !/^welcome(?:\s+to\s+.*)?$/i.test(configuredHeading.trim()) ? configuredHeading : "Find something you’ll love.")
    : configuredHeading;
  const configuredSubheading = text(section, "subheading");
  const subheading = essential && store?.description ? store.description : configuredSubheading;
  const image = text(section, "image") || (essential ? store?.banner_url || "" : "");
  return <Frame section={section} preview={preview} onClick={onClick}>
    <div className={`relative isolate overflow-hidden bg-[var(--store-surface)] ${essential ? "min-h-[340px] rounded-3xl sm:min-h-[440px]" : boutique ? "min-h-[360px] sm:min-h-[470px]" : "min-h-[240px] sm:min-h-[320px]"}`} style={!image && essential ? { background: "linear-gradient(110deg, #F2F6F3 0%, #E5EFE8 100%)" } : undefined}>
      {image ? <Image src={image} alt="" fill sizes="100vw" className="-z-10 object-cover" unoptimized /> : null}
      <div className={`${essential && !image ? "grid min-h-[inherit] items-center gap-8 px-7 py-10 sm:grid-cols-[1.1fr_0.9fr] sm:px-12" : `flex min-h-[inherit] flex-col justify-center gap-4 px-7 py-12 sm:px-12 ${image ? "bg-black/35 text-white" : ""} ${boutique ? "items-center text-center" : "items-start"}`}`}>
        <div className="flex flex-col items-start gap-4">
          {essential && !image ? <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--store-primary)]">Welcome to {store?.name || "the store"}</p> : null}
          {heading ? <h1 className={`max-w-3xl font-[family-name:var(--store-heading-font)] font-bold tracking-tight ${essential ? "text-4xl sm:text-6xl" : "text-3xl sm:text-5xl"}`}>{heading}</h1> : null}
          {subheading ? <p className="max-w-2xl text-base opacity-90 sm:text-lg">{subheading}</p> : null}
          {text(section, "button_label") ? <a href={essential ? `/s/${store?.slug || ""}/shop` : "#products"} className="mt-2 inline-flex rounded-full px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: "var(--store-primary)" }}>{text(section, "button_label")}</a> : null}
        </div>
        {essential && !image ? <div className="grid h-48 place-items-center overflow-hidden rounded-3xl bg-white/45 sm:h-64">
          {brandLogoUrl ? <Image src={brandLogoUrl} alt={store?.name ? `${store.name} logo` : "Store logo"} width={160} height={160} unoptimized className="size-36 rounded-full object-cover sm:size-40" /> : <div className="grid size-24 place-items-center rounded-full bg-white/70 text-3xl font-semibold text-[var(--store-primary)]">{store?.name?.slice(0, 1).toUpperCase() || "S"}</div>}
        </div> : null}
      </div>
    </div>
  </Frame>;
}

export function ProductGridSection({ section, data, renderProduct, productTools, onSectionClick: onClick, preview, boutique }: { section: StoreSection; data: ThemeRendererProps["store"]; renderProduct?: ThemeRendererProps["renderProduct"]; productTools?: ReactNode; boutique?: boolean } & Pick<ThemeRendererProps, "onSectionClick" | "preview">) {
  const source = text(section, "source", "new");
  const collectionID = Number(section.content.collection_id);
  let products = [...data.products];
  if (source === "featured") products = products.filter((product) => product.is_featured);
  if (source === "collection" && Number.isFinite(collectionID)) products = products.filter((product) => product.collection_id === collectionID);
  const groups = new Map<number, typeof products>();
  for (const product of products) {
    const group = groups.get(product.product_id) ?? [];
    group.push(product);
    groups.set(product.product_id, group);
  }
  const limitValue = Number(section.content.limit);
  let productGroups = [...groups.values()];
  if (Number.isFinite(limitValue) && limitValue > 0) productGroups = productGroups.slice(0, Math.min(limitValue, 48));
  return <Frame section={section} preview={preview} onClick={onClick}><div id="products" className="space-y-4 py-6">
    {text(section, "title", "Shop our products") ? <h2 className="font-[family-name:var(--store-heading-font)] text-xl font-bold tracking-tight sm:text-2xl">{text(section, "title", "Shop our products")}</h2> : null}
    {productTools}
    <div className={`grid grid-cols-2 ${boutique ? "gap-3 sm:grid-cols-3 lg:grid-cols-4" : "gap-3 sm:gap-5 lg:grid-cols-4"}`}>
      {productGroups.map((variants) => { const product = variants[0]; return <div key={product.product_id}>{renderProduct?.(product, variants) ?? <a href={`/s/${data.slug}/products/${product.product_id}`} className="block overflow-hidden rounded-xl border border-border bg-[var(--store-surface)]">
        <div className={`relative bg-black/5 ${boutique ? "aspect-[3/4]" : "aspect-square"}`}>{product.image_urls[0] ? <Image src={product.image_urls[0]} alt={product.title} fill sizes="(max-width: 640px) 50vw, 25vw" className="object-cover" unoptimized /> : null}</div>
        <div className="space-y-1 p-3"><p className="truncate text-sm font-medium">{product.title}</p><p className="text-sm font-semibold" style={{ color: "var(--store-primary)" }}>{formatMinorAmount(product.price_minor, product.currency, product.currency_exponent)}</p></div>
      </a>}</div>;})}
    </div>
  </div></Frame>;
}

export function CollectionsSection({ section, data, onSectionClick: onClick, preview, boutique }: { section: StoreSection; data: ThemeRendererProps["store"]; boutique?: boolean } & Pick<ThemeRendererProps, "onSectionClick" | "preview">) {
  const selected = ids(section, "collection_ids");
  const collections = (selected.length ? data.collections.filter((item) => selected.includes(item.id)) : data.collections).slice(0, 12);
  if (!collections.length) return null;
  return <Frame section={section} preview={preview} onClick={onClick}><div className="grid grid-cols-2 gap-3 py-5 sm:grid-cols-3">
    {collections.map((collection) => <a key={collection.id} href={`?collection=${collection.id}`} className={`group relative isolate overflow-hidden rounded-2xl bg-[var(--store-surface)] ${boutique ? "aspect-[4/3]" : "aspect-[3/2]"}`}>
      {collection.image_url ? <Image src={collection.image_url} alt="" fill sizes="(max-width: 640px) 50vw, 33vw" className="-z-10 object-cover transition group-hover:scale-105" unoptimized /> : null}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-4 pb-4 pt-10 text-sm font-semibold text-white">{collection.name}</span>
    </a>)}
  </div></Frame>;
}

export function AboutSection({ section, onSectionClick: onClick, preview }: { section: StoreSection } & Pick<ThemeRendererProps, "onSectionClick" | "preview">) {
  const body = text(section, "body");
  if (!body && !text(section, "image")) return null;
  return <Frame section={section} preview={preview} onClick={onClick}><div id="about" className={`grid gap-6 py-8 ${text(section, "image") ? "md:grid-cols-2 md:items-center" : ""}`}>
    {text(section, "image") ? <div className="relative aspect-[4/3] overflow-hidden rounded-2xl"><Image src={text(section, "image")} alt="" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" unoptimized /></div> : null}
    <div className="space-y-3"><h2 className="font-[family-name:var(--store-heading-font)] text-xl font-bold sm:text-2xl">{text(section, "heading", "About us")}</h2><RichText html={body} className="leading-7 text-[var(--store-muted)]" /></div>
  </div></Frame>;
}

export function StoreAboutPage({ store, sections, preview, onSectionClick, className }: Pick<ThemeRendererProps, "store" | "sections" | "preview" | "onSectionClick"> & { className: string }) {
  const story = sections.find((section) => section.enabled && section.type === "about");
  const image = story ? text(story, "image") : "";
  const title = story ? text(story, "heading").trim() : "";
  const body = story ? text(story, "body") : "";
  return <main className={className + " py-12 sm:py-16"}>
    <div className="grid items-start gap-8 lg:grid-cols-12 lg:gap-12">
      <div className="min-w-0 space-y-6 lg:col-span-8">
        <h1 className="break-words font-[family-name:var(--store-heading-font)] text-4xl font-semibold tracking-tight sm:text-5xl">{title || "About " + store.name}</h1>
        {body ? <RichText html={body} className="break-words leading-8 text-[var(--store-muted,var(--muted))]" /> : null}
        {sections.filter((section) => section.enabled && section.type === "faq").map((section) => <FaqSection key={section.id} section={section} preview={preview} onSectionClick={onSectionClick} />)}
      </div>
      {image ? <aside className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-surface-secondary lg:sticky lg:top-36 lg:col-span-4">
        <Image src={image} alt="" fill unoptimized sizes="(min-width: 1024px) 33vw, 100vw" className="object-cover" />
      </aside> : null}
    </div>
  </main>;
}

export function FaqSection({ section, onSectionClick: onClick, preview }: { section: StoreSection } & Pick<ThemeRendererProps, "onSectionClick" | "preview">) {
  const raw = section.content.items;
  const items = Array.isArray(raw) ? raw.filter((item): item is { question: string; answer: string } => Boolean(item && typeof item === "object" && "question" in item && "answer" in item)).slice(0, 10) : [];
  if (!items.length) return null;
  return <Frame section={section} preview={preview} onClick={onClick}><div className="space-y-3 py-8"><h2 className="font-[family-name:var(--store-heading-font)] text-xl font-bold">Questions and answers</h2><div className="divide-y divide-border rounded-xl border border-border px-4">{items.map((item, index) => <details key={`${section.id}-${index}`} className="py-4"><summary className="cursor-pointer text-sm font-semibold">{item.question}</summary><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--store-muted)]">{item.answer}</p></details>)}</div></div></Frame>;
}

export function ContactSection({ section, data, onSectionClick: onClick, preview }: { section: StoreSection; data: ThemeRendererProps["store"] } & Pick<ThemeRendererProps, "onSectionClick" | "preview">) {
  const hasContact = data.phone || data.whatsapp_number || data.address || Object.keys(data.business_hours ?? {}).length > 0;
  if (!hasContact) return null;
  return <Frame section={section} preview={preview} onClick={onClick}><div className="space-y-2 border-t border-border py-7"><h2 className="font-[family-name:var(--store-heading-font)] text-lg font-bold">Get in touch</h2>
    {data.phone ? <p className="text-sm">Phone: <a href={`tel:${data.phone}`} className="underline">{data.phone}</a></p> : null}
    {data.whatsapp_number ? <p className="text-sm">WhatsApp: <a href={`https://wa.me/${data.whatsapp_number.replace(/\D/g, "")}`} className="underline">Message us</a></p> : null}
    {data.address ? <p className="text-sm">{data.address}</p> : null}
    {Object.entries(data.business_hours ?? {}).map(([day, hours]) => <p key={day} className="text-sm">{day}: {hours}</p>)}
  </div>{data.whatsapp_number ? <a href={`https://wa.me/${data.whatsapp_number.replace(/\D/g, "")}`} aria-label="Chat with us on WhatsApp" className="fixed bottom-4 right-4 z-20 rounded-full px-4 py-3 text-sm font-semibold text-white shadow-lg" style={{ background: "var(--store-primary)" }}>WhatsApp</a> : null}</Frame>;
}

