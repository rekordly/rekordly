"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { MagnifyingGlass, X, ShoppingBag, List } from "@phosphor-icons/react";
import { formatMinorAmount } from "@/lib/money";
import { resolveStoreBrand } from "../brand";
import { AboutSection, FaqSection, AnnouncementSection } from "../sections";
import type { ThemeRendererProps } from "../types";

export function SimpleStoreRenderer(props: ThemeRendererProps) {
  const { store, sections, preview, onSectionClick } = props;
  const { palette, heading, body } = resolveStoreBrand(props.brand);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState("");
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState(12);
  const page = props.page ?? "shop";
  const base = `/s/${encodeURIComponent(store.slug)}`;
  const hero = sections.find((section) => section.type === "hero");
  const listing = sections.find((section) => section.type === "product_grid");
  const heroImage = String(hero?.content.image || store.banner_url || "");
  const grouped = new Map<number, typeof store.products>();
  for (const product of store.products) {
    if (search && !`${product.title} ${product.description || ""}`.toLowerCase().includes(search.toLowerCase())) continue;
    if (category && String(product.collection_id) !== category) continue;
    if (availability && (availability === "in_stock" ? !["in_stock", "low_stock"].includes(product.availability_state) : product.availability_state !== "request_only")) continue;
    if (listing?.content.source === "featured" && !product.is_featured) continue;
    if (listing?.content.source === "collection" && product.collection_id !== Number(listing.content.collection_id)) continue;
    grouped.set(product.product_id, [...(grouped.get(product.product_id) ?? []), product]);
  }
  const products = [...grouped.values()];
  const catalogue = ["home", "shop", "collection"].includes(page);
  const logo = props.brand.logo_url || store.logo_url;
  const style = { "--store-primary": palette.primary, "--store-accent": palette.accent, "--store-background": "#fff", "--store-surface": "#f5f4f0", "--store-text": "#252a27", "--store-muted": "#71766f", "--store-heading-font": heading.headingFamily, color: "#252a27", background: "#fff", fontFamily: body.bodyFamily } as CSSProperties;
  const filters = <>
    <h2 className="mb-5 text-lg font-medium">Categories</h2>
    <div className="grid gap-3 text-sm"><button type="button" onClick={() => { setCategory(""); setLimit(12); }} className={`text-left ${!category ? "font-semibold" : "text-[#747970]"}`}>All products</button>{store.collections.map((item) => <button key={item.id} type="button" onClick={() => { setCategory(String(item.id)); setLimit(12); }} className={`text-left ${category === String(item.id) ? "font-semibold" : "text-[#747970]"}`}>{item.name}</button>)}</div>
    <h2 className="mb-4 mt-9 text-lg font-medium">Availability</h2><div className="grid gap-3 text-sm text-[#747970]">{[["in_stock", "In stock"], ["request_only", "Available on request"]].map(([value, label]) => <label key={value} className="flex items-center gap-2"><input type="checkbox" checked={availability === value} onChange={(event) => setAvailability(event.target.checked ? value : "")} />{label}</label>)}</div>
    <button type="button" onClick={() => { setCategory(""); setAvailability(""); setSearch(""); setLimit(12); }} className="mt-7 border-b border-current pb-1 text-xs uppercase tracking-wider">Reset filters</button>
  </>;

  return <div style={style} className={`min-h-full ${heading.className} ${body.className}`}>
    {sections.filter((section) => section.enabled && section.type === "announcement").map((section) => <AnnouncementSection key={section.id} section={section} preview={preview} onSectionClick={onSectionClick} />)}
    <header className="border-b border-black/10" style={{ borderTop: "3px solid var(--store-accent)" }}>
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-6 sm:px-10">
        <a href={base} className="flex min-w-0 items-center gap-3 text-xl font-semibold tracking-tight">{logo ? <Image src={logo} alt="" width={40} height={40} unoptimized className="size-10 rounded-full object-cover" /> : null}<span className="truncate">{store.name}</span></a>
        <nav aria-label="Store navigation" className="hidden gap-8 text-sm md:flex"><a href={`${base}/shop`}>Shop</a>{sections.some((section) => section.type === "about" && section.enabled) ? <a href={`${base}/about`}>About</a> : null}<a href={`${base}/policies`}>Customer care</a></nav>
        <div className="flex items-center gap-4"><button type="button" aria-label="Search products" onClick={() => setSearchOpen(true)}><MagnifyingGlass size={22} /></button>{props.headerAction ?? <a href={`${base}/cart`} aria-label="Shopping cart"><ShoppingBag size={22} /></a>}<button type="button" className="md:hidden" aria-label="Open menu" onClick={() => setMenuOpen(!menuOpen)}><List size={22} /></button></div>
      </div>
      {menuOpen ? <nav className="flex gap-6 border-t border-black/10 px-5 py-4 text-sm md:hidden"><a href={`${base}/shop`}>Shop</a><a href={`${base}/about`}>About</a><a href={`${base}/policies`}>Customer care</a></nav> : null}
    </header>
    {catalogue ? <main>
      {hero?.enabled !== false ? <section onClick={preview ? () => hero && onSectionClick?.(hero) : undefined} className="relative isolate flex min-h-[260px] items-center overflow-hidden bg-[#eeede6] sm:min-h-[350px]">
        {heroImage ? <><Image src={heroImage} alt="Store banner" fill priority sizes="100vw" unoptimized className="-z-10 object-cover" /><div className="absolute inset-0 -z-10 bg-black/30" /></> : null}
        <div className={`mx-auto w-full max-w-[1440px] px-5 py-16 sm:px-10 ${heroImage ? "text-white" : ""}`}><p className="text-xs uppercase tracking-[.18em]">{store.name}</p><h1 style={{ fontFamily: heading.headingFamily }} className="mt-3 text-5xl font-medium tracking-tight sm:text-7xl">{String(hero?.content.heading || "Shop")}</h1><p className="mt-5 max-w-lg text-sm leading-6 sm:text-base">{String(hero?.content.subheading || store.tagline || "Explore our collection")}</p></div>
      </section> : null}
      <div className="mx-auto grid max-w-[1440px] gap-10 px-5 py-12 sm:px-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-16">
        <aside className="hidden lg:block">{filters}</aside>
        <section id="products" className="min-w-0">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-4"><p className="text-sm text-[#747970]">{products.length} products{props.collectionSlug ? ` · ${store.collections.find((item) => item.slug === props.collectionSlug)?.name || "Collection"}` : ""}</p><label className="flex items-center gap-2 border-b border-black/20 pb-2"><MagnifyingGlass size={18} /><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setLimit(12); }} placeholder="Search products" aria-label="Search catalogue" className="w-40 bg-transparent text-sm outline-none sm:w-56" /></label></div>
          <details className="mb-6 rounded-lg border border-black/10 p-4 lg:hidden"><summary className="cursor-pointer text-sm">Filter products</summary><div className="pt-5">{filters}</div></details>
          {listing?.enabled === false ? <p className="py-10 text-sm text-[#747970]">Our collection is being updated. Please contact the store for products.</p> : products.length ? <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{products.slice(0, limit).map((variants) => { const product = variants[0]; return <article key={product.product_id} className="group min-w-0 overflow-hidden rounded-2xl border border-black/10 bg-white"><a href={`${base}/products/${product.id}`}>
            <div className="relative aspect-[4/3] overflow-hidden bg-[#f4f6f4]">{product.image_urls[0] ? <Image src={product.image_urls[0]} alt={product.title} fill sizes="(max-width:640px) 50vw, 20vw" unoptimized className="object-cover transition duration-300 group-hover:scale-[1.03]" /> : <div className="grid h-full place-items-center"><ShoppingBag size={36} className="text-[#b9bcb5]" /></div>}</div>
            <div className="space-y-1 p-3"><h2 className="line-clamp-2 text-sm font-medium">{product.title}</h2><p className="text-sm text-[#71766f]">{formatMinorAmount(product.price_minor, product.currency, product.currency_exponent)}</p><p className="text-xs text-[#71766f]">{variants.length > 1 ? variants.length + ' options' : product.availability_state === 'request_only' ? 'Available on request' : product.availability_state === 'out_of_stock' ? 'Out of stock' : 'In stock'}</p></div>
          </a></article>; })}</div> : <div className="py-20 text-center text-sm text-[#747970]">No products match these filters.</div>}
          {limit < products.length ? <button type="button" onClick={() => setLimit(limit + 12)} className="mx-auto mt-12 block rounded-full border border-black/20 px-9 py-3 text-sm">Load more</button> : null}
        </section>
      </div>
    </main> : null}
    {page === "about" ? <main className="mx-auto max-w-5xl px-5 py-12"><h1 className="mb-7 text-4xl" style={{ fontFamily: heading.headingFamily }}>About {store.name}</h1>{sections.filter((section) => section.enabled && ["about", "faq"].includes(section.type)).map((section) => section.type === "about" ? <AboutSection key={section.id} section={section} preview={preview} onSectionClick={onSectionClick} /> : <FaqSection key={section.id} section={section} preview={preview} onSectionClick={onSectionClick} />)}</main> : null}
    {searchOpen ? <div role="dialog" aria-modal="true" aria-label="Search the store" className="fixed inset-0 z-50 bg-black/40" onClick={() => setSearchOpen(false)}><div className="bg-white px-6 py-8 shadow-lg" onClick={(event) => event.stopPropagation()}><div className="mx-auto max-w-4xl"><div className="flex items-center justify-between"><h2 className="text-xl">Search</h2><button type="button" onClick={() => setSearchOpen(false)} aria-label="Close search"><X size={22} /></button></div><input autoFocus type="search" placeholder="What are you looking for?" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setSearchOpen(false); }} className="mt-5 w-full border-b border-black/20 py-4 text-xl outline-none" /><div className="mt-5 grid gap-4 sm:grid-cols-3">{products.slice(0, 3).map(([product]) => <a key={product.id} href={`${base}/products/${product.id}`} className="text-sm">{product.title}<span className="mt-1 block text-[#747970]">{formatMinorAmount(product.price_minor, product.currency, product.currency_exponent)}</span></a>)}</div></div></div></div> : null}
  </div>;
}

export default SimpleStoreRenderer;
