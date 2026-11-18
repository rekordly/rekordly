import { Cormorant_Garamond, DM_Sans, DM_Serif_Display, Inter, Lora, Manrope, Merriweather, Outfit, Playfair_Display, Plus_Jakarta_Sans, Poppins, Space_Grotesk } from "next/font/google";
import type { BrandFontKey } from "./types";

// Brand fonts a store can pick for headings and body text.
// Keep the keys in sync with storefrontBrandFonts in api/internal/finance/storefront_brand.go.
// Only the original three preload; the rest download when a store or the font picker uses them.

const inter = Inter({ subsets: ["latin"], variable: "--store-font-inter" });
const merriweather = Merriweather({ subsets: ["latin"], weight: ["400", "700"], variable: "--store-font-merriweather" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--store-font-jakarta" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], preload: false });
const dmSans = DM_Sans({ subsets: ["latin"], preload: false });
const manrope = Manrope({ subsets: ["latin"], preload: false });
const outfit = Outfit({ subsets: ["latin"], preload: false });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], preload: false });
const playfair = Playfair_Display({ subsets: ["latin"], preload: false });
const lora = Lora({ subsets: ["latin"], preload: false });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], preload: false });
const dmSerif = DM_Serif_Display({ subsets: ["latin"], weight: ["400"], preload: false });

type FontStyle = { label: string; group: "Sans serif" | "Serif"; className: string; headingClassName: string; bodyFamily: string; headingFamily: string };
const single = (label: string, group: FontStyle["group"], font: { className: string; style: { fontFamily: string } }): FontStyle => ({
  label,
  group,
  className: font.className,
  headingClassName: font.className,
  bodyFamily: font.style.fontFamily,
  headingFamily: font.style.fontFamily,
});

export const FONT_STYLES: Record<BrandFontKey, FontStyle> = {
  modern: single("Inter", "Sans serif", inter),
  classic: single("Merriweather", "Serif", merriweather),
  friendly: single("Plus Jakarta Sans", "Sans serif", jakarta),
  poppins: single("Poppins", "Sans serif", poppins),
  dm_sans: single("DM Sans", "Sans serif", dmSans),
  manrope: single("Manrope", "Sans serif", manrope),
  outfit: single("Outfit", "Sans serif", outfit),
  space_grotesk: single("Space Grotesk", "Sans serif", spaceGrotesk),
  playfair: single("Playfair Display", "Serif", playfair),
  lora: single("Lora", "Serif", lora),
  cormorant: single("Cormorant Garamond", "Serif", cormorant),
  dm_serif: single("DM Serif Display", "Serif", dmSerif),
};

export const BRAND_FONT_KEYS = Object.keys(FONT_STYLES) as BrandFontKey[];

export function isBrandFont(value: unknown): value is BrandFontKey {
  return typeof value === "string" && value in FONT_STYLES;
}
