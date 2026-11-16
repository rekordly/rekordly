// Price changes: one rule ("increase by 10%", "decrease by ₦500") applied to prices,
// and the payloads that save new prices through the existing product endpoints.
// All maths is BigInt minor units; prices typed by people stay decimal strings.

import type { ProductDetail } from "@/types/products";

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
