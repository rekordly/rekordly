"use client";

// A product's Stock tab: how many it has in each outlet, every movement with its reason,
// and the four things you do with stock by hand: add, remove, move and count.
// Sales, invoices and purchases move stock on their own; they show up in the history.

import { ArrowsLeftRight, ClipboardText, Minus, Plus, Warehouse } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { AppInput } from "@/components/ui/app-input";
import { AppRowActions, type ActionMenuItem } from "@/components/ui/app-row-actions";
import { AppSelect } from "@/components/ui/app-select";
import { ChoiceCards } from "@/components/ui/form-kit";
import { FormDrawer } from "@/components/ui/form-drawer";
import { MoneyInput } from "@/components/ui/money-input";
import { EmptyState } from "@/components/ui/page";
import { stockNumber, toMinor, useOutlets } from "@/components/pickers";
import { useFinanceAction } from "@/components/features/finance/shared";
import { formatDate } from "@/lib/format";
import { financeApi, formatMinorAmount } from "@/lib/money";
import { productKeys, productsApi } from "@/lib/products";
import type { StockTransfer } from "@/types/finance";
import type { ProductDetail, ProductStockChange, StockAddReason, StockRemoveReason } from "@/types/products";

type Action = "add" | "remove" | "move" | "count" | null;

const ADD_REASONS: { key: StockAddReason; label: string; description: string }[] = [
  { key: "restock", label: "New stock", description: "Bought or made, not recorded as a purchase" },
  { key: "found", label: "Found extra", description: "More than the system shows" },
  { key: "correction", label: "Correction", description: "Fixing a wrong number" },
];

const REMOVE_REASONS: { key: StockRemoveReason; label: string; description: string }[] = [
  { key: "damage", label: "Damaged", description: "Broken or spoiled" },
  { key: "lost", label: "Lost or stolen", description: "Missing from the shelf" },
  { key: "expired", label: "Expired", description: "Past its date" },
  { key: "internal_use", label: "Used in the business", description: "Not sold" },
  { key: "correction", label: "Correction", description: "Fixing a wrong number" },
  { key: "other", label: "Other", description: "Say why in the note" },
];

const isQuantity = (value: string) => /^\d+(\.\d{1,4})?$/.test(value) && Number(value) > 0;

function minorToMajor(minor: string, exponent: number) {
  const value = BigInt(minor || "0");
  const base = BigInt(10 ** exponent);
  return `${value / base}.${(value % base).toString().padStart(exponent, "0")}`.replace(/\.00$/, "");
}

