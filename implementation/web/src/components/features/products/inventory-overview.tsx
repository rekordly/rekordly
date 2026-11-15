"use client";

// Inventory: an overview of stock across all products, plus the two jobs that cover many
// products at once — counting a shelf and managing outlets. Adding, removing and moving
// stock for one product happens on that product's Stock tab.

import { ClipboardText, Coins, Cube, Plus, Star, Storefront, Warehouse, WarningCircle } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppRowActions } from "@/components/ui/app-row-actions";
import { AppSelect } from "@/components/ui/app-select";
import { KpiCard } from "@/components/ui/cards";
import { DataView } from "@/components/ui/data-view";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader, Segmented, StatusPill } from "@/components/ui/page";
import { stockNumber, useOutlets } from "@/components/pickers";
import { KpiRow } from "@/components/features/finance/dashboard-parts";
import { useFinanceAction, WorkspaceGate, type WorkspaceInfo } from "@/components/features/finance/shared";
import { createIdempotencyKey } from "@/lib/utils";
import { financeApi, formatMinorAmount, moneyKeys } from "@/lib/money";
import { productKeys, productsApi } from "@/lib/products";
import type { InventoryOutlet } from "@/types/finance";
import type { Product } from "@/types/products";

interface StockRow {
  product: Product;
  quantity: number;
  valueMinor: bigint;
}

interface OutletRow {
  outlet: InventoryOutlet;
  productsInStock: number;
  valueMinor: bigint;
}

const outletTypeLabel = (type: InventoryOutlet["location_type"]) => (type === "warehouse" ? "Warehouse" : type === "other" ? "Other" : "Shop");

const unitOf = (product: Product) => product.unit_name.replace(/ \(.*\)/, "").toLowerCase() || "pc";

