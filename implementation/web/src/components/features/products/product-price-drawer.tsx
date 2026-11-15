"use client";

// Change price without opening Edit product.
//
// ChangePriceDrawer — one product. Every variant is a row with its current price and
//   a box for the new one. "Change all by" (10%, ₦500…) fills every box at once; any
//   box can still be typed by hand. Odd prices are fine: rounding is off by default.
// BulkPriceDrawer — several products ticked on the Products list, one rule for all.
//
// Selling and compare-at prices only. Cost follows purchases, so it is left alone.
// Every change is written to the product's price history by the API.

import { toast } from "@heroui/react";
import { ArrowRight, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppSwitch } from "@/components/ui/app-switch";
import { MoneyInput } from "@/components/ui/money-input";
import { Segmented } from "@/components/ui/page";
import { SideSheet } from "@/components/ui/side-sheet";
import { useFinanceAction } from "@/components/features/finance/shared";
import { formatMinorAmount, moneyKeys } from "@/lib/money";
import {
  applyRule,
  EMPTY_RULE,
  gridVariants,
  keptCompareAt,
  productPricePayload,
  ruleReady,
  toMajorUnits,
  toMinorUnits,
  variantPricesPayload,
  type NewPrice,
  type PriceRule,
} from "@/lib/price-change";
import { productsApi } from "@/lib/products";
import { createIdempotencyKey } from "@/lib/utils";
import type { Product, ProductDetail } from "@/types/products";

const PERCENT_PATTERN = /^\d*(\.\d{0,2})?$/;

/* -------------------------------------------------------------------------- */
/* The rule: Increase / Decrease · By % / By amount · value · rounding         */
/* -------------------------------------------------------------------------- */

function RuleFields({ rule, onRule, currency, exponent, apply }: { rule: PriceRule; onRule: (rule: PriceRule) => void; currency: string; exponent: number; apply?: () => void }) {
  const set = <K extends keyof PriceRule>(key: K, value: PriceRule[K]) => onRule({ ...rule, [key]: value });
  const ready = ruleReady(rule, exponent);
  const tooMuch = rule.by === "percent" && rule.direction === "decrease" && (toMinorUnits(rule.value, 2) ?? BigInt(0)) >= BigInt(10000);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Segmented
          size="sm"
          aria-label="Increase or decrease"
          options={[
            { key: "increase", label: "Increase" },
            { key: "decrease", label: "Decrease" },
          ]}
          value={rule.direction}
          onChange={(value) => set("direction", value)}
        />
        <Segmented
          size="sm"
          aria-label="By percentage or amount"
          options={[
            { key: "percent", label: "By %" },
            { key: "amount", label: "By amount" },
          ]}
          value={rule.by}
          onChange={(value) => onRule({ ...rule, by: value, value: "" })}
        />
      </div>
      <div className="flex items-start gap-2">
        {rule.by === "percent" ? (
          <AppInput
            aria-label="Percentage"
            type="number"
            numberPattern={PERCENT_PATTERN}
            placeholder="10"
            value={rule.value}
            onChange={(event) => set("value", event.target.value)}
            endContent={<span className="text-[13px] font-medium text-muted">%</span>}
            containerClassName="flex-1"
            errorMessage={tooMuch ? "A decrease must be under 100%" : undefined}
          />
        ) : (
          <MoneyInput aria-label="Amount" currency={currency} exponent={exponent} placeholder="500" value={rule.value} onValueChange={(value) => set("value", value)} containerClassName="flex-1" />
        )}
        {apply ? <AppButton variant="secondary" label="Apply to all" isDisabled={!ready} onPress={apply} /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-muted">Round to</span>
        <Segmented
          size="sm"
          aria-label="Round to"
          options={[
            { key: "", label: "Exact" },
            { key: "10", label: "10" },
            { key: "50", label: "50" },
            { key: "100", label: "100" },
            { key: "500", label: "500" },
          ]}
          value={rule.round}
          onChange={(value) => set("round", value)}
        />
      </div>
      <p className="text-[12px] text-muted">Exact keeps the price as worked out, odd numbers included. Rounding goes to the nearest step.</p>
    </section>
  );
}