export function ProductStockHistory({ workspaceId, detail }: { workspaceId: number; detail: ProductDetail }) {
  const { product } = detail;
  const unit = product.unit_name.replace(/ \(.*\)/, "").toLowerCase() || "pc";
  const history = useQuery({ queryKey: productKeys.stock(workspaceId, product.id), queryFn: () => productsApi.stockMovements(workspaceId, product.id) });

  return (
    <section className="animate-fade-up rounded-2xl border border-border bg-surface">
      <div className="px-5 pt-5">
        <h2 className="text-[15px] font-semibold">Stock movements</h2>
        <p className="mt-0.5 text-[12px] text-muted">Sales, purchases and changes by hand</p>
      </div>
      <div className="scroll-thin max-h-[520px] overflow-y-auto px-5 pt-2 pb-4">
        {history.isPending ? (
          <div className="h-24 animate-pulse rounded-xl bg-default" />
        ) : (history.data ?? []).length === 0 ? (
          <p className="text-[13px] text-muted">No stock movements yet. Add stock, or record a purchase with this product.</p>
        ) : (
          <ul className="divide-y divide-separator">
            {(history.data ?? []).map((movement) => {
              const delta = Number(movement.quantity_delta);
              const variantLabel = movement.variant_name && movement.variant_name !== "Default" ? movement.variant_name : "";
              const sourceHref =
                movement.source_type === "invoice" && movement.source_id
                  ? "/invoices"
                  : movement.source_type === "sale"
                    ? "/sales"
                    : movement.source_type === "purchase"
                      ? "/purchases"
                      : undefined;
              return (
                <li key={movement.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className={`grid size-9 shrink-0 place-items-center rounded-lg text-[13px] font-bold tabular ${delta < 0 ? "bg-secondary/12 text-secondary" : "bg-primary-soft text-primary-soft-foreground"}`}>
                      {delta < 0 ? "−" : "+"}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium">
                        {movement.summary}
                        {variantLabel ? <span className="font-normal text-muted"> · {variantLabel}</span> : null}
                        {movement.party ? <span className="font-normal text-muted"> · {movement.party}</span> : null}
                      </span>
                      <span className="block truncate text-[12px] text-muted">
                        {formatDate(movement.occurred_on)} · {movement.location_name}
                        {movement.reference ? (
                          <>
                            {" · "}
                            {sourceHref ? (
                              <Link href={sourceHref} className="hover:underline">
                                {movement.reference}
                              </Link>
                            ) : (
                              movement.reference
                            )}
                          </>
                        ) : null}
                      </span>
                    </span>
                  </span>
                  <span className={`shrink-0 text-right text-[14px] font-semibold tabular ${delta < 0 ? "text-secondary" : "text-primary"}`}>
                    {delta > 0 ? "+" : "−"}
                    {stockNumber(String(Math.abs(delta)))} {unit}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

export function ProductStockPanel({ workspaceId, detail }: { workspaceId: number; detail: ProductDetail }) {
  const { product } = detail;
  const stock = detail.stock ?? [];
  const variantStock = detail.variant_stock ?? [];
  const activeVariants = (detail.variants ?? []).filter((variant) => !variant.is_default && !variant.archived_at && variant.is_active !== false);
  const hasVariants = activeVariants.length > 0;

  const unit = product.unit_name.replace(/ \(.*\)/, "").toLowerCase() || "pc";
  const money = (minor: string | bigint) => formatMinorAmount(minor.toString(), product.currency, product.currency_exponent);
  const outlets = useOutlets(workspaceId);
  const activeOutlets = (outlets.data ?? []).filter((outlet) => outlet.is_active !== false);
  const mainOutlet = activeOutlets.find((outlet) => outlet.is_default) ?? activeOutlets[0];

  const [action, setAction] = useState<Action>(null);
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [addReason, setAddReason] = useState<StockAddReason>("restock");
  const [removeReason, setRemoveReason] = useState<StockRemoveReason>("damage");
  const [unitCost, setUnitCost] = useState("");
  const [outletId, setOutletId] = useState("");
  const [toOutletId, setToOutletId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const chosenOutlet = Number(outletId) || mainOutlet?.id;
  const chosenVariantId = hasVariants ? Number(variantId) || activeVariants[0]?.id : undefined;

  const onHandAt = (locationId?: number, varId?: number) => {
    if (hasVariants && varId) {
      return Number(variantStock.find((line) => line.location_id === locationId && line.variant_id === varId)?.quantity_on_hand ?? 0);
    }
    return Number(stock.find((line) => line.location_id === locationId)?.quantity_on_hand ?? 0);
  };

  const totalQty = stock.reduce((sum, line) => sum + Number(line.quantity_on_hand), 0);
  const totalValue = stock.reduce((sum, line) => sum + BigInt(line.value_on_hand_minor), BigInt(0));

  const open = (next: Action) => {
    const firstVariant = activeVariants[0];
    setAction(next);
    setVariantId(firstVariant ? String(firstVariant.id) : "");
    setQuantity("");
    setUnitCost(minorToMajor(firstVariant ? firstVariant.cost_price_minor : product.cost_price_minor, product.currency_exponent));
    setOutletId(mainOutlet ? String(mainOutlet.id) : "");
    setToOutletId(activeOutlets.find((outlet) => outlet.id !== mainOutlet?.id)?.id.toString() ?? "");
    setNote("");
    setError("");
  };

  const change = useFinanceAction(
    workspaceId,
    (body: ProductStockChange, key: string) => productsApi.changeStock(workspaceId, product.id, body, key),
    { success: "Stock updated", onDone: () => setAction(null) },
  );

  const move = useFinanceAction(
    workspaceId,
    async (_: void, key: string) => {
      const created = await financeApi.createStockTransfer(
        workspaceId,
        {
          source_location_id: Number(outletId),
          destination_location_id: Number(toOutletId),
          notes: note || undefined,
          lines: [{ product_id: product.id, variant_id: chosenVariantId, quantity_requested: quantity }],
        },
        key,
      );
      const transfer = (created as { transfer: StockTransfer }).transfer;
      const today = new Date().toISOString().slice(0, 10);
      await financeApi.dispatchStockTransfer(workspaceId, transfer.id, { occurred_on: today });
      const line = transfer.lines?.[0];
      if (line) await financeApi.receiveStockTransfer(workspaceId, transfer.id, { occurred_on: today, lines: [{ line_id: line.id, quantity_received: quantity }] });
    },
    { success: "Stock moved", onDone: () => setAction(null) },
  );

  const submit = () => {
    if (hasVariants && !chosenVariantId) return setError("Choose which variant first");
    if (action === "count") {
      if (!/^\d+(\.\d{1,4})?$/.test(quantity)) return setError("Enter how many you counted");
      const difference = Number(quantity) - onHandAt(chosenOutlet, chosenVariantId);
      if (difference === 0) return setAction(null);
      return change.mutate({
        variant_id: chosenVariantId,
        direction: difference > 0 ? "add" : "remove",
        quantity: String(Math.abs(Math.round(difference * 10000) / 10000)),
        reason: "correction",
        outlet_id: chosenOutlet,
        note: note || `Counted ${quantity} ${unit}`,
      });
    }
    if (!isQuantity(quantity)) return setError("Enter a quantity above zero");
    if (action === "add") {
      if (addReason === "restock" && toMinor(unitCost) <= BigInt(0)) return setError("Enter what each one cost");
      return change.mutate({
        variant_id: chosenVariantId,
        direction: "add",
        quantity,
        reason: addReason,
        unit_cost: addReason === "restock" ? unitCost.replace(/,/g, "") : undefined,
        outlet_id: chosenOutlet,
        note: note || undefined,
      });
    }
    if (action === "remove") {
      if (Number(quantity) > onHandAt(chosenOutlet, chosenVariantId)) return setError(`Only ${stockNumber(String(onHandAt(chosenOutlet, chosenVariantId)))} ${unit} here`);
      return change.mutate({ direction: "remove", variant_id: chosenVariantId, quantity, reason: removeReason, outlet_id: chosenOutlet, note: note || undefined });
    }
    if (action === "move") {
      if (!toOutletId || toOutletId === outletId) return setError("Choose a different outlet to move to");
      if (Number(quantity) > onHandAt(Number(outletId), chosenVariantId)) return setError(`Only ${stockNumber(String(onHandAt(Number(outletId), chosenVariantId)))} ${unit} there`);
      return move.mutate();
    }
  };

  if (product.kind !== "stock_tracked") {
    return (
      <section className="rounded-2xl border border-border bg-surface">
        <EmptyState
          icon={Warehouse}
          title="Stock is not counted for this product"
          description="Change its type to “Product with stock” to count it, and sales and purchases will update it."
          action={
            <Link href={`/products/${product.id}/edit`} className="text-[14px] font-semibold text-primary hover:underline">
              Edit product
            </Link>
          }
        />
      </section>
    );
  }

  const outletField = (label: string, value: string, onChange: (key: string) => void) =>
    activeOutlets.length > 1 ? (
      <AppSelect
        label={label}
        options={activeOutlets.map((outlet) => ({ key: String(outlet.id), label: `${outlet.name} · ${stockNumber(String(onHandAt(outlet.id, chosenVariantId)))} ${unit}` }))}
        selectedKey={value}
        onSelectionChange={onChange}
      />
    ) : null;

  const titles: Record<Exclude<Action, null>, { title: string; description: string; submit: string }> = {
    add: { title: "Add stock", description: `How many ${unit} came in, and why.`, submit: "Add stock" },
    remove: { title: "Remove stock", description: `How many ${unit} went out without a sale, and why.`, submit: "Remove stock" },
    move: { title: "Move stock", description: "From one outlet to another.", submit: "Move stock" },
    count: { title: "Count stock", description: "Enter what is really on the shelf. We fix the difference.", submit: "Save count" },
  };

  const stockActions: ActionMenuItem[] = [
    { key: "add", label: "Add stock", icon: <Plus size={15} weight="bold" />, onClick: () => open("add") },
    { key: "remove", label: "Remove stock", icon: <Minus size={15} weight="bold" />, onClick: () => open("remove"), disabled: totalQty <= 0 },
    { key: "move", label: "Move between outlets", icon: <ArrowsLeftRight size={15} />, onClick: () => open("move"), disabled: totalQty <= 0 || activeOutlets.length < 2 },
    { key: "count", label: "Count stock", icon: <ClipboardText size={15} />, onClick: () => open("count") },
  ];

  const outletRows = activeOutlets.map((outlet) => {
    const line = stock.find((item) => item.location_id === outlet.id);
    return { outlet, qty: Number(line?.quantity_on_hand ?? 0), value: line?.value_on_hand_minor ?? "0" };
  });

  const mainBadge = <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary-soft-foreground">Main</span>;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-12">
      <section className="animate-fade-up overflow-hidden rounded-2xl border border-border bg-surface lg:col-span-8">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold">Stock by outlet</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              <span className="font-semibold text-foreground tabular">
                {stockNumber(String(totalQty))} {unit}
              </span>{" "}
              in stock{hasVariants ? ` across ${activeVariants.length} variants` : ""}, worth <span className="font-semibold text-foreground tabular">{money(totalValue)}</span> at cost
            </p>
          </div>
          <AppRowActions ariaLabel="Stock actions" size="md" items={stockActions} />
        </div>

        {/* Table from tablet up */}
        <div className="hidden border-t border-separator md:block">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="bg-surface-secondary/60 text-left text-[12px] text-muted">
                <th className="px-5 py-2.5 font-medium">Outlet</th>
                <th className="px-5 py-2.5 text-right font-medium">In stock</th>
                <th className="px-5 py-2.5 text-right font-medium">Value at cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-separator">
              {outletRows.map(({ outlet, qty, value }) => {
                const perVariant = hasVariants ? variantStock.filter((line) => line.location_id === outlet.id && Number(line.quantity_on_hand) > 0) : [];
                return (
                  <tr key={outlet.id} className="transition-colors hover:bg-surface-secondary/40">
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{outlet.name}</span>
                        {outlet.is_default ? mainBadge : null}
                      </span>
                      {perVariant.length > 0 ? (
                        <span className="mt-1 flex flex-wrap gap-1.5 text-[12px] text-muted">
                          {perVariant.map((line) => {
                            const variantName = activeVariants.find((v) => v.id === line.variant_id)?.name;
                            return variantName ? (
                              <span key={line.variant_id} className="rounded-full bg-surface-secondary px-2 py-0.5 tabular">
                                {variantName}: {stockNumber(line.quantity_on_hand)}
                              </span>
                            ) : null;
                          })}
                        </span>
                      ) : null}
                    </td>
                    <td className={`px-5 py-3 text-right font-semibold tabular ${qty <= 0 ? "text-muted" : ""}`}>
                      {stockNumber(String(qty))} {unit}
                    </td>
                    <td className="px-5 py-3 text-right tabular text-muted">{money(value)}</td>
                  </tr>
                );
              })}
            </tbody>
            {outletRows.length > 1 ? (
              <tfoot>
                <tr className="border-t border-separator bg-surface-secondary/40">
                  <td className="px-5 py-3 text-[13px] font-semibold">Total</td>
                  <td className="px-5 py-3 text-right font-bold tabular">
                    {stockNumber(String(totalQty))} {unit}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold tabular">{money(totalValue)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        {/* Cards on phones */}
        <ul className="divide-y divide-separator border-t border-separator md:hidden">
          {outletRows.map(({ outlet, qty, value }) => (
            <li key={outlet.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[14px] font-medium">
                  <span className="truncate">{outlet.name}</span>
                  {outlet.is_default ? mainBadge : null}
                </span>
                <span className="block text-[12px] text-muted tabular">{money(value)}</span>
              </span>
              <span className={`shrink-0 text-[14px] font-semibold tabular ${qty <= 0 ? "text-muted" : ""}`}>
                {stockNumber(String(qty))} {unit}
              </span>
            </li>
          ))}
        </ul>

        {outletRows.length === 0 ? <p className="border-t border-separator px-5 py-6 text-[13px] text-muted">Your main outlet is created the first time you add stock.</p> : null}
      </section>

      <div className="lg:col-span-4">
        <ProductStockHistory workspaceId={workspaceId} detail={detail} />
      </div>

      {action ? (
        <FormDrawer
          isOpen
          onOpenChange={(isOpen) => !isOpen && setAction(null)}
          title={titles[action].title}
          description={titles[action].description}
          submitLabel={titles[action].submit}
          isSubmitting={change.isPending || move.isPending}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {hasVariants ? (
            <AppSelect
              label="Which variant?"
              options={activeVariants.map((variant) => ({
                key: String(variant.id),
                label: `${variant.name} · ${stockNumber(variant.quantity_on_hand)} ${unit}`,
              }))}
              selectedKey={String(chosenVariantId ?? "")}
              onSelectionChange={(key) => {
                setVariantId(key);
                setError("");
                const picked = activeVariants.find((variant) => String(variant.id) === key);
                if (picked && action === "add") {
                  setUnitCost(minorToMajor(picked.cost_price_minor, product.currency_exponent));
                }
              }}
            />
          ) : null}

          {action === "add" ? <ChoiceCards<StockAddReason> label="Why?" options={ADD_REASONS} value={addReason} onChange={setAddReason} /> : null}
          {action === "remove" ? (
            <AppSelect label="Why?" options={REMOVE_REASONS} selectedKey={removeReason} onSelectionChange={(key) => setRemoveReason(key as StockRemoveReason)} />
          ) : null}

          {action === "move" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {outletField("From", outletId, setOutletId)}
              {outletField("To", toOutletId, setToOutletId)}
            </div>
          ) : (
            outletField(action === "count" ? "Outlet counted" : "Outlet", outletId, setOutletId)
          )}

          <AppInput
            label={action === "count" ? "How many are there?" : "Quantity"}
            isRequired
            autoFocus
            inputMode="decimal"
            placeholder="0"
            value={quantity}
            onChange={(event) => {
              setQuantity(event.target.value.replace(/[^\d.]/g, ""));
              setError("");
            }}
            endContent={<span className="text-[13px] text-muted">{unit}</span>}
            errorMessage={error || undefined}
            description={
              action === "count"
                ? `The system shows ${stockNumber(String(onHandAt(chosenOutlet, chosenVariantId)))} ${unit} here.`
                : action === "add"
                  ? undefined
                  : `${stockNumber(String(onHandAt(action === "move" ? Number(outletId) : chosenOutlet, chosenVariantId)))} ${unit} available.`
            }
          />

          {action === "add" && addReason === "restock" ? (
            <MoneyInput
              label="Cost per unit"
              isRequired
              currency={product.currency}
              exponent={product.currency_exponent}
              value={unitCost}
              onValueChange={setUnitCost}
              description="Used to value your stock and work out profit."
            />
          ) : null}

          {action === "add" && addReason === "restock" ? (
            <p className="rounded-xl bg-surface-secondary p-3 text-[12px] text-muted">
              Bought it from a supplier? Record a{" "}
              <Link href="/purchases/new" className="font-semibold text-primary hover:underline">
                purchase
              </Link>{" "}
              instead, so what you paid is in your books too.
            </p>
          ) : null}

          <AppInput label="Note" placeholder="Optional" value={note} onChange={(event) => setNote(event.target.value)} />
        </FormDrawer>
      ) : null}
    </div>
  );
}
