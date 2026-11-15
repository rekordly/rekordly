// Price changes: one rule ("increase by 10%", "decrease by ₦500") applied to prices,
// and the payloads that save new prices through the existing product endpoints.
// All maths is BigInt minor units; prices typed by people stay decimal strings.

import type { ProductDetail, SaveOptionsPayload, SaveProductPayload } from "@/types/products";

export interface PriceRule {
  direction: "increase" | "decrease";
  by: "amount" | "percent";
  /** Major units for an amount ("500"), a percentage for percent ("10" or "7.5"). */
  value: string;
  /** Round to the nearest step in major units: "" keeps the exact result. */
  round: "" | "10" | "50" | "100" | "500";
}

export const EMPTY_RULE: PriceRule = { direction: "increase", by: "percent", value: "", round: "" };

/** "1,500.5" → 150050 (exponent 2). Anything unreadable is null. */
export function toMinorUnits(value: string | undefined, exponent: number): bigint | null {
  const clean = (value ?? "").replace(/,/g, "").trim();
  if (!clean || clean === "." || !/^\d*\.?\d*$/.test(clean)) return null;
  const [whole = "0", fraction = ""] = clean.split(".");
  if (fraction.length > exponent) return null;
  return BigInt(whole || "0") * BigInt(10) ** BigInt(exponent) + BigInt((fraction + "0".repeat(exponent)).slice(0, exponent) || "0");
}

/** 150050 → "1500.5"; 150000 → "1500". */
export function toMajorUnits(minor: bigint | string | null | undefined, exponent: number): string {
  if (minor === null || minor === undefined || minor === "") return "";
  const amount = BigInt(minor);
  if (exponent === 0) return amount.toString();
  const base = BigInt(10) ** BigInt(exponent);
  const fraction = (amount % base).toString().padStart(exponent, "0").replace(/0+$/, "");
  return fraction ? `${amount / base}.${fraction}` : `${amount / base}`;
}

/** Whether the rule has a usable value. A percentage is 0 to 100. */
export function ruleReady(rule: PriceRule, exponent: number) {
  const parsed = rule.by === "percent" ? toMinorUnits(rule.value, 2) : toMinorUnits(rule.value, exponent);
  return parsed !== null && parsed > BigInt(0) && !(rule.by === "percent" && parsed > BigInt(10000));
}

/** The new price after the rule. Never below zero. */
export function applyRule(minor: bigint, rule: PriceRule, exponent: number): bigint {
  let next = minor;
  if (rule.by === "percent") {
    const hundredths = toMinorUnits(rule.value, 2) ?? BigInt(0); // 7.5% → 750
    const factor = rule.direction === "increase" ? BigInt(10000) + hundredths : BigInt(10000) - hundredths;
    next = (minor * factor + BigInt(5000)) / BigInt(10000); // half up
  } else {
    const amount = toMinorUnits(rule.value, exponent) ?? BigInt(0);
    next = rule.direction === "increase" ? minor + amount : minor - amount;
  }
  const step = rule.round ? toMinorUnits(rule.round, exponent) ?? BigInt(0) : BigInt(0);
  if (step > BigInt(0)) next = ((next + step / BigInt(2)) / step) * step;
  return next < BigInt(0) ? BigInt(0) : next;
}

/** Variants that make up the product's option grid (not the hidden default, not archived). */
export function gridVariants(detail: ProductDetail) {
  return (detail.variants ?? []).filter((variant) => !variant.is_default && !variant.archived_at);
}

export interface NewPrice {
  selling: string;
  /** "" removes the compare-at price. */
  compareAt: string;
}

/** Keeps a compare-at price only while it stays above the new selling price. */
export function keptCompareAt(compareMinor: string | null | undefined, newSellingMinor: bigint) {
  return compareMinor && BigInt(compareMinor) > newSellingMinor ? compareMinor : null;
}

/** The full product payload with only the price fields changed (the edit endpoint expects every field). */
export function productPricePayload(detail: ProductDetail, price: NewPrice): SaveProductPayload {
  const { product } = detail;
  const exponent = product.currency_exponent;
  return {
    name: product.name,
    kind: product.kind,
    unit_name: product.unit_name,
    selling_price: price.selling,
    cost_price: product.cost_price_minor && product.cost_price_minor !== "0" ? toMajorUnits(product.cost_price_minor, exponent) : undefined,
    compare_at_price: price.compareAt || undefined,
    sku: product.sku ?? undefined,
    barcode: product.barcode ?? undefined,
    currency: product.currency,
    outlet_ids: detail.outlet_ids ?? [],
    collection_ids: detail.collection_ids ?? [],
    image_urls: product.image_urls ?? [],
    short_description: product.short_description ?? undefined,
    long_description: product.long_description ?? undefined,
  };
}

/**
 * The full options payload with only variant prices changed. The options endpoint
 * replaces the whole grid, so every variant goes back exactly as it is.
 */
export function variantPricesPayload(detail: ProductDetail, prices: Record<number, NewPrice>): SaveOptionsPayload {
  const exponent = detail.product.currency_exponent;
  const options = [...(detail.options ?? [])].sort((a, b) => a.position - b.position);
  const variants = gridVariants(detail);
  const expected = options.reduce((total, option) => total * (option.value_details ?? []).length, 1);
  if (!options.length || variants.length !== expected) {
    throw new Error("This product's variants are incomplete. Open Edit product and save the variants first.");
  }
  return {
    options: options.map((option) => ({ id: option.id, name: option.name, values: (option.value_details ?? []).map((value) => ({ id: value.id, value: value.value })) })),
    variants: variants.map((variant) => {
      const optionValues = options.map((option) => variant.option_values?.[option.name] ?? "");
      if (optionValues.some((value) => !value)) throw new Error(`${variant.name} is missing an option value. Open Edit product to fix it.`);
      const next = prices[variant.id];
      return {
        id: variant.id,
        option_values: optionValues,
        selling_price: next ? next.selling : toMajorUnits(variant.selling_price_minor, exponent),
        cost_price: variant.cost_price_minor && variant.cost_price_minor !== "0" ? toMajorUnits(variant.cost_price_minor, exponent) : undefined,
        compare_at_price: next ? next.compareAt || undefined : variant.compare_at_price_minor ? toMajorUnits(variant.compare_at_price_minor, exponent) : undefined,
        sku: variant.sku ?? undefined,
        barcode: variant.barcode ?? undefined,
        is_active: variant.is_active,
      };
    }),
  };
}