function Change({ from, to, currency, exponent }: { from: bigint; to: bigint | null; currency: string; exponent: number }) {
  if (to === null || to === from) return null;
  const diff = to - from;
  const up = diff > BigInt(0);
  return (
    <span className={`font-semibold ${up ? "text-success" : "text-danger"}`}>
      {up ? "+" : "−"}
      {formatMinorAmount((up ? diff : -diff).toString(), currency, exponent)}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* One product                                                                 */
/* -------------------------------------------------------------------------- */

export function ChangePriceDrawer({ workspaceId, detail, onClose }: { workspaceId: number; detail: ProductDetail; onClose: () => void }) {
  const { product } = detail;
  const exponent = product.currency_exponent;
  const currency = product.currency;
  const money = (minor: bigint | string) => formatMinorAmount(minor.toString(), currency, exponent);
  const variants = useMemo(() => gridVariants(detail), [detail]);
  const hasVariants = variants.length > 0;

  // "base" is the product's own price; variants are keyed by id.
  const originals = useMemo(() => {
    const map: Record<string, bigint> = { base: BigInt(product.selling_price_minor || "0") };
    for (const variant of variants) map[String(variant.id)] = BigInt(variant.selling_price_minor || "0");
    return map;
  }, [product.selling_price_minor, variants]);

  const [prices, setPrices] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(originals).map(([key, minor]) => [key, toMajorUnits(minor, exponent)])));
  const [compareAt, setCompareAt] = useState(() => toMajorUnits(product.compare_at_price_minor, exponent));
  const [rule, setRule] = useState<PriceRule>(EMPTY_RULE);
  const [error, setError] = useState("");

  const minorOf = (key: string) => toMinorUnits(prices[key], exponent);
  const changedKeys = Object.keys(originals).filter((key) => minorOf(key) !== originals[key]);
  const compareChanged = !hasVariants && (toMinorUnits(compareAt, exponent) ?? null) !== (product.compare_at_price_minor ? BigInt(product.compare_at_price_minor) : null);
  const count = changedKeys.length + (compareChanged && !changedKeys.includes("base") ? 1 : 0);

  const applyAll = () => {
    const next: Record<string, string> = {};
    for (const [key, minor] of Object.entries(originals)) next[key] = toMajorUnits(applyRule(minor, rule, exponent), exponent);
    setPrices(next);
    if (!hasVariants) {
      const base = toMinorUnits(next.base, exponent) ?? BigInt(0);
      if (product.compare_at_price_minor && BigInt(product.compare_at_price_minor) <= base) setCompareAt("");
    }
    setError("");
  };

  const save = useFinanceAction(
    workspaceId,
    async (_: null, key: string) => {
      if (hasVariants) {
        const changes: Record<number, NewPrice> = {};
        for (const variant of variants) {
          const next = minorOf(String(variant.id));
          if (next === null || next === originals[String(variant.id)]) continue;
          changes[variant.id] = { selling: toMajorUnits(next, exponent), compareAt: toMajorUnits(keptCompareAt(variant.compare_at_price_minor, next), exponent) };
        }
        if (Object.keys(changes).length) await productsApi.saveOptions(workspaceId, product.id, variantPricesPayload(detail, changes), `${key}:variants`);
        const base = minorOf("base");
        if (base !== null && base !== originals.base) {
          await productsApi.update(workspaceId, product.id, productPricePayload(detail, { selling: toMajorUnits(base, exponent), compareAt: toMajorUnits(keptCompareAt(product.compare_at_price_minor, base), exponent) }));
        }
        return;
      }
      await productsApi.update(workspaceId, product.id, productPricePayload(detail, { selling: prices.base, compareAt }));
    },
    { success: count === 1 ? "Price updated" : "Prices updated", onDone: onClose },
  );

  const submit = () => {
    for (const key of Object.keys(originals)) {
      if (minorOf(key) === null) {
        setError(key === "base" ? "Enter a selling price." : `Enter a price for ${variants.find((variant) => String(variant.id) === key)?.name}.`);
        return;
      }
    }
    if (!hasVariants && compareAt) {
      const compare = toMinorUnits(compareAt, exponent);
      if (compare === null || compare <= (minorOf("base") ?? BigInt(0))) {
        setError("The compare-at price must be above the selling price, or left empty.");
        return;
      }
    }
    setError("");
    save.mutate(null);
  };

  const setPrice = (key: string, value: string) => {
    setPrices({ ...prices, [key]: value });
    setError("");
  };

  return (
    <SideSheet
      isOpen
      onClose={onClose}
      title="Change price"
      description={hasVariants ? `${product.name} · ${variants.length} variants` : product.name}
      footer={
        <>
          <span className="mr-auto text-[13px] text-muted">{count ? `${count} ${count === 1 ? "price" : "prices"} will change` : "No changes yet"}</span>
          <AppButton variant="ghost" label="Cancel" onPress={onClose} />
          <AppButton label="Save prices" isDisabled={!count} isLoading={save.isPending} onPress={submit} />
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <h3 className="mb-3 text-[14px] font-semibold">{hasVariants ? "Change all by" : "Change by"}</h3>
          <RuleFields rule={rule} onRule={setRule} currency={currency} exponent={exponent} apply={applyAll} />
        </div>

        <div className="border-t border-separator pt-5">
          {hasVariants ? (
            <>
              <h3 className="text-[14px] font-semibold">Variants</h3>
              <p className="mt-0.5 text-[12px] text-muted">Type a new price on any row. A was-price that ends up below the new price is removed.</p>
              <ul className="mt-2 divide-y divide-separator">
                {[{ key: "base", name: "Product price", hint: "Used for new variants" }, ...variants.map((variant) => ({ key: String(variant.id), name: variant.name, hint: variant.is_active ? "" : "Off" }))].map((row) => (
                  <li key={row.key} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">
                        {row.name}
                        {row.hint ? <span className="ml-2 text-[12px] font-normal text-muted">{row.hint}</span> : null}
                      </span>
                      <span className="block text-[12px] text-muted tabular">
                        Now {money(originals[row.key])} <Change from={originals[row.key]} to={minorOf(row.key)} currency={currency} exponent={exponent} />
                      </span>
                    </div>
                    <MoneyInput size="sm" aria-label={`New price for ${row.name}`} currency={currency} exponent={exponent} value={prices[row.key] ?? ""} onValueChange={(value) => setPrice(row.key, value)} containerClassName="w-40 shrink-0" />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="space-y-4">
              <MoneyInput
                label="New selling price"
                currency={currency}
                exponent={exponent}
                value={prices.base ?? ""}
                onValueChange={(value) => setPrice("base", value)}
                description={`Now ${money(originals.base)}`}
              />
              <MoneyInput
                label="Compare-at price"
                currency={currency}
                exponent={exponent}
                placeholder="Optional"
                value={compareAt}
                onValueChange={(value) => {
                  setCompareAt(value);
                  setError("");
                }}
                description="Shown crossed out next to the price, e.g. a sale. Must be above the selling price."
              />
            </div>
          )}
        </div>

        {error ? <p className="animate-fade-up text-[13px] font-medium text-danger">{error}</p> : null}
        <p className="text-[12px] text-muted">Cost price is not changed here. It updates on its own when you record a purchase.</p>
      </div>
    </SideSheet>
  );
}

/* -------------------------------------------------------------------------- */
/* Many products                                                               */
/* -------------------------------------------------------------------------- */

type Failure = { name: string; message: string };

export function BulkPriceDrawer({ workspaceId, products, onClose }: { workspaceId: number; products: Product[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rule, setRule] = useState<PriceRule>(EMPTY_RULE);
  const [withVariants, setWithVariants] = useState(true);
  const [progress, setProgress] = useState(0);
  const [failures, setFailures] = useState<Failure[]>([]);
  const first = products[0];
  const currency = first?.currency ?? "NGN";
  const exponent = first?.currency_exponent ?? 2;
  const mixedCurrency = products.some((product) => product.currency !== currency);
  const ready = ruleReady(rule, exponent);
  const variantTotal = withVariants ? products.reduce((total, product) => total + (product.variant_count || 0), 0) : 0;

  const run = useMutation({
    mutationFn: async () => {
      const batch = createIdempotencyKey("prices");
      const failed: Failure[] = [];
      for (const [index, item] of products.entries()) {
        setProgress(index + 1);
        try {
          const detail = await productsApi.get(workspaceId, item.id);
          const exp = detail.product.currency_exponent;
          const variants = gridVariants(detail);
          if (withVariants && variants.length) {
            const changes: Record<number, NewPrice> = {};
            for (const variant of variants) {
              const next = applyRule(BigInt(variant.selling_price_minor || "0"), rule, exp);
              changes[variant.id] = { selling: toMajorUnits(next, exp), compareAt: toMajorUnits(keptCompareAt(variant.compare_at_price_minor, next), exp) };
            }
            await productsApi.saveOptions(workspaceId, item.id, variantPricesPayload(detail, changes), `${batch}:${item.id}:variants`);
          }
          const base = applyRule(BigInt(detail.product.selling_price_minor || "0"), rule, exp);
          await productsApi.update(workspaceId, item.id, productPricePayload(detail, { selling: toMajorUnits(base, exp), compareAt: toMajorUnits(keptCompareAt(detail.product.compare_at_price_minor, base), exp) }));
        } catch (error) {
          failed.push({ name: item.name, message: error instanceof Error ? error.message : "Could not be saved" });
        }
      }
      return failed;
    },
    onSuccess: (failed) => {
      void queryClient.invalidateQueries({ queryKey: moneyKeys.workspace(workspaceId) });
      const done = products.length - failed.length;
      if (!failed.length) {
        toast.success(`Prices updated on ${done} ${done === 1 ? "product" : "products"}`);
        onClose();
        return;
      }
      setFailures(failed);
      setProgress(0);
      if (done) toast.success(`Prices updated on ${done} ${done === 1 ? "product" : "products"}`);
      toast.danger(`${failed.length} could not be changed`);
    },
  });

  const preview = (product: Product) => {
    const from = BigInt(product.selling_price_minor || "0");
    return { from, to: ready ? applyRule(from, rule, product.currency_exponent) : null };
  };

  return (
    <SideSheet
      isOpen
      onClose={() => !run.isPending && onClose()}
      title="Change prices"
      description={`${products.length} ${products.length === 1 ? "product" : "products"} selected`}
      footer={
        <>
          <span className="mr-auto text-[13px] text-muted">{run.isPending ? `Updating ${progress} of ${products.length}…` : ready ? `${products.length} products${variantTotal ? ` and ${variantTotal} variants` : ""} will change` : "Set how prices change"}</span>
          <AppButton variant="ghost" label={failures.length ? "Close" : "Cancel"} isDisabled={run.isPending} onPress={onClose} />
          <AppButton label="Change prices" isDisabled={!ready} isLoading={run.isPending} onPress={() => run.mutate()} />
        </>
      }
    >
      <div className="space-y-6">
        <RuleFields rule={rule} onRule={setRule} currency={currency} exponent={exponent} />
        {mixedCurrency && rule.by === "amount" ? <p className="text-[12px] font-medium text-warning">These products use different currencies. The amount is added in each product’s own currency.</p> : null}

        <div className="border-t border-separator pt-5">
          <AppSwitch isSelected={withVariants} onChange={setWithVariants} label="Change variant prices too" description="Every variant of these products changes by the same rule." />
        </div>

        {failures.length ? (
          <div className="border-t border-separator pt-5">
            <h3 className="flex items-center gap-2 text-[14px] font-semibold text-danger">
              <WarningCircle size={16} aria-hidden="true" />
              Not changed
            </h3>
            <ul className="mt-2 divide-y divide-separator">
              {failures.map((failure) => (
                <li key={failure.name} className="py-2.5">
                  <span className="block text-[14px] font-semibold">{failure.name}</span>
                  <span className="block text-[12px] text-muted">{failure.message}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="border-t border-separator pt-5">
          <h3 className="text-[14px] font-semibold">Preview</h3>
          <ul className="mt-2 divide-y divide-separator">
            {products.map((product) => {
              const { from, to } = preview(product);
              const money = (minor: bigint) => formatMinorAmount(minor.toString(), product.currency, product.currency_exponent);
              const dropsCompare = to !== null && product.compare_at_price_minor && BigInt(product.compare_at_price_minor) <= to;
              return (
                <li key={product.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{product.name}</span>
                    <span className="block text-[12px] text-muted">
                      {withVariants && product.variant_count ? `${product.variant_count} variants change the same way` : product.variant_count ? "Variants keep their prices" : "No variants"}
                      {dropsCompare ? " · was-price removed" : ""}
                    </span>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 text-[13px] tabular">
                    <span className={to !== null && to !== from ? "text-muted line-through" : "font-semibold"}>{money(from)}</span>
                    {to !== null && to !== from ? (
                      <>
                        <ArrowRight size={12} className="text-muted" aria-hidden="true" />
                        <span className="font-semibold">{money(to)}</span>
                      </>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {!failures.length && !run.isPending && run.isSuccess ? (
          <p className="flex items-center gap-2 text-[13px] text-success">
            <CheckCircle size={16} aria-hidden="true" /> Done
          </p>
        ) : null}
        <p className="text-[12px] text-muted">Each change is kept in the product’s price history.</p>
      </div>
    </SideSheet>
  );
}
