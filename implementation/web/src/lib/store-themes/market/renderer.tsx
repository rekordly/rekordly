import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import { PremiumAbout, PremiumCatalogue, PremiumCollections, PremiumFeatured, PremiumMedia, PremiumShell, premiumWidth, storePath } from "../premium";
import { resolveStoreBrand } from "../brand";
import { readableOn } from "../layout";
import type { ThemeRendererProps } from "../types";

export function MarketStoreRenderer(model: ThemeRendererProps) {
  const { store, sections, page = "home" } = model;
  const hero = sections.find((section) => section.type === "hero" && section.enabled);
  const banner = typeof hero?.content.image === "string" && hero.content.image ? hero.content.image : store.banner_url;
  const title = typeof hero?.content.heading === "string" && hero.content.heading.trim() ? hero.content.heading : store.name;
  const description = typeof hero?.content.subheading === "string" ? hero.content.subheading : store.tagline;
  const cta = typeof hero?.content.button_label === "string" && hero.content.button_label.trim() ? hero.content.button_label : "Browse products";
  const { palette } = resolveStoreBrand(model.brand);
  return (
    <PremiumShell model={model} family="market">
      {page === "home" ? (
        <main>
          <PremiumCollections model={model} compact />
          {hero ? <div className={premiumWidth + " pt-4"}>
            <section className="grid overflow-hidden rounded-2xl md:grid-cols-2" style={{ background: palette.primary, color: readableOn(palette.primary) }}>
              <div className="flex flex-col items-start justify-center p-7 sm:p-10">
                <h1 className="break-words text-3xl font-bold sm:text-5xl" style={{ fontFamily: "var(--store-heading-font)" }}>{title}</h1>
                {description ? <p className="mt-3 break-words text-sm sm:text-base">{description}</p> : null}
                <Link className="mt-5 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-[#242824]" href={storePath(store) + "/shop"}>{cta} <ArrowRight size={16} /></Link>
              </div>
              {banner ? <PremiumMedia src={banner} alt="" className="min-h-44 md:min-h-64" /> : null}
            </section>
          </div> : <h1 className="sr-only">{store.name}</h1>}
          <PremiumFeatured model={model} compact />
        </main>
      ) : null}
      {page === "shop" || page === "collection" || page === "search" ? <PremiumCatalogue model={model} compact /> : null}
      {page === "about" ? <PremiumAbout model={model} /> : null}
    </PremiumShell>
  );
}
