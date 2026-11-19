"use client";

// Essential: the free template. Modelled on a premium shop layout:
// brand-coloured sticky header (logo, centred nav, round search/cart buttons),
// a full-width hero, then categories at the side of a ruled product grid.
// The footer and service cards live in components/features/store/essential-store-footer.tsx.

import { List, MagnifyingGlass, ShoppingBag, X } from "@phosphor-icons/react";
import Image from "next/image";
import { useState, type CSSProperties, type ReactNode } from "react";

import { formatMinorAmount } from "@/lib/money";

import { resolveStoreBrand } from "../brand";
import { readableOn, STORE_SURFACE, STORE_WRAP } from "../layout";
import { AboutSection, AnnouncementSection, FaqSection } from "../sections";
import type { ThemeProduct, ThemeRendererProps } from "../types";

const PAGE_SIZE = 12;

function stockLabel(variants: ThemeProduct[]) {
  if (variants.length > 1) return `${variants.length} options`;
  const state = variants[0]?.availability_state;
  if (state === "out_of_stock") return "Sold out";
  if (state === "request_only") return "On request";
  if (state === "low_stock") return "Low stock";
  return "In stock";
}

function Checkbox({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={onChange} className="flex w-full cursor-pointer items-center gap-3 py-1 text-left text-[14px]">
      <span className="grid size-4 shrink-0 place-items-center rounded-[4px] border transition-colors" style={checked ? { background: "var(--store-primary)", borderColor: "var(--store-primary)" } : { borderColor: "var(--border)" }}>
        {checked ? <span className="size-1.5 rounded-[1px] bg-surface" /> : null}
      </span>
      <span className={checked ? "font-medium" : "text-[var(--store-muted)]"}>{label}</span>
    </button>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 text-[12px] font-semibold tracking-[0.14em] text-[var(--store-muted)] uppercase">{title}</h2>
      {children}
    </div>
  );
}

