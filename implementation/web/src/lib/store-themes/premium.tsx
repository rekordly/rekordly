"use client";

import { ArrowRight, Check, ImageSquare, MagnifyingGlass, ShoppingBag } from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { useId, useState, type CSSProperties, type ReactNode } from "react";

import { SideSheet } from "@/components/ui/side-sheet";
import { formatMinorAmount } from "@/lib/money";
import { resolveStoreBrand } from "./brand";
import { readableOn } from "./layout";
import { AboutSection, AnnouncementSection, FaqSection } from "./sections";
import type { ThemeProduct, ThemeRendererProps, ThemeStoreData } from "./types";

export const premiumWidth = "mx-auto w-full max-w-[1440px] px-4 sm:px-8 lg:px-12";
export const storePath = (store: Pick<ThemeStoreData, "slug" | "path">) => store.path ?? "/s/" + encodeURIComponent(store.slug);
const productPath = (store: ThemeStoreData, id: number) => storePath(store) + "/products/" + id;
const collectionPath = (store: ThemeStoreData, collection: string) => storePath(store) + "/collections/" + encodeURIComponent(collection);
const headingFont = { fontFamily: "var(--store-heading-font)" };

function searchable(product: ThemeProduct, query: string) {
  const text = [product.title, product.variant_name, product.description].join(" ").toLowerCase();
  return query.toLowerCase().trim().split(/\s+/).every((term) => text.includes(term));
}

function productGroups(products: ThemeProduct[]) {
  const groups = new Map<number, ThemeProduct[]>();
  for (const product of products) {
    const group = groups.get(product.product_id);
    if (group) group.push(product);
    else groups.set(product.product_id, [product]);
  }
  return Array.from(groups.values());
}

