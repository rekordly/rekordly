import Image from "next/image";
import type { ReactNode } from "react";

import { formatMinorAmount } from "@/lib/money";
import type { StoreSection, ThemeRendererProps, ThemeSectionManifest } from "./types";

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

export function HeroSection({ section, boutique, onSectionClick: onClick, preview }: { section: StoreSection; boutique?: boolean } & Pick<ThemeRendererProps, "onSectionClick" | "preview">) {
  const heading = text(section, "heading");
  const image = text(section, "image");
  return <Frame section={section} preview={preview} onClick={onClick}>
    <div className={`relative isolate overflow-hidden bg-[var(--store-surface)] ${boutique ? "min-h-[360px] sm:min-h-[470px]" : "min-h-[240px] sm:min-h-[320px]"}`}>
      {image ? <Image src={image} alt="" fill sizes="100vw" className="-z-10 object-cover" unoptimized /> : null}
      <div className={`flex min-h-[inherit] flex-col justify-center gap-3 px-6 py-12 ${image ? "bg-black/35 text-white" : ""} ${boutique ? "items-center text-center" : "items-start"}`}>
        {heading ? <h1 className="max-w-3xl font-[family-name:var(--store-heading-font)] text-3xl font-bold tracking-tight sm:text-5xl">{heading}</h1> : null}
        {text(section, "subheading") ? <p className="max-w-2xl text-base opacity-90 sm:text-lg">{text(section, "subheading")}</p> : null}
        {text(section, "button_label") ? <a href="#products" className="mt-2 inline-flex rounded-full px-5 py-3 text-sm font-semibold text-white" style={{ background: "var(--store-primary)" }}>{text(section, "button_label")}</a> : null}
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
      {productGroups.map((variants) => { const product = variants[0]; return <div key={product.product_id}>{renderProduct?.(product, variants) ?? <a href={`/s/${data.slug}/products/${product.product_id}`} className="block overflow-hidden rounded-xl border border-black/10 bg-[var(--store-surface)]">
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
  return <Frame section={section} preview={preview} onClick={onClick}><div className="grid gap-6 py-8 md:grid-cols-2 md:items-center">
    {text(section, "image") ? <div className="relative aspect-[4/3] overflow-hidden rounded-2xl"><Image src={text(section, "image")} alt="" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" unoptimized /></div> : null}
    <div className="space-y-3"><h2 className="font-[family-name:var(--store-heading-font)] text-xl font-bold sm:text-2xl">{text(section, "heading", "About us")}</h2><p className="whitespace-pre-wrap text-sm leading-7 text-[var(--store-muted)]">{body}</p></div>
  </div></Frame>;
}

export function FaqSection({ section, onSectionClick: onClick, preview }: { section: StoreSection } & Pick<ThemeRendererProps, "onSectionClick" | "preview">) {
  const raw = section.content.items;
  const items = Array.isArray(raw) ? raw.filter((item): item is { question: string; answer: string } => Boolean(item && typeof item === "object" && "question" in item && "answer" in item)).slice(0, 10) : [];
  if (!items.length) return null;
  return <Frame section={section} preview={preview} onClick={onClick}><div className="space-y-3 py-8"><h2 className="font-[family-name:var(--store-heading-font)] text-xl font-bold">Questions and answers</h2><div className="divide-y divide-black/10 rounded-xl border border-black/10 px-4">{items.map((item, index) => <details key={`${section.id}-${index}`} className="py-4"><summary className="cursor-pointer text-sm font-semibold">{item.question}</summary><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--store-muted)]">{item.answer}</p></details>)}</div></div></Frame>;
}

export function ContactSection({ section, data, onSectionClick: onClick, preview }: { section: StoreSection; data: ThemeRendererProps["store"] } & Pick<ThemeRendererProps, "onSectionClick" | "preview">) {
  const hasContact = data.phone || data.whatsapp_number || data.address || Object.keys(data.business_hours ?? {}).length > 0;
  if (!hasContact) return null;
  return <Frame section={section} preview={preview} onClick={onClick}><div className="space-y-2 border-t border-black/10 py-7"><h2 className="font-[family-name:var(--store-heading-font)] text-lg font-bold">Get in touch</h2>
    {data.phone ? <p className="text-sm">Phone: <a href={`tel:${data.phone}`} className="underline">{data.phone}</a></p> : null}
    {data.whatsapp_number ? <p className="text-sm">WhatsApp: <a href={`https://wa.me/${data.whatsapp_number.replace(/\D/g, "")}`} className="underline">Message us</a></p> : null}
    {data.address ? <p className="text-sm">{data.address}</p> : null}
    {Object.entries(data.business_hours ?? {}).map(([day, hours]) => <p key={day} className="text-sm">{day}: {hours}</p>)}
  </div>{data.whatsapp_number ? <a href={`https://wa.me/${data.whatsapp_number.replace(/\D/g, "")}`} aria-label="Chat with us on WhatsApp" className="fixed bottom-4 right-4 z-20 rounded-full px-4 py-3 text-sm font-semibold text-white shadow-lg" style={{ background: "var(--store-primary)" }}>WhatsApp</a> : null}</Frame>;
}

