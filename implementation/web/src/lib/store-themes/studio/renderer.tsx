import Link from "next/link";
import { ArrowUpRight } from "@phosphor-icons/react";
import { AboutSection } from "../sections";
import { PremiumAbout, PremiumCatalogue, PremiumCollections, PremiumFeatured, PremiumMedia, PremiumShell, premiumWidth, storePath } from "../premium";
import type { ThemeRendererProps } from "../types";

export function StudioStoreRenderer(model: ThemeRendererProps) {
  const { store, sections, page = "home" } = model;
  const hero = sections.find((section) => section.type === "hero");
  const story = sections.find((section) => section.enabled && section.type === "about");
  const image = typeof hero?.content.image === "string" && hero.content.image ? hero.content.image : store.banner_url;
  const title = typeof hero?.content.heading === "string" && hero.content.heading.trim() ? hero.content.heading : store.name;
  const description = typeof hero?.content.subheading === "string" && hero.content.subheading.trim() ? hero.content.subheading : store.tagline;
  const cta = typeof hero?.content.button_label === "string" && hero.content.button_label.trim() ? hero.content.button_label : "Explore the shop";
  return (
    <PremiumShell model={model} family="studio">
      {page === "home" ? (
        <main>
          <h1 className={hero?.enabled === false ? "sr-only" : "hidden"}>{store.name}</h1>
          {hero?.enabled !== false ? <section className={premiumWidth + " grid gap-0 pt-6 md:grid-cols-[0.9fr_1.1fr] md:pt-10"}>
            <div className="flex flex-col items-start justify-center bg-[var(--premium-surface)] p-7 sm:p-12 lg:p-16">
              <h1 className="break-words text-5xl leading-[0.98] font-medium tracking-tight lg:text-7xl" style={{ fontFamily: "var(--store-heading-font)" }}>{title}</h1>
              {description ? <p className="mt-6 max-w-md break-words text-sm leading-relaxed sm:text-base">{description}</p> : null}
              <Link className="mt-8 inline-flex items-center gap-2 border-b border-current pb-1 text-sm font-semibold" href={storePath(store) + "/shop"}>{cta} <ArrowUpRight size={16} /></Link>
            </div>
            {image ? <PremiumMedia src={image} alt="" className="aspect-[4/3] min-h-full md:aspect-auto md:min-h-[28rem]" /> : null}
          </section> : null}
          <PremiumCollections model={model} compact={false} />
          <PremiumFeatured model={model} compact={false} />
          {story ? <div className={premiumWidth + " py-8"}><AboutSection section={story} /></div> : null}
        </main>
      ) : null}
      {page === "shop" || page === "collection" || page === "search" ? <PremiumCatalogue model={model} compact={false} /> : null}
      {page === "about" ? <PremiumAbout model={model} /> : null}
    </PremiumShell>
  );
}