function SearchBox({ store }: Pick<ThemeRendererProps, "store">) {
  const id = useId();
  const [text, setText] = useState("");
  const [show, setShow] = useState(false);
  const query = text.trim();
  const suggestions = show && query.length >= 2
    ? productGroups(store.products.filter((product) => searchable(product, query))).slice(0, 5)
    : [];
  const base = storePath(store);
  return (
    <form action={base + "/search"} role="search" className="relative min-w-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setShow(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setShow(false);
      }}>
      <div className="flex h-11 items-center rounded-lg border border-current/20 bg-surface text-foreground focus-within:ring-2 focus-within:ring-current/30">
        <input type="search" name="q" aria-label="Search products" aria-controls={suggestions.length ? id : undefined}
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
          placeholder="Search products" maxLength={120} value={text}
          onFocus={() => setShow(true)} onChange={(event) => { setText(event.target.value); setShow(true); }} />
        <button type="submit" aria-label="Search" className="grid h-full w-11 shrink-0 place-items-center"><MagnifyingGlass size={20} /></button>
      </div>
      {suggestions.length ? (
        <ul id={id} className="absolute inset-x-0 top-full z-30 mt-1 grid rounded-lg border border-border bg-surface p-2 text-foreground shadow-lg">
          {suggestions.map(([product]) => (
            <li key={product.id}><Link className="block rounded px-3 py-2.5 text-sm hover:bg-surface-secondary focus:bg-surface-secondary"
              href={productPath(store, product.id)}>{product.title}</Link></li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}

export function PremiumShell({ model, family, children }: { model: ThemeRendererProps; family: "studio" | "market"; children?: ReactNode }) {
  const { store, brand, sections, cartCount = 0, onCartClick, headerAction } = model;
  const { palette, heading, body } = resolveStoreBrand(brand);
  const studio = family === "studio";
  const base = storePath(store);
  const logo = brand.logo_url || store.logo_url;
  const style = {
    "--store-primary": palette.primary, "--store-accent": palette.accent, "--store-heading-font": heading.headingFamily,
    "--premium-button-text": readableOn(palette.primary), "--premium-surface": "var(--surface-secondary)", "--store-muted": "var(--muted)",
    fontFamily: body.bodyFamily, color: "var(--foreground)",
  } as CSSProperties;
  const cartLabel = "Cart (" + cartCount + ")";
  const cartContent = <><ShoppingBag size={21} /><span>{cartLabel}</span></>;
  return (
    <div className="contents" style={style}>
      {sections.filter((section) => section.enabled && section.type === "announcement").map((section) => <AnnouncementSection key={section.id} section={section} />)}
      <header className={studio ? "sticky top-0 z-30 border-b border-border bg-[#fcfaf6] dark:bg-surface" : "sticky top-0 z-30"} style={studio ? undefined : { background: palette.primary, color: readableOn(palette.primary) }}>
        <div className={premiumWidth + (studio ? " grid grid-cols-[1fr_auto] items-center gap-4 py-5 sm:grid-cols-[1fr_1fr_auto]" : " grid grid-cols-[1fr_auto] items-center gap-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,3fr)_auto]")}>
          <Link href={base} className="flex min-w-0 items-center gap-2 text-xl font-semibold" style={headingFont}>
            {logo ? <Image src={logo} alt="" width={40} height={40} unoptimized className="size-10 shrink-0 object-contain" /> : null}
            <span className="truncate">{store.name}</span>
          </Link>
          <div className={studio ? "col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1" : "col-span-2 row-start-2 md:col-span-1 md:col-start-2 md:row-start-1"}>
            <SearchBox store={store} />
          </div>
          {headerAction ?? (onCartClick
            ? <button type="button" onClick={onCartClick} className="flex items-center gap-2 justify-self-end rounded-lg border border-current/25 px-3 py-2 text-sm transition-colors hover:bg-current/10">{cartContent}</button>
            : <Link href={base + "/cart"} className="flex items-center gap-2 justify-self-end rounded-lg border border-current/25 px-3 py-2 text-sm">{cartContent}</Link>)}
        </div>
      </header>
      <nav aria-label="Store navigation" className="border-b border-border bg-surface">
        <div className={premiumWidth + (studio ? " flex flex-wrap justify-center gap-x-6 gap-y-2 py-3 text-sm" : " flex flex-wrap gap-x-5 gap-y-2 py-3 text-sm")}>
          <Link href={base + "/shop"} className="font-semibold hover:underline">Shop all</Link>
          {store.collections.filter((collection) => collection.slug).slice(0, studio ? 4 : 7).map((collection) => (
            <Link key={collection.id} href={collectionPath(store, collection.slug!)} className="hover:underline">{collection.name}</Link>
          ))}
          {!store.path ? <Link href={base + "/orders"} className="hover:underline">Track my order</Link> : null}
          {sections.some((section) => section.type === "about" && section.enabled) ? <Link href={base + "/about"} className="hover:underline">About</Link> : null}
        </div>
      </nav>
      {children}
    </div>
  );
}

export function PremiumMedia({ src, alt, className = "" }: { src?: string | null; alt: string; className?: string }) {
  return <div className={"relative overflow-hidden bg-[var(--premium-surface)] " + className}>
    {src ? <Image src={src} alt={alt} fill unoptimized sizes="(max-width: 640px) 100vw, 50vw" className="object-cover" /> : (
      <div className="grid h-full place-items-center text-muted/55"><ImageSquare size={32} aria-hidden="true" /></div>
    )}
  </div>;
}

function listingVariant(variants: ThemeProduct[]) {
  return variants.find((item) => item.availability_state !== "out_of_stock") ?? variants[0];
}

export function PremiumCartButton({ quantity = 0, onAdd, onView, compact = false }: { quantity?: number; onAdd: () => void; onView: () => void; compact?: boolean }) {
  const inCart = quantity > 0;
  return <button type="button" onClick={inCart ? onView : onAdd} aria-label={inCart ? "View cart, " + quantity + " of this item" : undefined} className={["flex w-full items-center justify-center gap-2 rounded-lg border border-border font-semibold", compact ? "mt-3 min-h-10 px-2 py-2 text-xs" : "min-h-12 px-4 py-3 text-sm", inCart ? "bg-[var(--premium-surface,var(--surface-secondary))] text-foreground hover:underline" : "bg-[var(--store-primary,#16453b)] text-[var(--premium-button-text,#fff)] hover:opacity-90"].join(" ")}>
    {inCart ? <><Check size={16} aria-hidden="true" /> In cart <span className="rounded-full bg-current/10 px-1.5 tabular-nums">{quantity}</span></> : <><ShoppingBag size={16} aria-hidden="true" /> Add to cart</>}
  </button>;
}

export function PremiumGrid({ store, products, compact, onQuickAdd, cartQuantities, onCartClick }: Pick<ThemeRendererProps, "store" | "onQuickAdd" | "cartQuantities" | "onCartClick"> & { products: ThemeProduct[][]; compact: boolean }) {
  return (
    <ul className={compact ? "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" : "grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-7 lg:grid-cols-3"}>
      {products.map((variants) => {
        const product = listingVariant(variants);
        const quantity = variants.reduce((count, item) => count + (cartQuantities?.[item.id] ?? 0), 0);
        const canQuickAdd = compact && variants.length === 1 && product.availability_state !== "out_of_stock" && product.availability_state !== "request_only" && !product.contact_only && onQuickAdd;
        return (
          <li key={product.product_id} className={compact ? "min-w-0 rounded-xl border border-border bg-surface p-2.5 sm:p-3" : "min-w-0"}>
            <Link href={productPath(store, product.id)} className="group block">
              <PremiumMedia src={product.image_urls[0]} alt={product.title} className={compact ? "aspect-square rounded-lg" : "aspect-[4/5]"} />
              <h3 className="mt-3 break-words text-sm font-semibold group-hover:underline sm:text-base">{product.title}</h3>
              <p className="mt-1 text-sm">{formatMinorAmount(product.price_minor, product.currency, product.currency_exponent)}</p>
            </Link>
            {quantity > 0 && !canQuickAdd ? <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-[var(--premium-surface)] px-2 py-1 text-xs font-medium"><Check size={14} aria-hidden="true" /> In cart ({quantity})</p> : null}
            {product.availability_state === "out_of_stock" ? <p className="mt-1 text-xs text-[var(--store-muted)]">Sold out</p>
              : variants.length > 1 ? <p className="mt-1 text-xs text-[var(--store-muted)]">{variants.length} options</p>
              : canQuickAdd ? <PremiumCartButton compact quantity={onCartClick ? quantity : undefined} onAdd={() => canQuickAdd(product.id)} onView={onCartClick ?? (() => canQuickAdd(product.id))} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function PremiumCatalogue({ model, compact }: { model: ThemeRendererProps; compact: boolean }) {
  const { store, page, collectionSlug, searchQuery = "", onQuickAdd, cartQuantities, onCartClick } = model;
  const [availability, setAvailability] = useState(false);
  const [searchCollection, setSearchCollection] = useState("");
  const [sort, setSort] = useState("featured");
  const [limit, setLimit] = useState(24);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const collection = store.collections.find((item) => item.slug === (page === "search" ? searchCollection : collectionSlug));
  const groups = productGroups(store.products.filter((item) => !collection || item.collection_id === collection.id))
    .filter((variants) => page !== "search" || variants.some((item) => searchable(item, searchQuery)))
    .filter((variants) => !availability || variants.some((item) => item.availability_state === "in_stock" || item.availability_state === "low_stock"));
  if (sort === "featured") groups.sort((a, b) => Number(b.some((item) => item.is_featured)) - Number(a.some((item) => item.is_featured)));
  if (sort === "title") groups.sort((a, b) => listingVariant(a).title.localeCompare(listingVariant(b).title));
  if (sort === "price-low" || sort === "price-high") {
    groups.sort((a, b) => {
      const left = BigInt(listingVariant(a).price_minor);
      const right = BigInt(listingVariant(b).price_minor);
      const ascending = left === right ? 0 : left < right ? -1 : 1;
      return sort === "price-low" ? ascending : -ascending;
    });
  }
  const filters = (
    <div className="grid gap-5 text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={availability} onChange={(event) => { setAvailability(event.target.checked); setLimit(24); }} /> In stock only
      </label>
      {page === "search" ? <label className="grid gap-2">
        Collection
        <select value={searchCollection} onChange={(event) => { setSearchCollection(event.target.value); setLimit(24); }} className="w-full rounded-md border border-border bg-surface px-2 py-2">
          <option value="">All collections</option>
          {store.collections.filter((item) => item.slug).map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
        </select>
      </label> : <nav aria-label="Collections" className="grid gap-2">
        <Link href={storePath(store) + "/shop"} className="font-semibold hover:underline">All products</Link>
        {store.collections.filter((item) => item.slug).map((item) => <Link key={item.id} href={collectionPath(store, item.slug!)} className="hover:underline" aria-current={item.id === collection?.id ? "page" : undefined}>{item.name}</Link>)}
      </nav>}
    </div>
  );
  return (
    <main className={premiumWidth + " py-10 sm:py-14"}>
      <h1 className={compact ? "mb-7 text-3xl font-semibold" : "mb-10 text-4xl font-semibold sm:text-6xl"} style={headingFont}>
        {page === "search" ? (searchQuery ? "Results for “" + searchQuery + "”" : "Search products") : collection?.name || "Shop"}
      </h1>
      <div className={compact ? "grid gap-7 lg:grid-cols-[11rem_minmax(0,1fr)]" : "grid gap-7"}>
        {compact ? <aside className="hidden border-r border-border pr-5 lg:block">{filters}</aside> : null}
        <div className="min-w-0">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <p className="mr-auto text-sm text-[var(--store-muted)]" role="status">{groups.length} {groups.length === 1 ? "product" : "products"}</p>
            <button type="button" className={compact ? "rounded-md border border-border px-3 py-2 text-sm lg:hidden" : "rounded-md border border-border px-3 py-2 text-sm"} onClick={() => setFiltersOpen(true)}>Filters</button>
            <select aria-label="Sort products" className="max-w-full rounded-md border border-border bg-surface px-2 py-2 text-sm"
              value={sort} onChange={(event) => { setSort(event.target.value); setLimit(24); }}>
              <option value="featured">Featured</option><option value="title">Name A–Z</option>
              <option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option>
            </select>
          </div>
          {groups.length ? <PremiumGrid store={store} products={groups.slice(0, limit)} compact={compact} onQuickAdd={onQuickAdd} cartQuantities={cartQuantities} onCartClick={onCartClick} />
            : <div className="rounded-lg border border-border p-7 text-sm">No products found. <Link className="underline" href={storePath(store) + "/shop"}>Browse all products</Link></div>}
          {groups.length > limit ? <button type="button" onClick={() => setLimit(limit + 24)} className="mx-auto mt-8 block rounded-md border border-border px-5 py-2.5 text-sm">Load more</button> : null}
        </div>
      </div>
      <SideSheet title="Filters" isOpen={filtersOpen} onClose={() => setFiltersOpen(false)}>{filters}</SideSheet>
    </main>
  );
}

export function PremiumAbout({ model }: { model: ThemeRendererProps }) {
  return <main className="mx-auto max-w-3xl px-4 py-14 sm:px-8">
    <h1 className="text-4xl font-semibold" style={headingFont}>About {model.store.name}</h1>
    {model.sections.filter((section) => section.enabled).map((section) => {
      if (section.type === "about") return <AboutSection key={section.id} section={section} />;
      if (section.type === "faq") return <FaqSection key={section.id} section={section} />;
      return null;
    })}
  </main>;
}

export function PremiumFeatured({ model, compact }: { model: ThemeRendererProps; compact: boolean }) {
  const section = model.sections.find((item) => item.type === "product_grid");
  if (section?.enabled === false) return null;
  const { store } = model;
  const source = section?.content.source;
  const products = productGroups(store.products).filter((variants) => {
    if (source === "featured") return variants.some((product) => product.is_featured);
    if (source === "collection") return variants.some((product) => product.collection_id === Number(section?.content.collection_id));
    return true;
  }).slice(0, compact ? 8 : 6);
  if (!products.length) return null;
  const title = typeof section?.content.title === "string" && section.content.title.trim() ? section.content.title : "Featured products";
  return <section className={premiumWidth + " py-9 sm:py-14"}>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-2xl font-semibold sm:text-4xl" style={headingFont}>{title}</h2>
      <Link className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline" href={storePath(store) + "/shop"}>Shop all <ArrowRight size={16} /></Link>
    </div>
    <PremiumGrid store={store} products={products} compact={compact} onQuickAdd={model.onQuickAdd} cartQuantities={model.cartQuantities} onCartClick={model.onCartClick} />
  </section>;
}

export function PremiumCollections({ model, compact }: { model: ThemeRendererProps; compact: boolean }) {
  const section = model.sections.find((item) => item.type === "collections");
  if (section?.enabled === false) return null;
  const selected = Array.isArray(section?.content.collection_ids) ? section.content.collection_ids.map(String) : [];
  const collections = model.store.collections.filter((item) => item.slug && (!selected.length || selected.includes(String(item.id)))).slice(0, compact ? 8 : 4);
  if (!collections.length) return null;
  return <section className={premiumWidth + " py-9 sm:py-12"}>
    <h2 className="mb-5 text-2xl font-semibold sm:text-3xl" style={headingFont}>Shop by collection</h2>
    <ul className={compact ? "grid grid-cols-2 gap-3 sm:grid-cols-4" : "grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-7"}>
      {collections.map((item) => <li key={item.id}><Link href={collectionPath(model.store, item.slug!)} className="group block">
        <PremiumMedia src={item.image_url} alt="" className={compact ? "aspect-[3/2] rounded-lg" : "aspect-square"} />
        <span className="mt-2 block text-sm font-semibold group-hover:underline">{item.name}</span>
      </Link></li>)}
    </ul>
  </section>;
}
