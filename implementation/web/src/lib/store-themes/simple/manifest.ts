import { SECTION_MANIFEST } from "../sections";
import type { ThemeManifest } from "../types";
import SimpleStoreRenderer from "./renderer";

export const simpleTheme: ThemeManifest = {
  key: "simple",
  name: "Simple",
  description: "A clear storefront with a compact header and easy to browse products.",
  bestFor: ["Any shop", "Everyday products"],
  price: "free",
  palettes: ["green", "ink", "ocean", "sunset", "rose", "earth", "custom"],
  fontStyles: ["modern", "classic", "friendly"],
  sections: {
    announcement: SECTION_MANIFEST.announcement,
    hero: SECTION_MANIFEST.hero,
    product_grid: SECTION_MANIFEST.product_grid,
    collections: SECTION_MANIFEST.collections,
    about: SECTION_MANIFEST.about,
    faq: SECTION_MANIFEST.faq,
    contact: SECTION_MANIFEST.contact,
  },
  defaultSections: ["hero", "product_grid", "about", "contact"],
  Renderer: SimpleStoreRenderer,
};

export default simpleTheme;

