"use client";

// Variants: a product that comes in options (Size, Colour…). Each combination
// (Red / XL) is its own variant with its own stock, and its own price only when it
// differs from the product's.
//
// On the form: a Variants card with a summary and "Add variants" / "Edit variants".
// The drawer (right side on large screens, bottom sheet on phones) has three steps:
//   1. Options   — finished options are a list with Edit / Delete; one form at a time.
//   2. Variants  — every combination, grouped (by Colour or Size), with a switch to sell
//                  it and its quantity. "Different price" opens a price screen.
//   3. Review    — what will be saved, then Confirm.

import { Drawer } from "@heroui/react";
import { ArrowLeft, CaretRight, Plus, Trash, X } from "@phosphor-icons/react";
import { useMemo, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppSwitch } from "@/components/ui/app-switch";
import { FormSection } from "@/components/ui/form-kit";
import { MoneyInput } from "@/components/ui/money-input";
import { ListAddRow, ListItemRow, ListRowIconButton } from "@/components/ui/list-rows";
import { Segmented } from "@/components/ui/page";
import { formatMinorAmount } from "@/lib/money";
import type { ProductDetail, SaveOptionsPayload } from "@/types/products";

export interface OptionValueDraft {
  key: string;
  id?: number;
  value: string;
}

export interface OptionDraft {
  key: string;
  id?: number;
  name: string;
  values: OptionValueDraft[];
}

export interface VariantDraft {
  id?: number;
  selling_price: string;
  cost_price: string;
  compare_at_price: string;
  opening_stock: string;
  sku: string;
  barcode: string;
  is_active: boolean;
}

const EXPONENT = 2;
const MAX_OPTIONS = 3;
const MAX_COMBINATIONS = 500;

const PRESETS: { name: string; values: string[] }[] = [
  { name: "Size", values: ["S", "M", "L", "XL", "XXL"] },
  { name: "Colour", values: ["Black", "White", "Red", "Blue", "Green"] },
  { name: "Material", values: ["Cotton", "Leather", "Linen", "Silk"] },
  { name: "Style", values: ["Regular", "Slim", "Classic", "Oversized"] },
  { name: "Pack", values: ["Single", "Pack of 3", "Pack of 6", "Carton"] },
  { name: "Weight", values: ["250g", "500g", "1kg", "5kg"] },
];

const major = (minor?: string | null, exponent = EXPONENT) => {
  if (!minor) return "";
  const amount = BigInt(minor);
  const base = BigInt(10 ** exponent);
  return `${amount / base}.${(amount % base).toString().padStart(exponent, "0")}`.replace(/\.00$/, "");
};

const toMinor = (value?: string): bigint => {
  const clean = (value ?? "").replace(/,/g, "").trim();
  if (!/^\d*\.?\d*$/.test(clean) || clean === "" || clean === ".") return BigInt(0);
  const [whole = "0", fraction = ""] = clean.split(".");
  return BigInt(whole || "0") * BigInt(10 ** EXPONENT) + BigInt((fraction + "0".repeat(EXPONENT)).slice(0, EXPONENT));
};

