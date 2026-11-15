"use client";

// Product lines for invoices, quotations, sales and purchases.
// Items show as compact rows. "Add item" opens a drawer that lists your products;
// choosing a product, adding a new item, or editing a row all use ONE item form.
// A new item can also be saved to the product list from that same form.
// A line keeps the product it came from, so stock products move stock when the record is saved.

import { Minus, PencilSimple, Plus, Trash, WarningCircle } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState, type ComponentProps } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { PickerDrawer, type PickerItem } from "@/components/ui/form-kit";
import { MoneyInput } from "@/components/ui/money-input";
import { createIdempotencyKey } from "@/lib/utils";
import { financeApi, formatMinorAmount } from "@/lib/money";
import { productKeys, productsApi } from "@/lib/products";
import type { Product } from "@/types/products";
import type { ProductVariant } from "@/types/finance";

export interface LineItem {
  description: string;
  quantity: string;
  unit_price: string;
  discount_amount?: string;
  /** The product this line sells or buys, when it came from (or was saved to) your products. */
  product_id?: number;
  variant_id?: number;
  /** True when that product counts stock. */
  tracks_stock?: boolean;
}

/** Where the lines are used: changes the wording and which price is suggested. */
export type LineItemsContext = "invoice" | "sale" | "purchase";

const EXPONENT = 2;

const WORDS: Record<LineItemsContext, { add: string; price: string; placeholder: string }> = {
  invoice: { add: "Add to invoice", price: "Unit price", placeholder: "What you are billing for" },
  sale: { add: "Add to sale", price: "Unit price", placeholder: "What you sold" },
  purchase: { add: "Add to purchase", price: "Cost per unit", placeholder: "What you bought" },
};

/** Major decimal string → minor units as bigint, never via floating point. */
export function toMinor(major?: string): bigint {
  const clean = (major ?? "").replace(/,/g, "").trim();
  if (!/^\d*\.?\d*$/.test(clean) || clean === "" || clean === ".") return BigInt(0);
  const [whole = "0", fraction = ""] = clean.split(".");
  return BigInt(whole || "0") * BigInt(10 ** EXPONENT) + BigInt((fraction + "0".repeat(EXPONENT)).slice(0, EXPONENT));
}

function minorToMajor(minor: string | number, exponent: number): string {
  const value = BigInt(minor);
  const base = BigInt(10 ** exponent);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(exponent, "0");
  return exponent > 0 ? `${whole}.${fraction}` : `${whole}`;
}

/** quantity × price − discount, in minor units. Whole quantities only. */
export function lineTotal(line: LineItem): bigint {
  const quantity = BigInt(/^\d+$/.test(line.quantity) ? line.quantity : "0");
  const gross = quantity * toMinor(line.unit_price);
  const net = gross - toMinor(line.discount_amount);
  return net > BigInt(0) ? net : BigInt(0);
}

/** "12.0000" → "12" */
export function stockNumber(quantity?: string): string {
  const value = Number(quantity ?? "0");
  return Number.isFinite(value) ? String(Math.round(value * 10000) / 10000) : "0";
}

function unitWord(unit: string) {
  return unit.replace(/ \(.*\)/, "").toLowerCase() || "pc";
}

/* -------------------------------------------------------------------------- */
/* The one item form                                                           */
/* -------------------------------------------------------------------------- */

