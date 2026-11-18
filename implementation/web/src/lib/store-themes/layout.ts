// Shared layout for store templates, so header, hero, catalogue, product page,
// cart and footer all line up on the same width.

/** The content column every template section sits in. */
export const STORE_WRAP = "mx-auto w-full max-w-[1320px] px-5 sm:px-8";

/** Light grey used behind product images and service cards. */
export const STORE_SURFACE = "#F3F3F1";

/** Black or white text, whichever reads better on the given background colour. */
export function readableOn(background: string): "#17211B" | "#FFFFFF" {
  const hex = background.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((digit) => digit + digit).join("") : hex.padEnd(6, "0");
  const channel = (offset: number) => {
    const value = parseInt(full.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = channel(0) * 0.2126 + channel(2) * 0.7152 + channel(4) * 0.0722;
  return luminance > 0.179 ? "#17211B" : "#FFFFFF";
}