const keyFor = (keys: string[]) => [...keys].sort().join("|");
const comboKey = (combination: OptionValueDraft[]) => keyFor(combination.map((value) => value.key));
const comboName = (combination: OptionValueDraft[]) => combination.map((value) => value.value).join(" / ");
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Math.random().toString(36).slice(2)}`);
const cleanNumber = (raw: string) => raw.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");

/** A new variant: empty prices, so it follows the product price until given its own. */
const blankRow = (defaults: VariantDraft): VariantDraft => ({ ...defaults, selling_price: "", cost_price: "", compare_at_price: "", opening_stock: "", sku: "", barcode: "", is_active: true });

/* -------------------------------------------------------------------------- */
/* Data helpers (used by the product form when loading and saving)             */
/* -------------------------------------------------------------------------- */

export function initialOptions(detail?: ProductDetail): { enabled: boolean; options: OptionDraft[]; rows: Record<string, VariantDraft> } {
  const options = (detail?.options ?? []).map((option) => ({
    key: `o-${option.id}`,
    id: option.id,
    name: option.name,
    values: (option.value_details ?? []).map((value) => ({ key: `v-${value.id}`, id: value.id, value: value.value })),
  }));
  const productPrice = detail?.product.selling_price_minor;
  const productCost = detail?.product.cost_price_minor;
  const productCompare = detail?.product.compare_at_price_minor ?? null;
  const rows: Record<string, VariantDraft> = {};
  for (const variant of detail?.variants ?? []) {
    if (variant.is_default) continue;
    const keys = options.map((option) => option.values.find((value) => value.value === variant.option_values?.[option.name])?.key ?? "");
    if (keys.some((key) => !key)) continue;
    // A price equal to the product's shows as "follows the product price".
    const own = (minor: string | null | undefined, base: string | null | undefined) => (minor && minor !== base ? major(minor, detail?.product.currency_exponent) : "");
    rows[keyFor(keys)] = {
      id: variant.id,
      selling_price: own(variant.selling_price_minor, productPrice),
      cost_price: own(variant.cost_price_minor, productCost),
      compare_at_price: own(variant.compare_at_price_minor, productCompare),
      opening_stock: "",
      sku: variant.sku ?? "",
      barcode: variant.barcode ?? "",
      is_active: variant.is_active,
    };
  }
  return { enabled: options.length > 0, options, rows };
}

export function optionMatrix(options: OptionDraft[]) {
  const valid = options.filter((option) => option.name.trim() && option.values.length > 0);
  if (!valid.length || valid.length !== options.length) return [] as OptionValueDraft[][];
  return options.reduce<OptionValueDraft[][]>((rows, option) => rows.flatMap((row) => option.values.map((value) => [...row, value])), [[]]);
}

/** Empty prices on a variant use the product's own prices. */
export function optionsPayload(options: OptionDraft[], rows: Record<string, VariantDraft>, defaults: VariantDraft): SaveOptionsPayload {
  return {
    options: options.map((option) => ({
      id: option.id,
      name: option.name.trim(),
      values: option.values.map((value) => ({ id: value.id, value: value.value.trim() })),
    })),
    variants: optionMatrix(options).map((combination) => {
      const row = { ...blankRow(defaults), ...rows[comboKey(combination)] };
      return {
        id: row.id,
        option_values: combination.map((value) => value.value.trim()),
        selling_price: row.selling_price || defaults.selling_price,
        cost_price: row.cost_price || defaults.cost_price || undefined,
        compare_at_price: row.compare_at_price || defaults.compare_at_price || undefined,
        sku: row.sku || undefined,
        barcode: row.barcode || undefined,
        is_active: row.is_active,
      };
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Shared bits                                                                 */
/* -------------------------------------------------------------------------- */

const wideQuery = "(min-width: 768px)";
function subscribeWide(callback: () => void) {
  const list = window.matchMedia(wideQuery);
  list.addEventListener("change", callback);
  return () => list.removeEventListener("change", callback);
}
function useIsWide() {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(wideQuery).matches, () => true);
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-[12px] text-muted">{hint}</span> : null}
    </label>
  );
}

function TextBox({ value, onChange, placeholder, prefix, inputMode = "text", autoFocus, ariaLabel }: { value: string; onChange: (value: string) => void; placeholder?: string; prefix?: string; inputMode?: "text" | "decimal"; autoFocus?: boolean; ariaLabel?: string }) {
  return (
    <span className="field-shell flex h-11 items-center gap-2 px-3">
      {prefix ? <span className="text-[13px] text-muted">{prefix}</span> : null}
      <input
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-full min-w-0 flex-1 bg-transparent text-[14px] tabular outline-none placeholder:text-field-placeholder"
      />
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 1: one option being added or edited                                    */
/* -------------------------------------------------------------------------- */

function OptionForm({ formId, initial, otherNames, onDone }: { formId: string; initial: OptionDraft; otherNames: Set<string>; onDone: (option: OptionDraft) => void }) {
  const [option, setOption] = useState<OptionDraft>(initial);
  const [entry, setEntry] = useState("");
  const [error, setError] = useState("");
  const preset = PRESETS.find((item) => item.name.toLowerCase() === option.name.trim().toLowerCase());
  const has = (value: string) => option.values.some((item) => item.value.trim().toLowerCase() === value.trim().toLowerCase());
  const suggestions = (preset?.values ?? []).filter((value) => !has(value));
  const presetNames = PRESETS.filter((item) => !otherNames.has(item.name.toLowerCase()));

  const addValues = (raw: string) => {
    const parts = raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const fresh = parts.filter((part, at) => !has(part) && parts.findIndex((other) => other.toLowerCase() === part.toLowerCase()) === at);
    if (!fresh.length) return setError(`${parts[0]} is already added`);
    if (option.values.length + fresh.length > 30) return setError("Up to 30 values per option");
    setOption({ ...option, values: [...option.values, ...fresh.map((value) => ({ key: newKey(), value }))] });
    setEntry("");
    setError("");
  };

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addValues(entry);
    } else if (event.key === "Backspace" && !entry && option.values.length) {
      setOption({ ...option, values: option.values.slice(0, -1) });
    }
  };

  const done = () => {
    const values = entry.trim() ? [...option.values, ...entry.split(",").map((part) => part.trim()).filter((part) => part && !has(part)).map((value) => ({ key: newKey(), value }))] : option.values;
    if (!option.name.trim()) return setError("Name this option, like Size or Colour");
    if (otherNames.has(option.name.trim().toLowerCase())) return setError(`You already have ${option.name.trim()}`);
    if (!values.length) return setError(`Add at least one ${option.name.trim()} value`);
    onDone({ ...option, name: option.name.trim(), values });
  };

  return (
    <form
      id={formId}
      className="animate-fade-up space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        done();
      }}
    >
      <Field label="Option name">
        <TextBox value={option.name} autoFocus={!option.name} placeholder="e.g. Size or Colour" onChange={(name) => { setOption({ ...option, name }); setError(""); }} />
      </Field>
      {!option.name.trim() ? (
        <div className="-mt-2 flex flex-wrap gap-1.5">
          {presetNames.map((item) => (
            <button
              key={item.name}
              type="button"
              onClick={() => setOption({ ...option, name: item.name })}
              className="cursor-pointer rounded-full border border-border px-3 py-1 text-[12px] font-medium text-muted transition-colors hover:border-primary hover:text-primary"
            >
              {item.name}
            </button>
          ))}
        </div>
      ) : null}

      {option.name.trim() ? (
        <div className="space-y-1.5">
          <span className="text-[13px] font-medium">{option.name.trim()} values</span>
          <div data-invalid={error ? true : undefined} className="field-shell flex min-h-11 flex-wrap items-center gap-1.5 px-2 py-1.5">
            {option.values.map((value) => (
              <span key={value.key} className="animate-pop inline-flex items-center gap-1 rounded-full bg-primary-soft py-0.5 pr-1 pl-2.5 text-[13px] font-medium text-primary-soft-foreground">
                {value.value}
                <button
                  type="button"
                  aria-label={`Remove ${value.value}`}
                  onClick={() => setOption({ ...option, values: option.values.filter((item) => item.key !== value.key) })}
                  className="grid size-4 cursor-pointer place-items-center rounded-full hover:bg-primary/15"
                >
                  <X size={10} weight="bold" aria-hidden="true" />
                </button>
              </span>
            ))}
            <input
              aria-label={`Add a ${option.name.trim()} value`}
              value={entry}
              autoFocus={Boolean(option.name) && !option.values.length}
              onChange={(event) => {
                setEntry(event.target.value);
                setError("");
              }}
              onKeyDown={onKey}
              placeholder={option.values.length ? "Add another" : "Type a value, press Enter"}
              className="h-7 min-w-28 flex-1 bg-transparent px-1 text-[14px] outline-none"
            />
          </div>
          {suggestions.length ? (
            <div className="flex flex-wrap items-center gap-1">
              {suggestions.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => addValues(value)}
                  className="cursor-pointer rounded-full border border-dashed border-primary/40 px-2.5 py-0.5 text-[12px] font-medium text-primary transition-colors hover:bg-primary-soft"
                >
                  + {value}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="animate-fade-up text-[12px] font-medium text-danger">{error}</p> : null}
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Price screen for one variant                                                */
/* -------------------------------------------------------------------------- */

type PriceDraft = Pick<VariantDraft, "selling_price" | "cost_price" | "compare_at_price" | "sku" | "barcode">;

function PriceScreen({ draft, onDraft, defaults, currency }: { draft: PriceDraft; onDraft: (draft: PriceDraft) => void; defaults: VariantDraft; currency: string }) {
  const set = (key: keyof PriceDraft, value: string) => onDraft({ ...draft, [key]: value });
  const same = (value: string) => (value ? `Empty uses the product’s ${formatMinorAmount(toMinor(value).toString(), currency, EXPONENT)}` : undefined);
  return (
    <div className="animate-fade-up space-y-4">
      <MoneyInput label="Selling price" autoFocus currency={currency} exponent={EXPONENT} value={draft.selling_price} placeholder={defaults.selling_price || "0.00"} onValueChange={(value) => set("selling_price", value)} description={same(defaults.selling_price)} />
      <MoneyInput label="Cost price" currency={currency} exponent={EXPONENT} value={draft.cost_price} placeholder={defaults.cost_price || "0.00"} onValueChange={(value) => set("cost_price", value)} description={same(defaults.cost_price)} />
      <MoneyInput label="Compare-at price" currency={currency} exponent={EXPONENT} value={draft.compare_at_price} placeholder={defaults.compare_at_price || "Optional"} onValueChange={(value) => set("compare_at_price", value)} description="Shown crossed out next to the price." />
      <AppInput label="SKU" value={draft.sku} placeholder="Made for you" onChange={(event) => set("sku", event.target.value.toUpperCase())} />
      <AppInput label="Barcode" value={draft.barcode} placeholder="Optional" onChange={(event) => set("barcode", event.target.value)} />
      {draft.selling_price || draft.cost_price || draft.compare_at_price ? (
        <button type="button" onClick={() => onDraft({ ...draft, selling_price: "", cost_price: "", compare_at_price: "" })} className="cursor-pointer text-[13px] font-semibold text-primary hover:underline">
          Use the product price instead
        </button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The drawer                                                                  */
/* -------------------------------------------------------------------------- */

const STEPS = ["Options", "Variants", "Review"] as const;

function VariantsDrawer({
  currency,
  initialOptionsList,
  initialRows,
  defaults,
  isEdit,
  stockTracked,
  onSave,
  onClose,
}: {
  currency: string;
  initialOptionsList: OptionDraft[];
  initialRows: Record<string, VariantDraft>;
  defaults: VariantDraft;
  isEdit: boolean;
  stockTracked: boolean;
  onSave: (options: OptionDraft[], rows: Record<string, VariantDraft>) => void;
  onClose: () => void;
}) {
  const wide = useIsWide();
  const [step, setStep] = useState(1);
  const [options, setOptions] = useState<OptionDraft[]>(initialOptionsList);
  const [editing, setEditing] = useState<OptionDraft | null>(initialOptionsList.length ? null : { key: newKey(), name: "", values: [] });
  const [rows, setRows] = useState<Record<string, VariantDraft>>(initialRows);
  const [groupBy, setGroupBy] = useState(0);
  const [pricing, setPricing] = useState<OptionValueDraft[] | null>(null);
  const [priceDraft, setPriceDraft] = useState<PriceDraft>({ selling_price: "", cost_price: "", compare_at_price: "", sku: "", barcode: "" });
  const [bulkQty, setBulkQty] = useState("");
  const [error, setError] = useState("");

  const matrix = useMemo(() => optionMatrix(options), [options]);
  const showStock = stockTracked && !isEdit;
  const rowOf = (combination: OptionValueDraft[]) => ({ ...blankRow(defaults), ...rows[comboKey(combination)] });
  const patch = (combination: OptionValueDraft[], change: Partial<VariantDraft>) => {
    const key = comboKey(combination);
    setRows((current) => ({ ...current, [key]: { ...blankRow(defaults), ...current[key], ...change } }));
    setError("");
  };
  const selling = matrix.filter((combination) => rowOf(combination).is_active);
  const qtyOf = (combination: OptionValueDraft[]) => Number(rowOf(combination).opening_stock) || 0;
  const totalQty = selling.reduce((sum, combination) => sum + qtyOf(combination), 0);
  const money = (value: string) => (toMinor(value) > BigInt(0) ? formatMinorAmount(toMinor(value).toString(), currency, EXPONENT) : "—");

  // Group by the chosen option: Colour → Red: XL, L; or Size → XL: Red, Black.
  const groupIndex = Math.min(groupBy, Math.max(0, options.length - 1));
  const groups = useMemo(() => {
    if (options.length < 2) return [{ title: "", value: null as OptionValueDraft | null, items: matrix }];
    return options[groupIndex].values.map((value) => ({ title: value.value, value, items: matrix.filter((combination) => combination[groupIndex]?.key === value.key) }));
  }, [matrix, options, groupIndex]);
  const restName = (combination: OptionValueDraft[]) => (options.length < 2 ? comboName(combination) : combination.filter((_, index) => index !== groupIndex).map((value) => value.value).join(" / "));

  const checkVariants = () => {
    if (!selling.length) return "Sell at least one variant";
    const bad = selling.find((combination) => {
      const qty = rowOf(combination).opening_stock;
      return qty && !/^\d+(\.\d{1,4})?$/.test(qty);
    });
    if (bad) return `Check the quantity for ${comboName(bad)}`;
    if (showStock && !defaults.cost_price && selling.some((combination) => qtyOf(combination) > 0 && !rowOf(combination).cost_price)) {
      return "Add a cost price on the product (or on each variant with stock) so the stock can be valued";
    }
    return "";
  };

  const next = () => {
    if (step === 1) {
      if (editing) return setError("Finish the option you are adding, then tap Done");
      if (!options.length) return setError("Add at least one option, like Size");
      if (matrix.length > MAX_COMBINATIONS) return setError(`That makes ${matrix.length} variants. Use fewer values (up to ${MAX_COMBINATIONS}).`);
    }
    if (step === 2) {
      const problem = checkVariants();
      if (problem) return setError(problem);
    }
    setError("");
    setStep(step + 1);
  };

  const openPricing = (combination: OptionValueDraft[]) => {
    const row = rowOf(combination);
    setPriceDraft({ selling_price: row.selling_price, cost_price: row.cost_price, compare_at_price: row.compare_at_price, sku: row.sku, barcode: row.barcode });
    setPricing(combination);
  };
  const confirmPrice = () => {
    if (pricing) patch(pricing, priceDraft);
    setPricing(null);
  };

  const optionFormId = "variant-option-form";
  const editingExisting = Boolean(editing && options.some((item) => item.key === editing.key));
  const title = pricing ? comboName(pricing) : editing ? (editingExisting ? `Edit ${editing.name}` : "Add option") : initialOptionsList.length ? "Edit variants" : "Add variants";
  const back = pricing ? () => setPricing(null) : editing && options.length ? () => setEditing(null) : null;

  return (
    <Drawer>
      <Drawer.Backdrop isOpen onOpenChange={(open) => !open && onClose()} variant="blur">
        <Drawer.Content placement={wide ? "right" : "bottom"}>
          <Drawer.Dialog className={`flex flex-col bg-overlay p-0 ${wide ? "animate-drawer-in h-full w-full max-w-[520px]" : "animate-sheet-up max-h-[92dvh] w-full rounded-t-3xl"}`}>
            {!wide ? <span aria-hidden="true" className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-default" /> : null}

            {/* Header */}
            <div className="shrink-0 px-5 pt-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {back ? (
                    <button type="button" aria-label="Back" onClick={back} className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted hover:bg-surface-secondary hover:text-foreground">
                      <ArrowLeft size={16} aria-hidden="true" />
                    </button>
                  ) : null}
                  <Drawer.Heading className="truncate text-[18px] font-bold tracking-[-0.02em]">{title}</Drawer.Heading>
                </div>
                <button type="button" aria-label="Close" onClick={onClose} className="-mt-1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-foreground">
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              {!pricing && !editing ? (
                <div className="mt-3 flex items-center gap-2">
                  {STEPS.map((label, index) => (
                    <span key={label} className="flex items-center gap-2">
                      <span className={`grid size-6 place-items-center rounded-full text-[11px] font-bold ${index + 1 <= step ? "bg-primary text-primary-foreground" : "bg-default text-muted"}`}>{index + 1}</span>
                      <span className={`text-[13px] ${index + 1 === step ? "font-semibold" : "text-muted"}`}>{label}</span>
                      {index < STEPS.length - 1 ? <CaretRight size={12} className="text-muted" aria-hidden="true" /> : null}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {pricing ? (
                <PriceScreen draft={priceDraft} onDraft={setPriceDraft} defaults={defaults} currency={currency} />
              ) : step === 1 && editing ? (
                <OptionForm
                  key={editing.key}
                  formId={optionFormId}
                  initial={editing}
                  otherNames={new Set(options.filter((item) => item.key !== editing.key).map((item) => item.name.trim().toLowerCase()))}
                  onDone={(option) => {
                    setOptions(options.some((item) => item.key === option.key) ? options.map((item) => (item.key === option.key ? option : item)) : [...options, option]);
                    setEditing(null);
                    setError("");
                  }}
                />
              ) : step === 1 ? (
                <div className="space-y-3">
                  <ListAddRow label="Add option" isDisabled={options.length >= MAX_OPTIONS} onPress={() => setEditing({ key: newKey(), name: "", values: [] })} />
                  <ul className="space-y-1">
                    {options.map((option, index) => (
                      <ListItemRow
                        key={option.key}
                        title={option.name}
                        description={option.values.map((value) => value.value).join(", ")}
                        onPress={() => setEditing(option)}
                        trailing={<ListRowIconButton label={`Delete ${option.name}`} tone="danger" icon={<Trash size={16} aria-hidden="true" />} onPress={() => setOptions(options.filter((_, at) => at !== index))} />}
                      />
                    ))}
                  </ul>
                </div>
              ) : step === 2 ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {options.length > 1 ? (
                      <Segmented size="sm" aria-label="Group variants by" options={options.map((option, index) => ({ key: String(index), label: `By ${option.name}` }))} value={String(groupIndex)} onChange={(value) => setGroupBy(Number(value))} />
                    ) : (
                      <span />
                    )}
                    {showStock ? (
                      <span className="flex items-center gap-2">
                        <input
                          aria-label="Quantity for every variant"
                          inputMode="decimal"
                          value={bulkQty}
                          placeholder="Qty"
                          onChange={(event) => setBulkQty(cleanNumber(event.target.value))}
                          className="field-shell h-9 w-16 px-2 text-right text-[13px] tabular outline-none"
                        />
                        <AppButton
                          size="sm"
                          variant="secondary"
                          label="Set for all"
                          onPress={() => {
                            if (!bulkQty) return;
                            selling.forEach((combination) => patch(combination, { opening_stock: bulkQty }));
                            setBulkQty("");
                          }}
                        />
                      </span>
                    ) : null}
                  </div>

                  {groups.map((group) => {
                    const on = group.items.filter((combination) => rowOf(combination).is_active);
                    const groupQty = on.reduce((sum, combination) => sum + qtyOf(combination), 0);
                    return (
                      <section key={group.title || "all"}>
                        {group.title ? (
                          <div className="flex items-center justify-between gap-3 pb-1">
                            <h4 className="text-[13px] font-semibold">
                              {group.title}
                              <span className="ml-1.5 font-normal text-muted">
                                {on.length} of {group.items.length}
                                {showStock && groupQty ? ` · ${groupQty} in stock` : ""}
                              </span>
                            </h4>
                            <button
                              type="button"
                              onClick={() => group.items.forEach((combination) => patch(combination, { is_active: on.length === 0 }))}
                              className="cursor-pointer text-[12px] font-semibold text-primary hover:underline"
                            >
                              {on.length === 0 ? "Sell all" : "Turn all off"}
                            </button>
                          </div>
                        ) : null}
                        <ul className="divide-y divide-separator border-y border-separator">
                          {group.items.map((combination) => {
                            const row = rowOf(combination);
                            const own = Boolean(row.selling_price || row.cost_price || row.compare_at_price);
                            return (
                              <li key={comboKey(combination)} className={`flex items-center gap-3 py-2.5 ${row.is_active ? "" : "opacity-55"}`}>
                                <AppSwitch isSelected={row.is_active} onChange={(value) => patch(combination, { is_active: value })} aria-label={`Sell ${comboName(combination)}`} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[14px] font-medium">{restName(combination)}</span>
                                  {row.is_active ? (
                                    <button type="button" onClick={() => openPricing(combination)} className="cursor-pointer text-[12px] text-muted hover:text-primary">
                                      <span className={own ? "font-semibold text-foreground tabular" : "tabular"}>{money(row.selling_price || defaults.selling_price)}</span>
                                      <span className="ml-1.5 font-semibold text-primary">{own ? "Edit price" : "Different price"}</span>
                                    </button>
                                  ) : (
                                    <span className="block text-[12px] text-muted">Not sold</span>
                                  )}
                                </span>
                                {showStock && row.is_active ? (
                                  <input
                                    aria-label={`${comboName(combination)} quantity`}
                                    inputMode="decimal"
                                    value={row.opening_stock}
                                    placeholder="Qty"
                                    onChange={(event) => patch(combination, { opening_stock: cleanNumber(event.target.value) })}
                                    className="field-shell h-10 w-20 shrink-0 px-2.5 text-right text-[14px] font-semibold tabular outline-none placeholder:font-normal placeholder:text-field-placeholder"
                                  />
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    );
                  })}
                  {stockTracked && isEdit ? <p className="text-[12px] text-muted">Change each variant’s stock later on the product’s Stock tab.</p> : null}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 border-y border-separator py-3 text-center">
                    <span>
                      <span className="block text-[20px] font-bold tabular">{selling.length}</span>
                      <span className="text-[12px] text-muted">for sale</span>
                    </span>
                    <span>
                      <span className="block text-[20px] font-bold tabular">{matrix.length - selling.length}</span>
                      <span className="text-[12px] text-muted">turned off</span>
                    </span>
                    <span>
                      <span className="block text-[20px] font-bold tabular">{showStock ? totalQty : options.length}</span>
                      <span className="text-[12px] text-muted">{showStock ? "in stock" : options.length === 1 ? "option" : "options"}</span>
                    </span>
                  </div>
                  <p className="text-[13px] text-muted">{options.map((option) => `${option.name}: ${option.values.map((value) => value.value).join(", ")}`).join(" · ")}</p>
                  <ul className="divide-y divide-separator">
                    {selling.map((combination) => {
                      const row = rowOf(combination);
                      return (
                        <li key={comboKey(combination)} className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
                          <span className="min-w-0 truncate font-medium">{comboName(combination)}</span>
                          <span className="flex shrink-0 items-center gap-4 tabular">
                            {showStock ? <span className="text-muted">{qtyOf(combination)} qty</span> : null}
                            <span className={row.selling_price ? "font-semibold" : "text-muted"}>{money(row.selling_price || defaults.selling_price)}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {error ? <p className="animate-fade-up mt-4 text-[13px] font-medium text-danger">{error}</p> : null}
            </div>

            {/* Footer */}
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-separator px-5 py-4">
              {pricing ? (
                <>
                  <AppButton variant="ghost" label="Cancel" className="max-sm:flex-1" onPress={() => setPricing(null)} />
                  <AppButton label="Confirm" className="max-sm:flex-[2]" onPress={confirmPrice} />
                </>
              ) : step === 1 && editing ? (
                <>
                  <AppButton variant="ghost" label="Cancel" className="max-sm:flex-1" onPress={() => (options.length ? setEditing(null) : onClose())} />
                  <AppButton type="submit" form={optionFormId} label="Done" className="max-sm:flex-[2]" />
                </>
              ) : (
                <>
                  {step === 1 && matrix.length ? <span className="mr-auto text-[13px] text-muted tabular">{matrix.length} variant{matrix.length === 1 ? "" : "s"}</span> : null}
                  <AppButton variant="ghost" label={step === 1 ? "Cancel" : "Back"} className="max-sm:flex-1" onPress={() => (step === 1 ? onClose() : (setError(""), setStep(step - 1)))} />
                  {step < 3 ? (
                    <AppButton label="Next" className="max-sm:flex-[2]" onPress={next} />
                  ) : (
                    <AppButton label="Confirm" className="max-sm:flex-[2]" onPress={() => onSave(options, rows)} />
                  )}
                </>
              )}
            </div>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}

/* -------------------------------------------------------------------------- */
/* The card on the product form                                                */
/* -------------------------------------------------------------------------- */

export function ProductOptionsEditor({
  currency,
  options,
  onOptions,
  rows,
  onRows,
  defaults,
  isEdit,
  stockTracked,
}: {
  currency: string;
  options: OptionDraft[];
  onOptions: (value: OptionDraft[]) => void;
  rows: Record<string, VariantDraft>;
  onRows: (value: Record<string, VariantDraft>) => void;
  defaults: VariantDraft;
  isEdit: boolean;
  stockTracked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [drawerKey, setDrawerKey] = useState(0);
  const matrix = useMemo(() => optionMatrix(options), [options]);
  const enabled = options.length > 0 && matrix.length > 0;
  const money = (value: string) => (toMinor(value) > BigInt(0) ? formatMinorAmount(toMinor(value).toString(), currency, EXPONENT) : "—");
  const selling = matrix.filter((combination) => rows[comboKey(combination)]?.is_active !== false);
  const prices = selling.map((combination) => toMinor(rows[comboKey(combination)]?.selling_price || defaults.selling_price)).filter((value) => value > BigInt(0));
  const low = prices.length ? prices.reduce((a, b) => (a < b ? a : b)) : BigInt(0);
  const high = prices.length ? prices.reduce((a, b) => (a > b ? a : b)) : BigInt(0);
  const totalQty = selling.reduce((sum, combination) => sum + (Number(rows[comboKey(combination)]?.opening_stock) || 0), 0);
  const priceText = low === high ? formatMinorAmount(low.toString(), currency, EXPONENT) : `${formatMinorAmount(low.toString(), currency, EXPONENT)} – ${formatMinorAmount(high.toString(), currency, EXPONENT)}`;

  const openDrawer = () => {
    setDrawerKey(drawerKey + 1);
    setOpen(true);
  };

  return (
    <FormSection
      title="Variants"
      description={enabled ? "Each one is sold and counted on its own." : "Does this product come in sizes, colours or types?"}
      action={
        enabled ? (
          <button type="button" onClick={openDrawer} className="cursor-pointer text-[13px] font-semibold text-primary hover:underline">
            Edit variants
          </button>
        ) : undefined
      }
    >
      {!enabled ? (
        <button
          type="button"
          onClick={openDrawer}
          className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary-soft/40 px-3.5 py-3 text-left transition-colors hover:bg-primary-soft"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-white">
            <Plus size={16} weight="bold" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-primary-soft-foreground">Add variants</span>
            <span className="block text-[12px] text-muted">Like Colour (Red, Black) and Size (XL, L). Each gets its own stock.</span>
          </span>
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-[13px] text-muted">{options.map((option) => `${option.name}: ${option.values.map((value) => value.value).join(", ")}`).join(" · ")}</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted">
            <span>
              <span className="font-semibold text-foreground">{selling.length}</span> for sale
            </span>
            <span>
              Price <span className="font-semibold text-foreground tabular">{priceText}</span>
            </span>
            {stockTracked && !isEdit ? (
              <span>
                Opening stock <span className="font-semibold text-foreground tabular">{totalQty}</span>
              </span>
            ) : null}
          </div>
          <ul className="divide-y divide-separator border-y border-separator">
            {selling.slice(0, 6).map((combination) => {
              const row = rows[comboKey(combination)];
              return (
                <li key={comboKey(combination)} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                  <span className="truncate font-medium">{comboName(combination)}</span>
                  <span className="flex shrink-0 items-center gap-4 tabular">
                    {stockTracked && !isEdit ? <span className="text-muted">{Number(row?.opening_stock) || 0} qty</span> : null}
                    <span className={row?.selling_price ? "font-semibold" : "text-muted"}>{money(row?.selling_price || defaults.selling_price)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {selling.length > 6 ? (
              <button type="button" onClick={openDrawer} className="cursor-pointer text-[13px] font-semibold text-primary hover:underline">
                See all {selling.length} variants
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => {
                onOptions([]);
                onRows({});
              }}
              className="cursor-pointer text-[12px] font-semibold text-muted hover:text-danger"
            >
              Remove variants
            </button>
          </div>
        </div>
      )}

      {open ? (
        <VariantsDrawer
          key={drawerKey}
          currency={currency}
          initialOptionsList={options}
          initialRows={rows}
          defaults={defaults}
          isEdit={isEdit}
          stockTracked={stockTracked}
          onClose={() => setOpen(false)}
          onSave={(nextOptions, nextRows) => {
            onOptions(nextOptions);
            onRows(nextRows);
            setOpen(false);
          }}
        />
      ) : null}
    </FormSection>
  );
}
