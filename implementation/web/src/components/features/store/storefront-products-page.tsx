"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppSwitch } from "@/components/ui/app-switch";
import { DataView } from "@/components/ui/data-view";
import { Page, PageHeader } from "@/components/ui/page";
import { WorkspaceGate } from "@/components/features/finance/shared";
import { financeApi, formatMinorAmount, moneyKeys } from "@/lib/money";
import { createIdempotencyKey } from "@/lib/utils";
import type { StorefrontProductCard } from "@/types/finance";

function ProductsContent({ workspaceId, currency }: { workspaceId: number; currency: string }) {
  const [filter, setFilter] = useState("");
  const [collectionId, setCollectionId] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const client = useQueryClient();
  const key = [...moneyKeys.workspace(workspaceId), "storefront-products", filter, collectionId];
  const query = useQuery({ queryKey: key, queryFn: () => financeApi.listStorefrontProductCards(workspaceId, { filter, collection_id: collectionId || undefined }) });
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => financeApi.bulkChangeStorefrontProducts(workspaceId, { ...body, idempotency_key: createIdempotencyKey("store-products") }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: [...moneyKeys.workspace(workspaceId), "storefront-products"] }); },
  });
  const rows = query.data?.products ?? [];
  const update = async (row: StorefrontProductCard, field: "show_on_store" | "is_featured", value: boolean) => {
    await financeApi.changeStorefrontProduct(workspaceId, row.id, { [field]: value, idempotency_key: createIdempotencyKey("store-product") });
    await client.invalidateQueries({ queryKey: [...moneyKeys.workspace(workspaceId), "storefront-products"] });
  };
  return <Page><PageHeader title="Store products" description="Choose which products shoppers can see." />
    <DataView title="Store products" rows={rows} rowKey={(r) => r.id}
      columns={[
        { key: "name", label: "Product", render: (r) => <span className="font-medium">{r.name}</span>, sortValue: (r) => r.name },
        { key: "price", label: "Price", align: "right", render: (r) => formatMinorAmount(r.price_minor, currency, 2) },
        { key: "variants", label: "Variants", render: (r) => String(r.variant_count) },
        { key: "stock", label: "Stock", render: (r) => r.in_stock ? "In stock" : "Out of stock" },
        { key: "collections", label: "Collections", render: (r) => (query.data?.collections ?? []).filter((collection) => r.collection_ids.includes(collection.id)).map((collection) => collection.name).join(", ") || "—" },
        { key: "visible", label: "On store", render: (r) => <AppSwitch isSelected={r.show_on_store} onChange={(v) => void update(r, "show_on_store", v)} aria-label={`Show ${r.name} on store`} /> },
        { key: "featured", label: "Featured", render: (r) => <AppSwitch isSelected={r.is_featured} onChange={(v) => void update(r, "is_featured", v)} aria-label={`Feature ${r.name}`} /> },
      ]}
      renderCard={(r) => <article className="flex items-center gap-3 p-3"><div className="min-w-0 flex-1"><div className="truncate font-semibold">{r.name}</div><div className="text-sm text-muted">{formatMinorAmount(r.price_minor, currency, 2)} · {r.in_stock ? "In stock" : "Out of stock"}</div><div className="mt-1 text-xs text-muted">{(query.data?.collections ?? []).filter((collection) => r.collection_ids.includes(collection.id)).map((collection) => collection.name).join(", ") || "No collection"}</div><div className="mt-3 flex flex-wrap gap-5"><AppSwitch isSelected={r.show_on_store} onChange={(v) => void update(r, "show_on_store", v)} label="On store" /><AppSwitch isSelected={r.is_featured} onChange={(v) => void update(r, "is_featured", v)} label="Featured" /></div></div></article>}
      isLoading={query.isLoading} isError={query.isError} empty={<p className="p-6 text-sm text-muted">Products you add to your catalogue will appear here.</p>}
      filters={<div className="flex flex-wrap gap-2"><select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-2 text-sm"><option value="">All products</option><option value="on">On store</option><option value="hidden">Hidden</option><option value="out_of_stock">Out of stock</option></select><select value={collectionId || ""} onChange={(e) => setCollectionId(Number(e.target.value) || 0)} className="h-9 rounded-lg border border-border bg-surface px-2 text-sm"><option value="">All collections</option>{(query.data?.collections ?? []).map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></div>}
      onSelectionChange={(ids) => setSelected(ids.map(Number))}
      toolbarActions={selected.length ? <div className="flex flex-wrap gap-2"><AppButton label="Show on store" onPress={() => mutation.mutate({ product_ids: selected, show_on_store: true })} /><AppButton label="Hide" onPress={() => mutation.mutate({ product_ids: selected, show_on_store: false })} /><AppButton label="Feature" onPress={() => mutation.mutate({ product_ids: selected, is_featured: true })} /></div> : null}
    />
  </Page>;
}

export function StorefrontProductsPage() { return <WorkspaceGate businessOnly>{({ workspaceId, currency }) => <ProductsContent workspaceId={workspaceId} currency={currency} />}</WorkspaceGate>; }
