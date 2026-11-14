"use client";

// A product's Stock tab: how many it has in each outlet, every movement with its reason,
// and the four things you do with stock by hand: add, remove, move and count.
// Sales, invoices and purchases move stock on their own; they show up in the history.

import { ArrowsLeftRight, ClipboardText, Minus, Plus, Warehouse } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
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

export function ProductStockPanel({ workspaceId, detail }: { workspaceId: number; detail: ProductDetail }) {
  const { product } = detail;
  const unit = product.unit_name.replace(/ \(.*\)/, "").toLowerCase() || "pc";
  const money = (minor: string | bigint) => formatMinorAmount(minor.toString(), product.currency, product.currency_exponent);
  const outlets = useOutlets(workspaceId);
  const activeOutlets = (outlets.data ?? []).filter((outlet) => outlet.is_active !== false);
  const mainOutlet = activeOutlets.find((outlet) => outlet.is_default) ?? activeOutlets[0];
  const history = useQuery({ queryKey: productKeys.stock(workspaceId, product.id), queryFn: () => productsApi.stockMovements(workspaceId, product.id) });

  const [action, setAction] = useState<Action>(null);
  const [quantity, setQuantity] = useState("");
  const [addReason, setAddReason] = useState<StockAddReason>("restock");
  const [removeReason, setRemoveReason] = useState<StockRemoveReason>("damage");
  const [unitCost, setUnitCost] = useState("");
  const [outletId, setOutletId] = useState("");
  const [toOutletId, setToOutletId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const onHandAt = (locationId?: number) => Number(detail.stock.find((line) => line.location_id === locationId)?.quantity_on_hand ?? 0);
  const chosenOutlet = Number(outletId) || mainOutlet?.id;
  const totalQty = detail.stock.reduce((sum, line) => sum + Number(line.quantity_on_hand), 0);
  const totalValue = detail.stock.reduce((sum, line) => sum + BigInt(line.value_on_hand_minor), BigInt(0));

  const open = (next: Action) => {
    setAction(next);
    setQuantity("");
    setUnitCost(minorToMajor(product.cost_price_minor, product.currency_exponent));
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
        { source_location_id: Number(outletId), destination_location_id: Number(toOutletId), notes: note || undefined, lines: [{ product_id: product.id, quantity_requested: quantity }] },
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
    if (action === "count") {
      if (!/^\d+(\.\d{1,4})?$/.test(quantity)) return setError("Enter how many you counted");
      const difference = Number(quantity) - onHandAt(chosenOutlet);
      if (difference === 0) return setAction(null);
      return change.mutate({
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
      return change.mutate({ direction: "add", quantity, reason: addReason, unit_cost: addReason === "restock" ? unitCost.replace(/,/g, "") : undefined, outlet_id: chosenOutlet, note: note || undefined });
    }
    if (action === "remove") {
      if (Number(quantity) > onHandAt(chosenOutlet)) return setError(`Only ${stockNumber(String(onHandAt(chosenOutlet)))} ${unit} here`);
      return change.mutate({ direction: "remove", quantity, reason: removeReason, outlet_id: chosenOutlet, note: note || undefined });
    }
    if (action === "move") {
      if (!toOutletId || toOutletId === outletId) return setError("Choose a different outlet to move to");
      if (Number(quantity) > onHandAt(Number(outletId))) return setError(`Only ${stockNumber(String(onHandAt(Number(outletId))))} ${unit} there`);
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
        options={activeOutlets.map((outlet) => ({ key: String(outlet.id), label: `${outlet.name} · ${stockNumber(String(onHandAt(outlet.id)))} ${unit}` }))}
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

  return (
    <div className="space-y-4">
      <section className="animate-fade-up rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[13px] text-muted">In stock</p>
            <p className="text-[28px] leading-tight font-bold tabular">
              {stockNumber(String(totalQty))} <span className="text-[15px] font-medium text-muted">{unit}</span>
            </p>
            <p className="text-[13px] text-muted">Worth {money(totalValue)} at cost</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AppButton startContent={<Plus weight="bold" />} label="Add stock" onPress={() => open("add")} />
            <AppButton variant="secondary" startContent={<Minus weight="bold" />} label="Remove" onPress={() => open("remove")} isDisabled={totalQty <= 0} />
            {activeOutlets.length > 1 ? <AppButton variant="secondary" startContent={<ArrowsLeftRight />} label="Move" onPress={() => open("move")} isDisabled={totalQty <= 0} /> : null}
            <AppButton variant="ghost" startContent={<ClipboardText />} label="Count" onPress={() => open("count")} />
          </div>
        </div>

        {detail.stock.length > 1 || activeOutlets.length > 1 ? (
          <ul className="mt-4 divide-y divide-separator border-t border-separator">
            {activeOutlets.map((outlet) => {
              const line = detail.stock.find((item) => item.location_id === outlet.id);
              return (
                <li key={outlet.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="text-[14px] font-medium">
                    {outlet.name}
                    {outlet.is_default ? <span className="ml-1.5 text-[12px] text-muted">main</span> : null}
                  </span>
                  <span className="text-right text-[13px] tabular">
                    <span className="block font-semibold">
                      {stockNumber(line?.quantity_on_hand)} {unit}
                    </span>
                    <span className="block text-[12px] text-muted">{money(line?.value_on_hand_minor ?? "0")}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <section className="animate-fade-up rounded-2xl border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 px-5 pt-5">
          <h2 className="text-[15px] font-semibold">Stock history</h2>
          <span className="text-[12px] text-muted">Sales, purchases and changes by hand</span>
        </div>
        <div className="p-5">
          {history.isPending ? (
            <div className="h-24 animate-pulse rounded-xl bg-default" />
          ) : (history.data ?? []).length === 0 ? (
            <p className="text-[13px] text-muted">No stock movements yet. Add stock, or record a purchase with this product.</p>
          ) : (
            <ul className="divide-y divide-separator">
              {(history.data ?? []).map((movement) => {
                const delta = Number(movement.quantity_delta);
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
                ? `The system shows ${stockNumber(String(onHandAt(chosenOutlet)))} ${unit} here.`
                : action === "add"
                  ? undefined
                  : `${stockNumber(String(onHandAt(action === "move" ? Number(outletId) : chosenOutlet)))} ${unit} available.`
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