function CountDrawer({ workspaceId, rows, outletId, outletName, onClose }: { workspaceId: number; rows: StockRow[]; outletId?: number; outletName: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const changed = rows.filter((row) => counts[row.product.id] !== undefined && counts[row.product.id] !== "" && Number(counts[row.product.id]) !== row.quantity);

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      for (const row of changed) {
        const difference = Number(counts[row.product.id]) - row.quantity;
        await productsApi.changeStock(
          workspaceId,
          row.product.id,
          {
            direction: difference > 0 ? "add" : "remove",
            quantity: String(Math.abs(Math.round(difference * 10000) / 10000)),
            reason: "correction",
            outlet_id: outletId,
            note: `Stock count: ${counts[row.product.id]} ${unitOf(row.product)}`,
          },
          createIdempotencyKey("count"),
        );
      }
      await queryClient.invalidateQueries({ queryKey: moneyKeys.workspace(workspaceId) });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the count");
      await queryClient.invalidateQueries({ queryKey: moneyKeys.workspace(workspaceId) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDrawer
      isOpen
      size="lg"
      onOpenChange={(open) => !open && onClose()}
      title="Count stock"
      description={`Enter what is on the shelf in ${outletName}. Leave a product blank to skip it.`}
      submitLabel={changed.length ? `Save ${changed.length} change${changed.length === 1 ? "" : "s"}` : "Save count"}
      isSubmitting={busy}
      onSubmit={(event) => {
        event.preventDefault();
        if (!changed.length) return onClose();
        void save();
      }}
    >
      {rows.length === 0 ? <p className="text-[13px] text-muted">No products with stock yet.</p> : null}
      <ul className="divide-y divide-separator">
        {rows.map((row) => {
          const value = counts[row.product.id] ?? "";
          const difference = value === "" ? 0 : Number(value) - row.quantity;
          const hasVariants = (row.product.variant_count ?? 1) > 1;
          return (
            <li key={row.product.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-medium">{row.product.name}</span>
                <span className="block text-[12px] text-muted">
                  System: {stockNumber(String(row.quantity))} {unitOf(row.product)}
                  {hasVariants ? ` · ${row.product.variant_count} variants` : ""}
                  {difference !== 0 ? (
                    <span className={`ml-1.5 font-semibold ${difference < 0 ? "text-secondary" : "text-primary"}`}>
                      {difference > 0 ? "+" : "−"}
                      {stockNumber(String(Math.abs(difference)))}
                    </span>
                  ) : null}
                </span>
              </span>
              {hasVariants ? (
                <Link href={`/products/${row.product.id}`} onClick={onClose} className="shrink-0 text-[12px] font-semibold text-primary hover:underline">
                  Count variants →
                </Link>
              ) : (
                <input
                  aria-label={`Counted ${row.product.name}`}
                  inputMode="decimal"
                  placeholder={stockNumber(String(row.quantity))}
                  value={value}
                  onChange={(event) => setCounts({ ...counts, [row.product.id]: event.target.value.replace(/[^\d.]/g, "") })}
                  className="field-shell h-10 w-24 shrink-0 px-3 text-right text-[14px] font-semibold tabular outline-none"
                />
              )}
            </li>
          );
        })}
      </ul>
      {error ? <p className="animate-fade-up text-[12px] font-medium text-danger">{error}</p> : null}
    </FormDrawer>
  );
}

function OutletDrawer({ workspaceId, onClose }: { workspaceId: number; onClose: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("outlet");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const create = useFinanceAction(
    workspaceId,
    () => financeApi.createOutlet(workspaceId, { name: name.trim(), location_type: type, code: code.trim() || undefined, address: address.trim() || undefined }),
    { success: "Outlet added", onDone: onClose },
  );
  return (
    <FormDrawer
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title="Add an outlet"
      description="A shop, branch or warehouse where you keep stock."
      submitLabel="Add outlet"
      isSubmitting={create.isPending}
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return setError("Name the outlet");
        create.mutate(undefined);
      }}
    >
      <AppInput label="Name" isRequired autoFocus placeholder="e.g. Lekki shop" value={name} onChange={(event) => { setName(event.target.value); setError(""); }} errorMessage={error || undefined} />
      <AppSelect
        label="Type"
        options={[
          { key: "outlet", label: "Shop", description: "Where you sell" },
          { key: "warehouse", label: "Warehouse", description: "Where you keep stock" },
          { key: "other", label: "Other" },
        ]}
        selectedKey={type}
        onSelectionChange={setType}
      />
      <AppInput label="Code" placeholder="Leave blank to create one" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} description="A short code like LEKSHO. We make one from the name if you leave this empty." />
      <AppInput label="Address" placeholder="Optional" value={address} onChange={(event) => setAddress(event.target.value)} />
    </FormDrawer>
  );
}

function InventoryContent({ workspaceId, currency }: WorkspaceInfo) {
  const [tab, setTab] = useState<"stock" | "outlets">("stock");
  const [outletFilter, setOutletFilter] = useState("");
  const [counting, setCounting] = useState(false);
  const [addingOutlet, setAddingOutlet] = useState(false);
  const productFilter = { kind: "stock_tracked" as const };
  const products = useQuery({ queryKey: productKeys.list(workspaceId, productFilter), queryFn: () => productsApi.list(workspaceId, productFilter) });
  const balances = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "inventory-balances"], queryFn: () => financeApi.listInventoryBalances(workspaceId) });
  const outlets = useOutlets(workspaceId);
  const activeOutlets = (outlets.data ?? []).filter((outlet) => outlet.is_active !== false);
  const mainOutlet = activeOutlets.find((outlet) => outlet.is_default) ?? activeOutlets[0];
  const money = (minor: bigint) => formatMinorAmount(minor.toString(), currency, 2);

  const outletId = outletFilter ? Number(outletFilter) : undefined;
  const rows: StockRow[] = (products.data ?? [])
    .filter((product) => product.status !== "archived")
    .map((product) => {
      const lines = (balances.data ?? []).filter((line) => line.product_id === product.id && (outletId === undefined || line.location_id === outletId));
      return {
        product,
        quantity: lines.reduce((sum, line) => sum + Number(line.quantity_on_hand), 0),
        valueMinor: lines.reduce((sum, line) => sum + BigInt(line.value_on_hand_minor), BigInt(0)),
      };
    });

  const makeMain = useFinanceAction(workspaceId, (id: number) => financeApi.updateOutlet(workspaceId, id, { is_default: true }), {
    success: "Main outlet changed",
  });
  const outletMenu = (outlet: InventoryOutlet) => (
    <AppRowActions
      ariaLabel={`Actions for ${outlet.name}`}
      items={[{ key: "main", label: "Make main outlet", icon: <Star size={15} />, onClick: () => makeMain.mutate(outlet.id), disabled: outlet.is_default }]}
    />
  );

  const outletRows: OutletRow[] = activeOutlets.map((outlet) => {
    const lines = (balances.data ?? []).filter((line) => line.location_id === outlet.id);
    return {
      outlet,
      productsInStock: lines.filter((line) => Number(line.quantity_on_hand) > 0).length,
      valueMinor: lines.reduce((sum, line) => sum + BigInt(line.value_on_hand_minor), BigInt(0)),
    };
  });

  const totalValue = rows.reduce((sum, row) => sum + row.valueMinor, BigInt(0));
  const inStock = rows.filter((row) => row.quantity > 0).length;
  const outOfStock = rows.length - inStock;
  const countOutlet = outletId ? activeOutlets.find((outlet) => outlet.id === outletId) : mainOutlet;
  const countRows: StockRow[] = (products.data ?? [])
    .filter((product) => product.status !== "archived")
    .map((product) => {
      const line = (balances.data ?? []).find((item) => item.product_id === product.id && item.location_id === countOutlet?.id);
      return { product, quantity: Number(line?.quantity_on_hand ?? 0), valueMinor: BigInt(line?.value_on_hand_minor ?? "0") };
    });

  return (
    <Page>
      <PageHeader
        title="Inventory"
        description="How much stock you have, where it is, and what it is worth. Open a product to add, remove or move its stock."
        actions={
          <>
            <AppButton variant="secondary" startContent={<Storefront />} label="Add outlet" onPress={() => setAddingOutlet(true)} />
            <AppButton startContent={<ClipboardText />} label="Count stock" onPress={() => setCounting(true)} />
          </>
        }
      />

      <KpiRow className="xl:grid-cols-4">
        <KpiCard loading={balances.isPending} tone="accent" icon={Coins} label="Stock value" value={money(totalValue)} hint="At what it cost you" />
        <KpiCard loading={products.isPending} icon={Cube} label="In stock" value={String(inStock)} hint={`of ${rows.length} products with stock`} />
        <KpiCard loading={products.isPending} icon={WarningCircle} label="Out of stock" value={String(outOfStock)} hint={outOfStock ? "Need restocking" : "Everything in stock"} />
        <KpiCard loading={outlets.isPending} icon={Storefront} label="Outlets" value={String(activeOutlets.length || 1)} hint={activeOutlets.length > 1 ? "Where you keep stock" : "One place for now"} />
      </KpiRow>

      <Segmented
        aria-label="Inventory sections"
        options={[
          { key: "stock", label: "Stock levels" },
          { key: "outlets", label: "Outlets" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "stock" ? (
        <DataView<StockRow>
          title="Stock levels"
          selectable={false}
          rows={rows}
          rowKey={(row) => row.product.id}
          isLoading={products.isPending || balances.isPending}
          isError={products.isError || balances.isError}
          searchPlaceholder="Search products"
          getSearchText={(row) => `${row.product.name} ${row.product.sku ?? ""}`}
          filters={
            activeOutlets.length > 1 ? (
              <FilterDropdown label="Outlet" options={[{ key: "", label: "All" }, ...activeOutlets.map((outlet) => ({ key: String(outlet.id), label: outlet.name }))]} value={outletFilter} onChange={setOutletFilter} />
            ) : undefined
          }
          empty={
            <EmptyState
              icon={Warehouse}
              title="No products with stock yet"
              description="Add a product with the type “Product with stock”, then record a purchase or add stock to it."
              action={
                <Link href="/products/new" className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-[14px] font-medium text-accent-foreground">
                  <Plus size={16} aria-hidden="true" />
                  Add product
                </Link>
              }
            />
          }
          columns={[
            {
              key: "product",
              label: "Product",
              render: (row) => (
                <Link href={`/products/${row.product.id}`} className="font-medium hover:underline">
                  {row.product.name}
                  <span className="block text-[12px] font-normal text-muted">
                    {[row.product.sku, (row.product.variant_count ?? 1) > 1 ? `Across ${row.product.variant_count} variants` : null].filter(Boolean).join(" · ")}
                  </span>
                </Link>
              ),
            },
            {
              key: "qty",
              label: "In stock",
              align: "right",
              render: (row) =>
                row.quantity > 0 ? (
                  <span className="font-semibold tabular">
                    {stockNumber(String(row.quantity))} {unitOf(row.product)}
                  </span>
                ) : (
                  <StatusPill tone="warning">Out of stock</StatusPill>
                ),
            },
            { key: "cost", label: "Average cost", align: "right", render: (row) => <span className="tabular text-muted">{row.quantity > 0 ? money(row.valueMinor / BigInt(Math.max(1, Math.round(row.quantity)))) : "—"}</span> },
            { key: "value", label: "Value", align: "right", render: (row) => <span className="font-semibold tabular">{money(row.valueMinor)}</span> },
          ]}
          renderCard={(row) => (
            <Link href={`/products/${row.product.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3.5">
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold">{row.product.name}</span>
                <span className="block text-[12px] text-muted">{money(row.valueMinor)}</span>
              </span>
              {row.quantity > 0 ? (
                <span className="shrink-0 text-[14px] font-semibold tabular">
                  {stockNumber(String(row.quantity))} {unitOf(row.product)}
                </span>
              ) : (
                <StatusPill tone="warning">Out of stock</StatusPill>
              )}
            </Link>
          )}
        />
      ) : (
        <DataView<OutletRow>
          title="Outlets"
          selectable={false}
          rows={outletRows}
          rowKey={(row) => row.outlet.id}
          isLoading={outlets.isPending || balances.isPending}
          isError={outlets.isError}
          searchPlaceholder="Search outlets"
          getSearchText={(row) => `${row.outlet.name} ${row.outlet.code ?? ""} ${row.outlet.address ?? ""}`}
          toolbarActions={<AppButton size="sm" variant="secondary" startContent={<Plus weight="bold" />} label="Add outlet" onPress={() => setAddingOutlet(true)} />}
          empty={
            <EmptyState
              icon={Storefront}
              title="No outlets yet"
              description="Your main outlet is created the first time you add stock. Add more shops or warehouses here."
              action={<AppButton startContent={<Plus weight="bold" />} label="Add outlet" onPress={() => setAddingOutlet(true)} />}
            />
          }
          columns={[
            {
              key: "name",
              label: "Outlet",
              render: (row) => (
                <span className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-soft-foreground">
                    {row.outlet.location_type === "warehouse" ? <Warehouse size={16} aria-hidden="true" /> : <Storefront size={16} aria-hidden="true" />}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      {row.outlet.name}
                      {row.outlet.is_default ? <StatusPill tone="success">Main</StatusPill> : null}
                    </span>
                    {row.outlet.address ? <span className="block truncate text-[12px] text-muted">{row.outlet.address}</span> : null}
                  </span>
                </span>
              ),
            },
            { key: "code", label: "Code", render: (row) => <span className="font-mono text-[13px]">{row.outlet.code ?? "—"}</span> },
            { key: "type", label: "Type", render: (row) => outletTypeLabel(row.outlet.location_type) },
            { key: "products", label: "Products in stock", align: "right", render: (row) => <span className="tabular">{row.productsInStock}</span> },
            { key: "value", label: "Stock value", align: "right", render: (row) => <span className="font-semibold tabular">{money(row.valueMinor)}</span> },
            { key: "actions", label: "", align: "right", render: (row) => outletMenu(row.outlet) },
          ]}
          renderCard={(row) => (
            <article className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                    {row.outlet.location_type === "warehouse" ? <Warehouse size={18} aria-hidden="true" /> : <Storefront size={18} aria-hidden="true" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold">{row.outlet.name}</span>
                    <span className="block text-[12px] text-muted">
                      {row.outlet.code ?? "No code"} · {outletTypeLabel(row.outlet.location_type)}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {row.outlet.is_default ? <StatusPill tone="success">Main</StatusPill> : null}
                  {outletMenu(row.outlet)}
                </span>
              </div>
              <p className="mt-4 text-[13px] text-muted">
                Stock worth <span className="font-semibold text-foreground tabular">{money(row.valueMinor)}</span> across {row.productsInStock} products
              </p>
            </article>
          )}
        />
      )}

      {counting ? <CountDrawer workspaceId={workspaceId} rows={countRows} outletId={countOutlet?.id} outletName={countOutlet?.name ?? "your main outlet"} onClose={() => setCounting(false)} /> : null}
      {addingOutlet ? <OutletDrawer workspaceId={workspaceId} onClose={() => setAddingOutlet(false)} /> : null}
    </Page>
  );
}

export function InventoryOverview() {
  return <WorkspaceGate businessOnly>{(workspace) => <InventoryContent key={workspace.workspaceId} {...workspace} />}</WorkspaceGate>;
}
