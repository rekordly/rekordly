import { SECTION_MANIFEST } from "../sections";
import type { ThemeManifest } from "../types";
import BoutiqueStoreRenderer from "./renderer";

export const boutiqueTheme: ThemeManifest = {
  key: "boutique",
  name: "Boutique",
  description: "An image-led layout for fashion, beauty and lifestyle shops.",
  bestFor: ["Fashion", "Beauty", "Lifestyle"],
  price: "free",
  palettes: ["green", "ink", "ocean", "sunset", "rose", "earth", "custom"],
  fontStyles: ["modern", "classic", "friendly"],
  sections: {
    announcement: SECTION_MANIFEST.announcement,
    hero: { ...SECTION_MANIFEST.hero, max_slides: 3 },
    product_grid: SECTION_MANIFEST.product_grid,
    collections: SECTION_MANIFEST.collections,
    about: SECTION_MANIFEST.about,
    faq: SECTION_MANIFEST.faq,
    contact: SECTION_MANIFEST.contact,
  },
  defaultSections: ["hero", "collections", "product_grid", "about", "contact"],
  Renderer: BoutiqueStoreRenderer,
};

export default boutiqueTheme;

