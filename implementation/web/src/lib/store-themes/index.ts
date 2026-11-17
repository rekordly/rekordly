import { boutiqueTheme } from "./boutique/manifest";
import { boldTheme, marketTheme, studioTheme } from "./paid-manifests";
import { simpleTheme } from "./simple/manifest";
import { PALETTES, paletteFromColor, resolvePalette } from "./palettes";
import { FONT_STYLES } from "./font-styles";
import type { ThemeKey, ThemeManifest, StoreSection, ThemeSettings } from "./types";

export const STORE_THEMES: Record<ThemeKey, ThemeManifest> = {
  simple: simpleTheme,
  boutique: boutiqueTheme,
  bold: boldTheme,
  market: marketTheme,
  studio: studioTheme,
};

export { PALETTES, FONT_STYLES, paletteFromColor, resolvePalette };
export * from "./types";

export function createDefaultSections(theme: ThemeKey, storeName: string): StoreSection[] {
  const safeName = storeName.trim() || "our store";
  const keys = STORE_THEMES[theme].defaultSections;
  const content: Record<string, Record<string, unknown>> = {
    hero: { heading: theme === "simple" ? "Shop" : `Welcome to ${safeName}`, subheading: "Explore our collection", button_label: "Shop now" },
    product_grid: { title: "Shop our products", source: "new", limit: 12 },
    collections: { collection_ids: [] },
    about: { heading: `About ${safeName}`, body: "Tell shoppers a little about your business." },
    faq: { items: [] },
    contact: {},
    announcement: { text: "Welcome to our store", link: "" },
  };
  return keys.map((type, index) => ({ id: `${type}-${index + 1}`, type, enabled: true, content: { ...content[type] } }));
}

/** Theme changes retain every section and its content; unsupported sections stay stored but are hidden. */
export function switchTheme(settings: ThemeSettings, theme: ThemeKey): ThemeSettings {
  return { ...settings, theme_key: theme };
}

export function sectionsForTheme(settings: ThemeSettings): StoreSection[] {
  const supported = new Set(Object.keys(STORE_THEMES[settings.theme_key].sections));
  return settings.sections.filter((section) => supported.has(section.type));
}

