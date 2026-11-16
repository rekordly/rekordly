"use client";

// Change price without opening Edit product.
//
// ChangePriceDrawer — one product. "Change all by" is one line: [+/−] value [% / ₦] Apply.
//   Each variant is a row with its price and an Edit button; Edit opens a small input
//   under the row with Save. Prices stay exact — odd numbers are fine.
// BulkPriceDrawer — several products ticked on the Products list, one rule for all.
//
// Selling and compare-at prices only. Cost follows purchases, so it is left alone.

import { toast } from "@heroui/react";
import { ArrowRight, Minus, PencilSimple, Plus, WarningCircle, X } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppSwitch } from "@/components/ui/app-switch";
import { MoneyInput } from "@/components/ui/money-input";
import { SideSheet } from "@/components/ui/side-sheet";
import { useFinanceAction } from "@/components/features/finance/shared";
import { formatMinorAmount, moneyInputPattern, moneyKeys } from "@/lib/money";
import {
  applyRule,
  EMPTY_RULE,
  gridVariants,
  keptCompareAt,
  ruleReady,
  toMajorUnits,
  toMinorUnits,
  type NewPrice,
  type PriceRule,
} from "@/lib/price-change";
import { productsApi } from "@/lib/products";
import { createIdempotencyKey } from "@/lib/utils";
import type { Product, ProductDetail } from "@/types/products";

const PERCENT_PATTERN = /^\d*(\.\d{0,2})?$/;

/* -------------------------------------------------------------------------- */
/* The rule, on one line: [+/−] value [% / NGN]  Apply                          */
/* -------------------------------------------------------------------------- */

