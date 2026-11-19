import { AnnouncementSection, AboutSection, CollectionsSection, ContactSection, FaqSection, HeroSection, ProductGridSection } from "./sections";
import type { ThemeKey, ThemeRendererProps } from "./types";
import type { ComponentType, CSSProperties } from "react";
import Image from "next/image";
import { FONT_STYLES } from "./font-styles";
import { MarketStoreRenderer } from "./market/renderer";
import { StudioStoreRenderer } from "./studio/renderer";

function OrderedSections({ store, sections, renderProduct, productTools, preview, onSectionClick, boutique }: ThemeRendererProps & { boutique: boolean }) {
  const firstProductsID = sections.find((section) => section.enabled && section.type === "product_grid")?.id;
  return <>
    {sections.filter((section) => section.enabled).map((section) => {
      const common = { section, preview, onSectionClick };
      switch (section.type) {
        case "announcement": return <AnnouncementSection key={section.id} {...common} />;
        case "hero": return <HeroSection key={section.id} {...common} boutique={boutique} />;
        case "product_grid": return <ProductGridSection key={section.id} {...common} data={store} renderProduct={renderProduct} productTools={section.id === firstProductsID ? productTools : undefined} boutique={boutique} />;
        case "collections": return <CollectionsSection key={section.id} {...common} data={store} boutique={boutique} />;
        case "about": return <AboutSection key={section.id} {...common} />;
        case "faq": return <FaqSection key={section.id} {...common} />;
        case "contact": return <ContactSection key={section.id} {...common} data={store} />;
        default: return null;
      }
    })}
  </>;
}

