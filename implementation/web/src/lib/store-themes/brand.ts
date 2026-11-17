import { FONT_STYLES } from "./font-styles";
import { resolvePalette } from "./palettes";
import type { BrandSettings, ThemePalette } from "./types";

export function resolveStoreBrand(brand: BrandSettings & { resolved_palette?: ThemePalette }) {
  const base = brand.resolved_palette ?? resolvePalette(brand.palette, brand.custom_color);
  return {
    palette: { ...base, primary: brand.colors?.[0] || base.primary, accent: brand.colors?.[1] || base.accent },
    heading: FONT_STYLES[brand.heading_font ?? brand.font_style],
    body: FONT_STYLES[brand.body_font ?? brand.font_style],
  };
}
