import type { PaletteKey, ThemePalette } from "./types";

export const PALETTES: Record<Exclude<PaletteKey, "custom">, ThemePalette> = {
  green: { primary: "#166534", accent: "#047857", background: "#FFFFFF", surface: "#F0FDF4", text: "#17211B", muted: "#46534A" },
  ink: { primary: "#1F2937", accent: "#334155", background: "#FFFFFF", surface: "#F8FAFC", text: "#111827", muted: "#475569" },
  ocean: { primary: "#075985", accent: "#0E7490", background: "#FFFFFF", surface: "#F0F9FF", text: "#10212B", muted: "#465A66" },
  sunset: { primary: "#9A3412", accent: "#C2410C", background: "#FFFFFF", surface: "#FFF7ED", text: "#281710", muted: "#5C453A" },
  rose: { primary: "#9F1239", accent: "#BE123C", background: "#FFFFFF", surface: "#FFF1F2", text: "#2A1119", muted: "#5B4149" },
  earth: { primary: "#5C4033", accent: "#6B5B36", background: "#FFFFFF", surface: "#FAF7F2", text: "#211A16", muted: "#554A42" },
};

const HEX = /^#(?:[\da-f]{3}|[\da-f]{6})$/i;
const expand = (hex: string) => hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
const channels = (hex: string) => {
  const value = expand(hex).slice(1);
  return [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16) / 255);
};
const luminance = (hex: string) => channels(hex).map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a: string, b: string) => {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

function darkenUntilReadable(hex: string, minimum = 4.5) {
  if (contrast(hex, "#FFFFFF") >= minimum) return hex.toUpperCase();
  const original = channels(hex);
  let low = 0;
  let high = 1;
  for (let i = 0; i < 24; i += 1) {
    const blend = (low + high) / 2;
    const candidate = `#${original.map((c) => Math.round(c * (1 - blend) * 255).toString(16).padStart(2, "0")).join("")}`;
    if (contrast(candidate, "#FFFFFF") >= minimum) high = blend;
    else low = blend;
  }
  return `#${original.map((c) => Math.round(c * (1 - high) * 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** Resolves a merchant colour into a palette whose text and primary button meet WCAG AA. */
export function paletteFromColor(hex: string): ThemePalette {
  const normalized = HEX.test(hex) ? expand(hex) : "#166534";
  const primary = darkenUntilReadable(normalized);
  return {
    primary,
    accent: primary,
    background: "#FFFFFF",
    surface: "#F8FAFC",
    text: "#111827",
    muted: "#475569",
  };
}

export function resolvePalette(key: PaletteKey, customColor?: string): ThemePalette {
  return key === "custom" ? paletteFromColor(customColor ?? "#166534") : PALETTES[key];
}