function RuleField({ rule, onRule, currency, exponent, apply }: { rule: PriceRule; onRule: (rule: PriceRule) => void; currency: string; exponent: number; apply?: () => void }) {
  const up = rule.direction === "increase";
  const percent = rule.by === "percent";
  const over = percent && (toMinorUnits(rule.value, 2) ?? BigInt(0)) > BigInt(10000);
  const toggle = "grid h-7 min-w-7 cursor-pointer place-items-center rounded-full bg-surface-secondary px-2 text-[12px] font-semibold text-foreground transition-colors hover:bg-default";
  return (
    <div className="flex items-start gap-2">
      <AppInput
        aria-label={up ? "Increase by" : "Decrease by"}
        type="number"
        numberPattern={percent ? PERCENT_PATTERN : moneyInputPattern(exponent)}
        placeholder={percent ? "10" : "500"}
        value={rule.value}
        onChange={(event) => onRule({ ...rule, value: event.target.value })}
        containerClassName="min-w-0 flex-1"
        errorMessage={over ? "Enter 0 to 100%" : undefined}
        startContent={
          <button type="button" aria-label={up ? "Switch to decrease" : "Switch to increase"} onClick={() => onRule({ ...rule, direction: up ? "decrease" : "increase" })} className={`${toggle} -ml-1.5 ${up ? "text-success" : "text-danger"}`}>
            {up ? <Plus size={13} weight="bold" aria-hidden="true" /> : <Minus size={13} weight="bold" aria-hidden="true" />}
          </button>
        }
        endContent={
          <button type="button" aria-label={percent ? "Switch to amount" : "Switch to percentage"} onClick={() => onRule({ ...rule, by: percent ? "amount" : "percent", value: "" })} className={`${toggle} -mr-1.5`}>
            {percent ? "%" : currency}
          </button>
        }
      />
      {apply ? <AppButton variant="secondary" label="Apply" isDisabled={!ruleReady(rule, exponent)} onPress={apply} /> : null}
    </div>
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
/* A price row: name and price with Edit; Edit shows an input and Save          */
/* -------------------------------------------------------------------------- */

function PriceRow({
  name,
  tag,
  original,
  value,
  currency,
  exponent,
  isEditing,
  optional,
  onEdit,
  onCancel,
  onSave,
}: {
  name: string;
  tag?: string;
  original: bigint | null;
  value: string;
  currency: string;
  exponent: number;
  isEditing: boolean;
  optional?: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");
  const current = toMinorUnits(value, exponent);
  const money = (minor: bigint) => formatMinorAmount(minor.toString(), currency, exponent);
  const changed = current !== original;
  const save = () => {
    if (!draft && optional) return onSave("");
    if (toMinorUnits(draft, exponent) === null) return setError("Enter a price");
    onSave(draft);
  };
  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">
            {name}
            {tag ? <span className="ml-2 text-[12px] font-normal text-muted">{tag}</span> : null}
          </span>
          {changed && original !== null ? (
            <span className="block text-[12px] tabular text-muted">
              <span className="line-through">{money(original)}</span> <Change from={original} to={current} currency={currency} exponent={exponent} />
            </span>
          ) : null}
        </div>
        <span className={`shrink-0 whitespace-nowrap text-[14px] tabular ${current === null ? "text-muted" : "font-semibold"}`}>{current === null ? "None" : money(current)}</span>
        {!isEditing ? (
          <button
            type="button"
            aria-label={`Edit ${name}`}
            onClick={() => {
              setDraft(value);
              setError("");
              onEdit();
            }}
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
          >
            <PencilSimple size={15} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {isEditing ? (
        <div className="animate-fade-up mt-2.5 flex items-start gap-2">
          <MoneyInput
            size="sm"
            autoFocus
            aria-label={`New price for ${name}`}
            currency={currency}
            exponent={exponent}
            placeholder={optional ? "Optional" : undefined}
            value={draft}
            onValueChange={(next) => {
              setDraft(next);
              setError("");
            }}
            errorMessage={error || undefined}
            containerClassName="min-w-0 flex-1"
          />
          <AppButton size="sm" variant="ghost" isIconOnly aria-label="Cancel" startContent={<X weight="bold" />} onPress={onCancel} className="shrink-0" />
          <AppButton size="sm" label="Save" onPress={save} className="shrink-0" />
        </div>
      ) : null}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* One product                                                                 */
/* -------------------------------------------------------------------------- */

export function ChangePriceDrawer({ workspaceId, detail, onClose }: { workspaceId: number; detail: ProductDetail; onClose: () => void }) {
  const { product } = detail;
  const exponent = product.currency_exponent;
  const currency = product.currency;
  const variants = useMemo(() => gridVariants(detail), [detail]);
  const hasVariants = variants.length > 0;

  // "base" is the product's own price; variants are keyed by id.
  const originals = useMemo(() => {
    const map: Record<string, bigint> = { base: BigInt(product.selling_price_minor || "0") };
    for (const variant of variants) map[String(variant.id)] = BigInt(variant.selling_price_minor || "0");
    return map;
  }, [product.selling_price_minor, variants]);
  const originalCompare = product.compare_at_price_minor ? BigInt(product.compare_at_price_minor) : null;

  const [prices, setPrices] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(originals).map(([key, minor]) => [key, toMajorUnits(minor, exponent)])));
  const [compareAt, setCompareAt] = useState(() => toMajorUnits(product.compare_at_price_minor, exponent));
  const [rule, setRule] = useState<PriceRule>(EMPTY_RULE);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");

  const minorOf = (key: string) => toMinorUnits(prices[key], exponent);
  const changedKeys = Object.keys(originals).filter((key) => minorOf(key) !== originals[key]);
  const compareChanged = !hasVariants && toMinorUnits(compareAt, exponent) !== originalCompare;
  const count = changedKeys.length + (compareChanged && !changedKeys.includes("base") ? 1 : 0);

  const applyAll = () => {
    const next: Record<string, string> = {};
    for (const [key, minor] of Object.entries(originals)) next[key] = toMajorUnits(applyRule(minor, rule, exponent), exponent);
    setPrices(next);
    if (!hasVariants && originalCompare !== null && originalCompare <= (toMinorUnits(next.base, exponent) ?? BigInt(0))) setCompareAt("");
    setEditing(null);
    setError("");
  };

  const save = useFinanceAction(
    workspaceId,
    async (_: null, key: string) => {
      let productPart: { selling_price: string; compare_at_price?: string } | undefined;
      const base = minorOf("base");
      const baseChanged = base !== null && base !== originals.base;
      if (baseChanged || compareChanged) {
        productPart = {
          selling_price: prices.base,
          compare_at_price: !hasVariants ? compareAt : toMajorUnits(keptCompareAt(product.compare_at_price_minor, base ?? originals.base), exponent),
        };
      }
      const variantChanges: Array<{ id: number; selling_price: string; compare_at_price?: string }> = [];
      if (hasVariants) {
        for (const variant of variants) {
          const next = minorOf(String(variant.id));
          if (next === null || next === originals[String(variant.id)]) continue;
          variantChanges.push({
            id: variant.id,
            selling_price: toMajorUnits(next, exponent),
            compare_at_price: toMajorUnits(keptCompareAt(variant.compare_at_price_minor, next), exponent),
          });
        }
      }
      return productsApi.changePrices(
        workspaceId,
        product.id,
        {
          product: productPart,
          variants: variantChanges.length ? variantChanges : undefined,
        },
        key,
      );
    },
    { success: count === 1 ? "Price updated" : "Prices updated", onDone: onClose },
  );

  const submit = () => {
    if (!hasVariants && compareAt) {
      const compare = toMinorUnits(compareAt, exponent);
      if (compare === null || compare <= (minorOf("base") ?? BigInt(0))) return setError("Compare-at must be above the selling price.");
    }
    setError("");
    save.mutate(null);
  };

  const row = (key: string, name: string, tag?: string) => (
    <PriceRow
      key={key}
      name={name}
      tag={tag}
      original={originals[key]}
      value={prices[key] ?? ""}
      currency={currency}
      exponent={exponent}
      isEditing={editing === key}
      onEdit={() => setEditing(key)}
      onCancel={() => setEditing(null)}
      onSave={(value) => {
        setPrices({ ...prices, [key]: value });
        setEditing(null);
        setError("");
      }}
    />
  );

  return (
    <SideSheet
      isOpen
      onClose={onClose}
      title="Change price"
      description={hasVariants ? `${product.name} · ${variants.length} variants` : product.name}
      footer={
        <>
          <span className="mr-auto text-[13px] text-muted">{count ? `${count} ${count === 1 ? "change" : "changes"}` : null}</span>
          <AppButton variant="ghost" label="Cancel" onPress={onClose} />
          <AppButton label="Save" isDisabled={!count || editing !== null} isLoading={save.isPending} onPress={submit} />
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <h3 className="mb-2.5 text-[14px] font-semibold">
            {hasVariants ? "Change all by" : "Change by"} {rule.by === "percent" ? "percentage" : "amount"}
          </h3>
          <RuleField rule={rule} onRule={setRule} currency={currency} exponent={exponent} apply={applyAll} />
        </div>

        <div>
          <h3 className="text-[14px] font-semibold">{hasVariants ? "Variants" : "Prices"}</h3>
          <ul className="divide-y divide-separator">
            {hasVariants ? (
              <>
                {row("base", "Product price", "for new variants")}
                {variants.map((variant) => row(String(variant.id), variant.name, variant.is_active ? undefined : "Off"))}
              </>
            ) : (
              <>
                {row("base", "Selling price")}
                <PriceRow
                  name="Compare-at price"
                  optional
                  original={originalCompare}
                  value={compareAt}
                  currency={currency}
                  exponent={exponent}
                  isEditing={editing === "compare"}
                  onEdit={() => setEditing("compare")}
                  onCancel={() => setEditing(null)}
                  onSave={(value) => {
                    setCompareAt(value);
                    setEditing(null);
                    setError("");
                  }}
                />
              </>
            )}
          </ul>
        </div>

        {error ? <p className="animate-fade-up text-[13px] font-medium text-danger">{error}</p> : null}
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
  const [failures, setFailures] = useState<Failure[]>([]);
  const currency = products[0]?.currency ?? "NGN";
  const exponent = products[0]?.currency_exponent ?? 2;
  const mixedCurrency = products.some((product) => product.currency !== currency);
  const ready = ruleReady(rule, exponent);

  const run = useMutation({
    mutationFn: async () => {
      const key = createIdempotencyKey("bulk-prices");
      try {
        await productsApi.bulkChangePrices(
          workspaceId,
          {
            product_ids: products.map((p) => p.id),
            rule,
            include_variants: withVariants,
          },
          key,
        );
        return [];
      } catch (err: unknown) {
        const anyErr = err as { response?: { data?: { failed?: Failure[] } }; failed?: Failure[] };
        const failedItems = anyErr?.response?.data?.failed || anyErr?.failed;
        if (Array.isArray(failedItems) && failedItems.length > 0) {
          return failedItems;
        }
        return [{ name: "All products", message: err instanceof Error ? err.message : "Could not be saved" }];
      }
    },
    onSuccess: (failed) => {
      void queryClient.invalidateQueries({ queryKey: moneyKeys.workspace(workspaceId) });
      const done = products.length - failed.length;
      if (done) toast.success(`Prices updated on ${done} ${done === 1 ? "product" : "products"}`);
      if (!failed.length) return onClose();
      setFailures(failed);
      toast.danger(`${failed.length} could not be changed`);
    },
  });

  return (
    <SideSheet
      isOpen
      onClose={() => !run.isPending && onClose()}
      title="Change prices"
      description={`${products.length} ${products.length === 1 ? "product" : "products"}`}
      footer={
        <>
          <span className="mr-auto text-[13px] text-muted">{run.isPending ? "Updating prices…" : null}</span>
          <AppButton variant="ghost" label={failures.length ? "Close" : "Cancel"} isDisabled={run.isPending} onPress={onClose} />
          <AppButton label="Save" isDisabled={!ready} isLoading={run.isPending} onPress={() => run.mutate()} />
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <h3 className="mb-2.5 text-[14px] font-semibold">Change all by {rule.by === "percent" ? "percentage" : "amount"}</h3>
          <RuleField rule={rule} onRule={setRule} currency={currency} exponent={exponent} />
          {mixedCurrency && rule.by === "amount" ? <p className="mt-2 text-[12px] text-warning">Added in each product’s own currency.</p> : null}
        </div>

        <AppSwitch isSelected={withVariants} onChange={setWithVariants} label="Include variants" />

        {failures.length ? (
          <div>
            <h3 className="flex items-center gap-2 text-[14px] font-semibold text-danger">
              <WarningCircle size={16} aria-hidden="true" />
              Not changed
            </h3>
            <ul className="divide-y divide-separator">
              {failures.map((failure) => (
                <li key={failure.name} className="py-2.5">
                  <span className="block text-[14px] font-semibold">{failure.name}</span>
                  <span className="block text-[12px] text-muted">{failure.message}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <h3 className="text-[14px] font-semibold">Products</h3>
          <ul className="divide-y divide-separator">
            {products.map((product) => {
              const from = BigInt(product.selling_price_minor || "0");
              const to = ready ? applyRule(from, rule, product.currency_exponent) : null;
              const money = (minor: bigint) => formatMinorAmount(minor.toString(), product.currency, product.currency_exponent);
              const moved = to !== null && to !== from;
              return (
                <li key={product.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{product.name}</span>
                    {product.variant_count ? <span className="block text-[12px] text-muted">{withVariants ? `+ ${product.variant_count} variants` : `${product.variant_count} variants unchanged`}</span> : null}
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 text-[13px] tabular">
                    <span className={moved ? "text-muted line-through" : "font-semibold"}>{money(from)}</span>
                    {moved ? (
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
      </div>
    </SideSheet>
  );
}