export function SimpleStoreRenderer(props: ThemeRendererProps) {
  const palette = props.brand.resolved_palette;
  const font = FONT_STYLES[props.brand.font_style];
  return <div className={`min-h-full ${font.className} ${font.headingClassName}`} style={{ "--store-primary": palette?.primary, "--store-accent": palette?.accent, "--store-background": "var(--background)", "--store-surface": "var(--surface-secondary)", "--store-text": "var(--foreground)", "--store-muted": "var(--muted)", "--store-heading-font": font.headingFamily, background: "var(--store-background)", color: "var(--store-text)", fontFamily: font.bodyFamily } as CSSProperties}>
    <header className="border-b border-border bg-[var(--store-surface)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <a href={`/s/${props.store.slug}`} className="flex min-w-0 items-center gap-2 font-bold">
          {props.brand.logo_url || props.store.logo_url ? <Image src={props.brand.logo_url ?? props.store.logo_url ?? ""} alt="" width={36} height={36} unoptimized className="size-9 rounded-lg object-cover" /> : null}
          <span className="truncate">{props.store.name}</span>
        </a>
        {props.headerAction ?? <a href={`/s/${props.store.slug}/cart`} className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold text-white" style={{ background: "var(--store-primary)" }}>Cart</a>}
      </div>
    </header>
    <main className="mx-auto w-full max-w-6xl space-y-1 px-4 sm:px-6">
      <OrderedSections {...props} boutique={false} />
    </main>
  </div>;
}

export function BoutiqueStoreRenderer(props: ThemeRendererProps) {
  const palette = props.brand.resolved_palette;
  const font = FONT_STYLES[props.brand.font_style];
  return <div className={`min-h-full ${font.className} ${font.headingClassName}`} style={{ "--store-primary": palette?.primary, "--store-accent": palette?.accent, "--store-background": "var(--background)", "--store-surface": "var(--surface-secondary)", "--store-text": "var(--foreground)", "--store-muted": "var(--muted)", "--store-heading-font": font.headingFamily, background: "var(--store-background)", color: "var(--store-text)", fontFamily: font.bodyFamily } as CSSProperties}>
    <header className="border-b border-border bg-[var(--store-surface)]">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-2 px-4 py-5">
        {props.brand.logo_url || props.store.logo_url ? <Image src={props.brand.logo_url ?? props.store.logo_url ?? ""} alt="" width={48} height={48} unoptimized className="size-12 rounded-full object-cover" /> : null}
        <a href={`/s/${props.store.slug}`} className="max-w-full truncate text-center text-lg font-bold tracking-wide">{props.store.name}</a>
        {props.headerAction ?? <a href={`/s/${props.store.slug}/cart`} className="text-xs font-semibold underline decoration-[var(--store-primary)] decoration-2 underline-offset-4">View cart</a>}
      </div>
    </header>
    <main className="mx-auto w-full max-w-7xl space-y-1 px-4 sm:px-6">
      <OrderedSections {...props} boutique />
    </main>
  </div>;
}

function EditorialThemeRenderer(props: ThemeRendererProps & { variant: "bold" | "market" | "studio" }) {
  const { variant } = props;
  const palette = props.brand.resolved_palette;
  const font = FONT_STYLES[props.brand.font_style];
  const dark = variant === "bold";
  const width = variant === "studio" ? "max-w-5xl" : "max-w-7xl";
  const label = variant === "bold" ? "GEAR · TECH · EVERYDAY" : variant === "market" ? "FRESH FINDS FOR EVERY DAY" : "A CURATED COLLECTION";
  return <div className={`min-h-full ${font.className} ${font.headingClassName}`} style={{ "--store-primary": palette?.primary, "--store-accent": palette?.accent, "--store-background": dark ? "#101318" : variant === "market" ? "#fbf8f0" : "#ffffff", "--store-surface": dark ? "#1b2028" : variant === "market" ? "#ffffff" : "#f7f7f5", "--store-text": dark ? "#f7f8fa" : "#17211b", "--store-muted": dark ? "#b7c0cc" : "#65716a", "--store-heading-font": font.headingFamily, background: "var(--store-background)", color: "var(--store-text)", fontFamily: font.bodyFamily } as CSSProperties}>
    {variant === "bold" ? <div className="bg-[var(--store-primary)] px-4 py-2 text-center text-xs font-bold uppercase tracking-[0.2em] text-white">{label}</div> : variant === "market" ? <div className="bg-[var(--store-primary)] px-4 py-2 text-center text-xs font-semibold tracking-wide text-white">{label}</div> : null}
    <header className={`border-b ${dark ? "border-white/10 bg-[#15191f]" : "border-border bg-[var(--store-surface)]"}`}>
      <div className={`mx-auto flex ${width} items-center justify-between gap-4 px-4 py-5 sm:px-6`}>
        {variant === "studio" ? <div className="flex-1" /> : null}
        <a href={`/s/${props.store.slug}`} className={`flex min-w-0 items-center gap-3 ${variant === "studio" ? "justify-center text-center" : ""}`}>
          {props.brand.logo_url || props.store.logo_url ? <Image src={props.brand.logo_url ?? props.store.logo_url ?? ""} alt="" width={variant === "studio" ? 42 : 36} height={variant === "studio" ? 42 : 36} unoptimized className={`${variant === "studio" ? "rounded-full" : "rounded-lg"} size-9 shrink-0 object-cover`} /> : null}
          <span className={`truncate font-bold ${variant === "studio" ? "text-xl tracking-wide" : "text-lg"}`}>{props.store.name}</span>
        </a>
        <div className={`flex flex-1 ${variant === "studio" ? "justify-end" : "justify-end"}`}>
          {props.headerAction ?? <a href={`/s/${props.store.slug}/cart`} className={`rounded-full px-4 py-2 text-sm font-semibold ${dark ? "border border-white/20 text-white" : variant === "studio" ? "border border-black/15" : "bg-[var(--store-primary)] text-white"}`}>{variant === "studio" ? "Cart" : "View cart"}</a>}
        </div>
      </div>
      {variant === "market" && props.store.collections.length ? <nav className="mx-auto flex max-w-7xl gap-5 overflow-x-auto px-4 pb-3 text-xs font-medium text-[var(--store-muted)] sm:px-6">{props.store.collections.slice(0, 8).map((collection) => <a key={collection.id} href={`?collection=${collection.id}`} className="whitespace-nowrap">{collection.name}</a>)}</nav> : null}
    </header>
    <main className={`mx-auto w-full ${width} space-y-1 px-4 sm:px-6`}>
      {variant === "studio" ? <div className="py-5 text-center text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--store-muted)]">{label}</div> : null}
      <OrderedSections {...props} boutique={variant === "studio"} />
    </main>
  </div>;
}

export function BoldStoreRenderer(props: ThemeRendererProps) { return <EditorialThemeRenderer {...props} variant="bold" />; }

export const themeRenderers: Record<ThemeKey, ComponentType<ThemeRendererProps>> = {
  simple: SimpleStoreRenderer,
  boutique: BoutiqueStoreRenderer,
  bold: BoldStoreRenderer,
  market: MarketStoreRenderer,
  studio: StudioStoreRenderer,
};

