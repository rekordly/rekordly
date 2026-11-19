import { SECTION_MANIFEST } from "./sections";
import { BoldStoreRenderer } from "./section-renderers";
import { MarketStoreRenderer } from "./market/renderer";
import { StudioStoreRenderer } from "./studio/renderer";
import type { ThemeManifest } from "./types";

export const boldTheme: ThemeManifest = {
  key: "bold",
  name: "Bold",
  description: "A high-contrast storefront with confident product cards for electronics and gear.",
  bestFor: ["Electronics", "Gadgets", "Equipment"],
  price: "billing_catalog",
  palettes: ["green", "ink", "ocean", "sunset", "rose", "earth", "custom"],
  fontStyles: ["modern", "classic", "friendly"],
  sections: { announcement: SECTION_MANIFEST.announcement, hero: SECTION_MANIFEST.hero, product_grid: SECTION_MANIFEST.product_grid, collections: SECTION_MANIFEST.collections, about: SECTION_MANIFEST.about, faq: SECTION_MANIFEST.faq, contact: SECTION_MANIFEST.contact },
  defaultSections: ["hero", "product_grid", "collections", "about", "contact"],
  Renderer: BoldStoreRenderer,
};

export const marketTheme: ThemeManifest = {
  key: "market",
  name: "Market",
  description: "A category-first shop for groceries, home goods and stores with broad catalogues.",
  bestFor: ["Grocery", "Home", "Many categories"],
  price: "billing_catalog",
  palettes: ["green", "ink", "ocean", "sunset", "rose", "earth", "custom"],
  fontStyles: ["modern", "classic", "friendly"],
  sections: { announcement: SECTION_MANIFEST.announcement, hero: SECTION_MANIFEST.hero, product_grid: SECTION_MANIFEST.product_grid, collections: SECTION_MANIFEST.collections, about: SECTION_MANIFEST.about, faq: SECTION_MANIFEST.faq, contact: SECTION_MANIFEST.contact },
  defaultSections: ["announcement", "hero", "collections", "product_grid", "about", "contact"],
  Renderer: MarketStoreRenderer,
};

export const studioTheme: ThemeManifest = {
  key: "studio",
  name: "Studio",
  description: "A refined, image-led presentation for beauty, handmade products and creative studios.",
  bestFor: ["Beauty", "Handmade", "Creative studios"],
  price: "billing_catalog",
  palettes: ["green", "ink", "ocean", "sunset", "rose", "earth", "custom"],
  fontStyles: ["modern", "classic", "friendly"],
  sections: { announcement: SECTION_MANIFEST.announcement, hero: { ...SECTION_MANIFEST.hero, max_slides: 3 }, product_grid: SECTION_MANIFEST.product_grid, collections: SECTION_MANIFEST.collections, about: SECTION_MANIFEST.about, faq: SECTION_MANIFEST.faq, contact: SECTION_MANIFEST.contact },
  defaultSections: ["hero", "collections", "product_grid", "about", "contact"],
  Renderer: StudioStoreRenderer,
};
