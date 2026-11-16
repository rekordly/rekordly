import { AnnouncementSection, AboutSection, CollectionsSection, ContactSection, FaqSection, HeroSection, ProductGridSection } from "./sections";
import type { ThemeRendererProps } from "./types";
import type { ComponentType, CSSProperties } from "react";
import Image from "next/image";
import { FONT_STYLES } from "./font-styles";

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
  return <div className={`min-h-full ${font.className} ${font.headingClassName}`} style={{ "--store-primary": palette?.primary, "--store-accent": palette?.accent, "--store-background": palette?.background, "--store-surface": palette?.surface, "--store-text": palette?.text, "--store-muted": palette?.muted, "--store-heading-font": font.headingFamily, background: "var(--store-background)", color: "var(--store-text)", fontFamily: font.bodyFamily } as CSSProperties}>
    <header className="border-b border-black/10 bg-[var(--store-surface)]">
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
  return <div className={`min-h-full ${font.className} ${font.headingClassName}`} style={{ "--store-primary": palette?.primary, "--store-accent": palette?.accent, "--store-background": palette?.background, "--store-surface": palette?.surface, "--store-text": palette?.text, "--store-muted": palette?.muted, "--store-heading-font": font.headingFamily, background: "var(--store-background)", color: "var(--store-text)", fontFamily: font.bodyFamily } as CSSProperties}>
    <header className="border-b border-black/10 bg-[var(--store-surface)]">
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

export const themeRenderers: Record<"simple" | "boutique", ComponentType<ThemeRendererProps>> = {
  simple: SimpleStoreRenderer,
  boutique: BoutiqueStoreRenderer,
};

