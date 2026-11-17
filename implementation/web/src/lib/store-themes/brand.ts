import { FONT_STYLES } from "./font-styles";
import { resolvePalette } from "./palettes";
import type { BrandSettings, FontStyleKey, ThemePalette } from "./types";

function isFontStyle(value: unknown): value is FontStyleKey {
  return value === "modern" || value === "classic" || value === "friendly";
}

export function resolveStoreBrand(brand?: Partial<BrandSettings> & { resolved_palette?: ThemePalette } | null) {
  const base = brand?.resolved_palette ?? resolvePalette(brand?.palette ?? "green", brand?.custom_color) ?? resolvePalette("green");
  // Stored JSON can contain empty strings or keys from older font settings.
  const legacyFont = isFontStyle(brand?.font_style) ? brand.font_style : "modern";
  const headingFont = isFontStyle(brand?.heading_font) ? brand.heading_font : legacyFont;
  const bodyFont = isFontStyle(brand?.body_font) ? brand.body_font : legacyFont;
  return {
    palette: { ...base, primary: brand?.colors?.[0] || base.primary, accent: brand?.colors?.[1] || base.accent },
    heading: FONT_STYLES[headingFont],
    body: FONT_STYLES[bodyFont],
  };
}