function ItemForm({
  workspaceId,
  currency,
  context,
  initial,
  product,
  variant,
  isEditing,
  onSave,
  onCancel,
}: {
  workspaceId: number;
  currency: string;
  context: LineItemsContext;
  initial: LineItem;
  product?: Product;
  variant?: ProductVariant;
  isEditing: boolean;
  onSave: (line: LineItem) => void;
  onCancel: () => void;
}) {
  const words = WORDS[context];
  const [line, setLine] = useState<LineItem>(initial);
  const [showDiscount, setShowDiscount] = useState(Boolean(initial.discount_amount));
  const [saveToProducts, setSaveToProducts] = useState(false);
  const [kind, setKind] = useState<"non_stock" | "service">("non_stock");
  const [errors, setErrors] = useState<{ description?: string; price?: string; quantity?: string; save?: string }>({});
  const [saving, setSaving] = useState(false);
  const show = (minor: bigint) => formatMinorAmount(minor.toString(), currency, EXPONENT);
  const quantity = Number(/^\d+$/.test(line.quantity) ? line.quantity : "0");
  const canSaveToProducts = !line.product_id && !isEditing;
  const stockQuantity = variant?.quantity_on_hand ?? product?.quantity_on_hand;
  const inStock = product?.kind === "stock_tracked" ? Number(stockQuantity) : null;
  const short = context !== "purchase" && inStock !== null && quantity > inStock;

  const step = (delta: number) => setLine({ ...line, quantity: String(Math.max(1, quantity + delta)) });

  const submit = async () => {
    const next: typeof errors = {};
    if (!line.description.trim()) next.description = "Name this item";
    if (!/^[1-9]\d{0,5}$/.test(line.quantity)) next.quantity = "Enter a whole quantity";
    if (toMinor(line.unit_price) <= BigInt(0)) next.price = "Enter a price";
    setErrors(next);
    if (Object.keys(next).length) return;

    let productId = line.product_id;
    if (canSaveToProducts && saveToProducts) {
      setSaving(true);
      try {
        const price = line.unit_price.replace(/,/g, "");
        const result = (await financeApi.createCatalogueItem(
          workspaceId,
          { name: line.description.trim(), kind, status: "active", selling_price: price, currency },
          createIdempotencyKey("catalogue"),
        )) as { item?: { id?: number } } | undefined;
        productId = result?.item?.id;
      } catch (cause) {
        setSaving(false);
        setErrors({ save: cause instanceof Error ? cause.message : "Could not save to your products" });
        return;
      }
    }
    onSave({ ...line, description: line.description.trim(), product_id: productId });
  };

  return (
    <div className="space-y-4">
      <AppInput
        label="Item"
        isRequired
        autoFocus={!product}
        placeholder={words.placeholder}
        value={line.description}
        onChange={(event) => setLine({ ...line, description: event.target.value })}
        errorMessage={errors.description}
      />

      <div className="grid grid-cols-[auto_1fr] gap-3">
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium">Quantity</p>
          <div data-invalid={errors.quantity ? true : undefined} className="field-shell flex h-11 items-center">
            <button type="button" aria-label="Decrease quantity" onClick={() => step(-1)} className="grid h-full w-10 cursor-pointer place-items-center text-muted transition-colors hover:text-foreground">
              <Minus size={14} weight="bold" aria-hidden="true" />
            </button>
            <input
              aria-label="Quantity"
              inputMode="numeric"
              value={line.quantity}
              onChange={(event) => setLine({ ...line, quantity: event.target.value.replace(/\D/g, "").slice(0, 6) })}
              className="w-12 bg-transparent text-center text-[14px] font-semibold tabular outline-none"
            />
            <button type="button" aria-label="Increase quantity" onClick={() => step(1)} className="grid h-full w-10 cursor-pointer place-items-center text-muted transition-colors hover:text-foreground">
              <Plus size={14} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </div>
        <MoneyInput
          label={words.price}
          isRequired
          currency={currency}
          exponent={EXPONENT}
          placeholder="0.00"
          value={line.unit_price}
          onValueChange={(value) => setLine({ ...line, unit_price: value })}
          errorMessage={errors.price}
        />
      </div>

      {inStock !== null ? (
        <p className={`flex items-center gap-1.5 text-[12px] ${short ? "font-medium text-danger" : "text-muted"}`}>
          {short ? <WarningCircle size={14} weight="fill" aria-hidden="true" /> : null}
          {context === "purchase"
            ? `${stockNumber(stockQuantity)} ${unitWord(product?.unit_name ?? "")} in stock now. This purchase adds ${quantity || 0}.`
            : short
              ? `Only ${stockNumber(stockQuantity)} ${variant?.name ?? product?.name} left in stock. Add stock first, or lower the quantity.`
              : `${stockNumber(stockQuantity)} ${unitWord(product?.unit_name ?? "")} in stock. Saving takes ${quantity || 0} out.`}
        </p>
      ) : null}

      {context === "invoice" ? (
        showDiscount ? (
          <div className="animate-fade-up">
            <MoneyInput
              label="Discount on this item"
              currency={currency}
              exponent={EXPONENT}
              placeholder="0.00"
              value={line.discount_amount ?? ""}
              onValueChange={(value) => setLine({ ...line, discount_amount: value })}
            />
          </div>
        ) : (
          <button type="button" onClick={() => setShowDiscount(true)} className="cursor-pointer text-[13px] font-semibold text-primary hover:underline">
            + Add a discount
          </button>
        )
      ) : null}

      {canSaveToProducts ? (
        <div className="rounded-xl border border-border p-3">
          <button
            type="button"
            role="switch"
            aria-checked={saveToProducts}
            onClick={() => setSaveToProducts(!saveToProducts)}
            className="flex w-full cursor-pointer items-center justify-between gap-3 text-left"
          >
            <span>
              <span className="block text-[14px] font-semibold">Save to my products</span>
              <span className="block text-[12px] text-muted">Pick it next time instead of typing it again.</span>
            </span>
            <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${saveToProducts ? "bg-primary" : "bg-default"}`}>
              <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200 ${saveToProducts ? "translate-x-[18px]" : "translate-x-0.5"}`} />
            </span>
          </button>
          {saveToProducts ? (
            <div className="animate-fade-up mt-3 grid grid-cols-2 gap-2">
              {(
                [
                  { key: "non_stock", label: "Product" },
                  { key: "service", label: "Service" },
                ] as const
              ).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setKind(option.key)}
                  className={`h-9 cursor-pointer rounded-lg border text-[13px] font-semibold transition-colors ${
                    kind === option.key ? "border-primary bg-primary-soft text-primary-soft-foreground" : "border-border text-muted hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
          {errors.save ? <p className="animate-fade-up mt-2 text-[12px] font-medium text-danger">{errors.save}</p> : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between rounded-xl bg-surface-secondary px-4 py-3">
        <span className="text-[13px] text-muted">Line total</span>
        <span key={lineTotal(line).toString()} className="animate-fade-up text-[18px] font-bold tabular">
          {show(lineTotal(line))}
        </span>
      </div>

      <div className="flex gap-2 pt-1">
        <AppButton variant="ghost" label="Back" className="flex-1" onPress={onCancel} />
        <AppButton label={isEditing ? "Update item" : words.add} className="flex-[2]" isLoading={saving} onPress={() => void submit()} />
      </div>
    </div>
  );
}

function VariantLineForm(props: ComponentProps<typeof ItemForm> & { product: Product }) {
  const variants = useQuery({
    queryKey: ["product-variants", props.workspaceId, props.product.id],
    queryFn: () => financeApi.listProductVariants(props.workspaceId, props.product.id),
  });
  const [chosen, setChosen] = useState<number | undefined>(props.initial.variant_id);
  if (variants.isPending) return <p className="p-4 text-[13px] text-muted">Loading variants…</p>;
  if (variants.isError) return <p className="p-4 text-[13px] text-danger">Variants could not be loaded. Try again.</p>;
  const choices = variants.data.filter((variant) => variant.is_active && !variant.is_default);
  if (!choices.length) return <ItemForm {...props} />;
  const selected = choices.find((variant) => variant.id === chosen);
  if (!selected) {
    return <div className="space-y-3">
      <p className="text-[14px] font-semibold">Which one?</p>
      <div className="space-y-2">
        {choices.map((variant) => <button key={variant.id} type="button" onClick={() => setChosen(variant.id)}
          className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-border p-3 text-left hover:bg-surface-secondary">
          <span><span className="block text-[14px] font-semibold">{variant.name}</span><span className="text-[12px] text-muted">{stockNumber(variant.quantity_on_hand)} in stock</span></span>
          <span className="text-[13px] font-semibold tabular">{formatMinorAmount(props.context === "purchase" ? variant.cost_price_minor : variant.selling_price_minor, variant.currency, variant.currency_exponent)}</span>
        </button>)}
      </div>
      <AppButton variant="ghost" label="Back" onPress={props.onCancel} />
    </div>;
  }
  const price = props.context === "purchase" ? selected.cost_price_minor : selected.selling_price_minor;
  return <ItemForm key={selected.id} {...props} variant={selected}
    initial={{ ...props.initial, variant_id: selected.id, description: `${props.product.name} · ${selected.name}`,
      unit_price: minorToMajor(price, selected.currency_exponent) }}
    onCancel={() => setChosen(undefined)} />;
}

/* -------------------------------------------------------------------------- */
/* Rows + drawer                                                               */
/* -------------------------------------------------------------------------- */

export function LineItemsEditor({
  workspaceId,
  currency,
  items,
  onAdd,
  onUpdate,
  onRemove,
  error,
  context = "invoice",
}: {
  workspaceId: number;
  currency: string;
  items: LineItem[];
  onAdd: (line: LineItem) => void;
  onUpdate: (index: number, line: LineItem) => void;
  onRemove: (index: number) => void;
  error?: string;
  context?: LineItemsContext;
}) {
  const filter = { status: "active" };
  const catalogue = useQuery({
    queryKey: productKeys.list(workspaceId, filter),
    queryFn: () => productsApi.list(workspaceId, filter),
  });
  const [drawer, setDrawer] = useState<{ key: number; editIndex?: number } | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const show = (minor: bigint) => formatMinorAmount(minor.toString(), currency, EXPONENT);
  const subtotal = items.reduce((sum, line) => sum + lineTotal(line), BigInt(0));

  const products: Product[] = catalogue.data ?? [];
  const priceOf = (product: Product) => (context === "purchase" && BigInt(product.cost_price_minor) > BigInt(0) ? product.cost_price_minor : product.selling_price_minor);
  const pickerItems: PickerItem[] = products.map((product) => ({
    id: `cat-${product.id}`,
    label: product.name,
    description:
      product.kind === "service"
        ? "Service"
        : product.kind === "stock_tracked"
          ? `${stockNumber(product.quantity_on_hand)} ${unitWord(product.unit_name)} in stock`
          : unitWord(product.unit_name),
    meta: formatMinorAmount(priceOf(product), product.currency, product.currency_exponent),
  }));

  // A fresh key each time, so the drawer always opens on its first view.
  const open = (editIndex?: number) => {
    setOpenCount(openCount + 1);
    setDrawer({ key: openCount + 1, editIndex });
  };
  const editing = drawer?.editIndex !== undefined ? items[drawer.editIndex] : undefined;

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <button
          type="button"
          onClick={() => open()}
          data-invalid={error ? true : undefined}
          style={{ borderStyle: "dashed" }}
          className="field-shell flex w-full cursor-pointer flex-col items-center gap-2 px-4 py-8 text-center"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-white">
            <Plus size={18} weight="bold" aria-hidden="true" />
          </span>
          <span className="text-[14px] font-semibold">Add your first item</span>
          <span className="text-[12px] text-muted">Pick from your products or type a new one.</span>
        </button>
      ) : (
        <ul className="divide-y divide-separator overflow-hidden rounded-xl border border-border">
          {items.map((line, index) => (
            <li key={`${line.description}-${index}`} className="animate-fade-up flex items-center gap-3 bg-surface px-3.5 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-secondary text-[12px] font-bold tabular">{index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 truncate text-[14px] font-semibold">
                  {line.description}
                  {line.tracks_stock ? <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold text-primary-soft-foreground">Stock</span> : null}
                </span>
                <span className="block text-[12px] text-muted tabular">
                  {line.quantity} × {show(toMinor(line.unit_price))}
                  {toMinor(line.discount_amount) > BigInt(0) ? ` − ${show(toMinor(line.discount_amount))}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-[14px] font-bold tabular">{show(lineTotal(line))}</span>
              <button type="button" aria-label={`Edit ${line.description}`} onClick={() => open(index)} className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-surface-secondary hover:text-foreground">
                <PencilSimple size={15} aria-hidden="true" />
              </button>
              <button type="button" aria-label={`Remove ${line.description}`} onClick={() => onRemove(index)} className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger">
                <Trash size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error ? <p className="animate-fade-up text-[12px] font-medium text-danger">{error}</p> : null}

      {items.length > 0 ? (
        <div className="flex items-center justify-between gap-3">
          <AppButton variant="tertiary" size="sm" startContent={<Plus weight="bold" />} label="Add item" onPress={() => open()} />
          <p className="text-[13px] text-muted">
            Subtotal <span key={subtotal.toString()} className="animate-fade-up ml-1 text-[15px] font-bold text-foreground tabular">{show(subtotal)}</span>
          </p>
        </div>
      ) : null}

      {drawer ? (
        <PickerDrawer
          key={drawer.key}
          isOpen
          onOpenChange={(isOpen) => !isOpen && setDrawer(null)}
          title="Add an item"
          items={pickerItems}
          isLoading={catalogue.isPending}
          onSelect={() => undefined}
          searchPlaceholder="Search your products"
          emptyText="No products yet. Add a new item above, and save it to your products for next time."
          createLabel="New item"
          editOnSelect
          formTitle={editing ? "Edit item" : undefined}
          startInForm={editing ? { item: { id: `line-${drawer.editIndex}`, label: editing.description } } : undefined}
          renderCreate={({ initialName, item, done, cancel }) => {
            const picked = item?.id.startsWith("cat-") ? products.find((candidate) => `cat-${candidate.id}` === item.id) : undefined;
            const product = picked ?? (editing?.product_id ? products.find((candidate) => candidate.id === editing.product_id) : undefined);
            const initial: LineItem = editing
              ? editing
              : picked
                ? {
                    description: picked.name,
                    quantity: "1",
                    unit_price: minorToMajor(priceOf(picked), picked.currency_exponent),
                    discount_amount: "",
                    product_id: picked.id,
                    tracks_stock: picked.kind === "stock_tracked",
                  }
                : { description: initialName, quantity: "1", unit_price: "", discount_amount: "" };
            return (
              product ? <VariantLineForm
                workspaceId={workspaceId}
                currency={currency}
                context={context}
                initial={initial}
                product={product}
                isEditing={Boolean(editing)}
                onCancel={editing ? () => setDrawer(null) : cancel}
                onSave={(line) => {
                  if (editing && drawer.editIndex !== undefined) onUpdate(drawer.editIndex, line);
                  else onAdd(line);
                  if (!picked && !editing) void catalogue.refetch();
                  done({ id: "done", label: line.description });
                }}
              /> : <ItemForm
                workspaceId={workspaceId} currency={currency} context={context} initial={initial}
                isEditing={Boolean(editing)} onCancel={editing ? () => setDrawer(null) : cancel}
                onSave={(line) => {
                  if (editing && drawer.editIndex !== undefined) onUpdate(drawer.editIndex, line);
                  else onAdd(line);
                  if (!editing) void catalogue.refetch();
                  done({ id: "done", label: line.description });
                }} />
            );
          }}
        />
      ) : null}
    </div>
  );
}

/** Alias with the pickers naming. */
export { LineItemsEditor as LineItemsField };