export function SimpleStoreRenderer(props: ThemeRendererProps) {
  const { store, sections, preview, onSectionClick, cartCount = 0, onCartClick } = props;
  const { palette, heading, body } = resolveStoreBrand(props.brand);
  const onPrimary = readableOn(palette.primary);
  const chip = onPrimary === "#FFFFFF" ? "bg-white/10 hover:bg-white/20" : "bg-black/5 hover:bg-black/10";
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState(props.searchQuery ?? "");
  const [availability, setAvailability] = useState("");
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const page = props.page ?? "shop";
  const base = `/s/${encodeURIComponent(store.slug)}`;
  const hero = sections.find((section) => section.type === "hero");
  const listing = sections.find((section) => section.type === "product_grid");
  const heroImage = String(hero?.content.image || store.banner_url || "");
  const logo = props.brand.logo_url || store.logo_url;
  const hasAbout = sections.some((section) => ["about", "faq"].includes(section.type) && section.enabled);
  const links = [
    { href: `${base}/shop`, label: "Shop" },
    ...(hasAbout ? [{ href: `${base}/about`, label: "About" }] : []),
    { href: `${base}/policies`, label: "Customer care" },
    { href: `${base}/orders`, label: "Track my order" },
  ];

  // Group variants into products, then apply the listing source and filters.
  const grouped = new Map<number, ThemeProduct[]>();
  for (const product of store.products) {
    if (search && !`${product.title} ${product.description || ""}`.toLowerCase().includes(search.toLowerCase())) continue;
    if (category && String(product.collection_id) !== category) continue;
    if (availability === "in_stock" && !["in_stock", "low_stock"].includes(product.availability_state)) continue;
    if (availability === "request_only" && product.availability_state !== "request_only") continue;
    if (listing?.content.source === "featured" && !product.is_featured) continue;
    if (listing?.content.source === "collection" && product.collection_id !== Number(listing.content.collection_id)) continue;
    grouped.set(product.product_id, [...(grouped.get(product.product_id) ?? []), product]);
  }
  const products = [...grouped.values()];
  const catalogue = ["home", "shop", "collection"].includes(page);
  const filtering = Boolean(category || availability || search);
  const reset = () => {
    setCategory("");
    setAvailability("");
    setSearch("");
    setLimit(PAGE_SIZE);
  };

  const style = {
    "--store-primary": palette.primary,
    "--store-accent": palette.accent,
    "--store-surface": STORE_SURFACE,
    "--store-text": "var(--foreground)",
    "--store-muted": "var(--muted)",
    "--store-heading-font": heading.headingFamily,
    color: "#1C211E",
    background: "var(--background)",
    fontFamily: body.bodyFamily,
  } as CSSProperties;
  const headingStyle = { fontFamily: heading.headingFamily };

  const filters = (
    <div className="space-y-8">
      <FilterGroup title="Categories">
        <div className="space-y-1">
          <Checkbox checked={!category} label="All products" onChange={() => { setCategory(""); setLimit(PAGE_SIZE); }} />
          {store.collections.map((item) => (
            <Checkbox key={item.id} checked={category === String(item.id)} label={item.name} onChange={() => { setCategory(category === String(item.id) ? "" : String(item.id)); setLimit(PAGE_SIZE); }} />
          ))}
        </div>
      </FilterGroup>
      <FilterGroup title="Availability">
        <div className="flex flex-wrap gap-2">
          {[["in_stock", "In stock"], ["request_only", "On request"]].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={availability === value}
              onClick={() => setAvailability(availability === value ? "" : value)}
              className="cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px] transition-colors"
              style={availability === value ? { background: "var(--store-primary)", borderColor: "var(--store-primary)", color: onPrimary } : { borderColor: "var(--border)" }}
            >
              {label}
            </button>
          ))}
        </div>
      </FilterGroup>
      <button type="button" onClick={reset} disabled={!filtering} className="h-11 cursor-pointer rounded-md px-5 text-[12px] font-semibold tracking-[0.12em] uppercase transition-opacity disabled:cursor-not-allowed disabled:opacity-40" style={{ background: palette.primary, color: onPrimary }}>
        Reset filters
      </button>
    </div>
  );

  return (
    <div style={style} className={`min-h-full ${body.className}`}>
      {sections.filter((section) => section.enabled && section.type === "announcement").map((section) => <AnnouncementSection key={section.id} section={section} preview={preview} onSectionClick={onSectionClick} />)}

      <header className="sticky top-0 z-30" style={{ background: palette.primary, color: onPrimary }}>
        <div className={`${STORE_WRAP} flex h-16 items-center gap-4 sm:h-[72px]`}>
          <a href={base} className="flex min-w-0 items-center gap-2.5 md:w-60">
            {logo ? <Image src={logo} alt="" width={36} height={36} unoptimized className="size-9 shrink-0 rounded-full object-cover" /> : null}
            <span className="truncate text-[17px] font-semibold tracking-tight" style={headingStyle}>{store.name}</span>
          </a>
          <nav aria-label="Store" className="mx-auto hidden items-center gap-9 text-[12px] font-medium tracking-[0.14em] uppercase md:flex">
            {links.map((link) => <a key={link.href} href={link.href} className="opacity-90 transition-opacity hover:opacity-100">{link.label}</a>)}
          </nav>
          <div className="ml-auto flex items-center justify-end gap-2 md:ml-0 md:w-60">
            <button type="button" aria-label="Search products" onClick={() => setSearchOpen(true)} className={`grid size-10 cursor-pointer place-items-center rounded-full transition-colors ${chip}`}>
              <MagnifyingGlass size={18} aria-hidden="true" />
            </button>
            {props.headerAction ?? (
              onCartClick ? (
              <button type="button" onClick={onCartClick} aria-label={`Cart, ${cartCount} items`} className={`relative grid size-10 place-items-center rounded-full transition-colors ${chip}`}>
                <ShoppingBag size={18} aria-hidden="true" />
                {cartCount ? <span className="absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-surface px-1 text-[10px] font-bold text-foreground">{cartCount > 99 ? "99+" : cartCount}</span> : null}
              </button>
              ) : (
              <a href={`${base}/cart`} aria-label={`Cart, ${cartCount} items`} className={`relative grid size-10 place-items-center rounded-full transition-colors ${chip}`}>
                <ShoppingBag size={18} aria-hidden="true" />
                {cartCount ? <span className="absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-surface px-1 text-[10px] font-bold text-foreground">{cartCount > 99 ? "99+" : cartCount}</span> : null}
              </a>
              )
            )}
            <button type="button" aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen(!menuOpen)} className={`grid size-10 cursor-pointer place-items-center rounded-full transition-colors md:hidden ${chip}`}>
              {menuOpen ? <X size={18} aria-hidden="true" /> : <List size={18} aria-hidden="true" />}
            </button>
          </div>
        </div>
        {menuOpen ? (
          <nav aria-label="Store" className={`${STORE_WRAP} grid gap-1 border-t border-current/15 py-3 text-[13px] font-medium tracking-[0.12em] uppercase md:hidden`}>
            {links.map((link) => <a key={link.href} href={link.href} className="py-2">{link.label}</a>)}
          </nav>
        ) : null}
      </header>

      {catalogue ? (
        <main>
          {hero?.enabled !== false ? (
            <section
              onClick={preview ? () => hero && onSectionClick?.(hero) : undefined}
              className="relative isolate overflow-hidden"
              style={{ background: palette.primary, color: heroImage ? "#FFFFFF" : onPrimary }}
            >
              {heroImage ? (
                <>
                  <Image src={heroImage} alt="" fill priority sizes="100vw" unoptimized className="-z-10 object-cover" />
                  <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/65 via-black/35 to-black/10" />
                </>
              ) : null}
              <div className={`${STORE_WRAP} flex min-h-[280px] flex-col justify-center py-14 sm:min-h-[400px]`}>
                <h1 className="max-w-3xl text-5xl leading-[1.02] font-semibold tracking-[-0.03em] sm:text-7xl" style={headingStyle}>{String(hero?.content.heading || "Shop")}</h1>
                <p className="mt-4 max-w-md text-[15px] leading-7 opacity-85 sm:text-[17px]">{String(hero?.content.subheading || store.tagline || "Explore our collection")}</p>
              </div>
            </section>
          ) : null}

          <div className={`${STORE_WRAP} grid gap-10 py-12 sm:py-16 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14`}>
            <aside className="hidden lg:block">
              <div className="sticky top-28">{filters}</div>
            </aside>

            <section id="products" className="min-w-0">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <p className="text-[13px] text-[var(--store-muted)]">
                  {products.length} {products.length === 1 ? "product" : "products"}
                  {props.collectionSlug ? ` · ${store.collections.find((item) => item.slug === props.collectionSlug)?.name || "Collection"}` : ""}
                </p>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 border-b border-border pb-1.5 focus-within:border-foreground/50">
                    <MagnifyingGlass size={16} className="text-[var(--store-muted)]" aria-hidden="true" />
                    <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setLimit(PAGE_SIZE); }} placeholder="Search" aria-label="Search products" className="w-32 bg-transparent text-[14px] outline-none sm:w-48" />
                  </label>
                  <button type="button" onClick={() => setFiltersOpen(!filtersOpen)} className="h-9 cursor-pointer rounded-full border border-border px-4 text-[12px] font-semibold tracking-[0.1em] uppercase lg:hidden">
                    Filters
                  </button>
                </div>
              </div>
              {filtersOpen ? <div className="mb-6 rounded-2xl border border-border p-5 lg:hidden">{filters}</div> : null}

              {listing?.enabled === false ? (
                <p className="py-16 text-center text-[14px] text-[var(--store-muted)]">Products are coming soon.</p>
              ) : products.length ? (
                <div className="grid grid-cols-2 border-t border-l border-border xl:grid-cols-3">
                  {products.slice(0, limit).map((variants) => {
                    const product = variants[0];
                    const soldOut = variants.every((variant) => variant.availability_state === "out_of_stock");
                    return (
                      <a key={product.product_id} href={`${base}/products/${product.id}`} className="group flex min-w-0 flex-col border-r border-b border-border p-3 sm:p-5">
                        <div className="relative aspect-square overflow-hidden rounded-xl" style={{ background: STORE_SURFACE }}>
                          {product.image_urls[0] ? (
                            <Image src={product.image_urls[0]} alt={product.title} fill sizes="(max-width: 1280px) 50vw, 25vw" unoptimized className="object-cover transition duration-500 group-hover:scale-[1.04]" />
                          ) : (
                            <div className="grid h-full place-items-center"><ShoppingBag size={32} className="text-muted/50" aria-hidden="true" /></div>
                          )}
                          {soldOut ? <span className="absolute top-3 left-3 rounded-full bg-surface/95 px-2.5 py-1 text-[11px] font-semibold">Sold out</span> : null}
                        </div>
                        <h3 className="mt-4 line-clamp-1 text-[15px] font-semibold tracking-tight sm:text-[17px]" style={headingStyle}>{product.title}</h3>
                        <p className="mt-1 text-[14px] font-semibold tabular">{formatMinorAmount(product.price_minor, product.currency, product.currency_exponent)}</p>
                        <p className="mt-0.5 text-[12px] text-[var(--store-muted)]">{stockLabel(variants)}</p>
                      </a>
                    );
                  })}
                </div>
              ) : (
                <div className="py-20 text-center">
                  <p className="text-[14px] text-[var(--store-muted)]">No products match.</p>
                  {filtering ? <button type="button" onClick={reset} className="mt-3 cursor-pointer text-[13px] font-semibold underline underline-offset-4">Reset filters</button> : null}
                </div>
              )}

              {limit < products.length ? (
                <button type="button" onClick={() => setLimit(limit + PAGE_SIZE)} className="mx-auto mt-10 block h-11 cursor-pointer rounded-full border border-border px-8 text-[12px] font-semibold tracking-[0.12em] uppercase transition-colors hover:bg-surface-secondary">
                  Load more
                </button>
              ) : null}
            </section>
          </div>
        </main>
      ) : null}

      {page === "about" ? (
        <main className={`${STORE_WRAP} max-w-3xl py-14 sm:py-20`}>
          <h1 className="mb-8 text-4xl font-semibold tracking-tight sm:text-5xl" style={headingStyle}>About {store.name}</h1>
          {sections
            .filter((section) => section.enabled && ["about", "faq"].includes(section.type))
            .map((section) =>
              section.type === "about" ? <AboutSection key={section.id} section={section} preview={preview} onSectionClick={onSectionClick} /> : <FaqSection key={section.id} section={section} preview={preview} onSectionClick={onSectionClick} />,
            )}
        </main>
      ) : null}

      {searchOpen ? (
        <div role="dialog" aria-modal="true" aria-label="Search the store" className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" onClick={() => setSearchOpen(false)}>
          <div className="bg-surface py-8 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className={STORE_WRAP}>
              <div className="flex items-center gap-3 border-b border-border pb-3">
                <MagnifyingGlass size={22} className="text-[var(--store-muted)]" aria-hidden="true" />
                <input
                  autoFocus
                  type="search"
                  placeholder="What are you looking for?"
                  aria-label="Search products"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Escape") setSearchOpen(false); }}
                  className="min-w-0 flex-1 bg-transparent text-xl outline-none sm:text-2xl"
                />
                <button type="button" onClick={() => setSearchOpen(false)} aria-label="Close search" className="grid size-10 cursor-pointer place-items-center rounded-full hover:bg-surface-secondary">
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
              {search ? (
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {products.slice(0, 4).map(([product]) => (
                    <a key={product.id} href={`${base}/products/${product.id}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-surface-secondary">
                      <span className="relative size-14 shrink-0 overflow-hidden rounded-lg" style={{ background: STORE_SURFACE }}>
                        {product.image_urls[0] ? <Image src={product.image_urls[0]} alt="" fill sizes="56px" unoptimized className="object-cover" /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-medium">{product.title}</span>
                        <span className="block text-[13px] text-[var(--store-muted)] tabular">{formatMinorAmount(product.price_minor, product.currency, product.currency_exponent)}</span>
                      </span>
                    </a>
                  ))}
                  {!products.length ? <p className="text-[14px] text-[var(--store-muted)]">No products match “{search}”.</p> : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default SimpleStoreRenderer;
