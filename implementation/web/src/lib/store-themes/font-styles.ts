import { Inter, Merriweather, Plus_Jakarta_Sans } from "next/font/google";
import type { FontStyleKey } from "./types";

const inter = Inter({ subsets: ["latin"], variable: "--store-font-inter" });
const merriweather = Merriweather({ subsets: ["latin"], weight: ["400", "700"], variable: "--store-font-merriweather" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--store-font-jakarta" });

export const FONT_STYLES: Record<FontStyleKey, { label: string; className: string; headingClassName: string; bodyFamily: string; headingFamily: string }> = {
  modern: { label: "Modern", className: inter.className, headingClassName: inter.className, bodyFamily: inter.style.fontFamily, headingFamily: inter.style.fontFamily },
  classic: { label: "Classic", className: inter.className, headingClassName: merriweather.className, bodyFamily: inter.style.fontFamily, headingFamily: merriweather.style.fontFamily },
  friendly: { label: "Friendly", className: jakarta.className, headingClassName: jakarta.className, bodyFamily: jakarta.style.fontFamily, headingFamily: jakarta.style.fontFamily },
};

