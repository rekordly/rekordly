"use client";

// One product: key figures, then tabs for overview, variants, stock, price history and history.

import {
  Archive,
  ArrowCounterClockwise,
  ArrowRight,
  Barcode,
  ClockCounterClockwise,
  Coins,
  Cube,
  ImageSquare,
  PencilSimple,
  Plus,
  Stack,
  Tag,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { KpiCard } from "@/components/ui/cards";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, Segmented, StatusPill, type StatusTone } from "@/components/ui/page";
import { MoneyInput } from "@/components/ui/money-input";
import { RichText } from "@/components/ui/rich-text-editor";
import { ProductStockPanel } from "./product-stock";
import { productTypeLabel, toMinor, unitLabel, useOutlets, useProductCollections } from "@/components/pickers";
import { KpiRow } from "@/components/features/finance/dashboard-parts";
import { useFinanceAction, WorkspaceGate, type WorkspaceInfo } from "@/components/features/finance/shared";
import { formatDate } from "@/lib/format";
import { financeApi, formatMinorAmount, moneyKeys } from "@/lib/money";
import { productKeys, productsApi } from "@/lib/products";
import type { ProductDetail, ProductStatus } from "@/types/products";

const STATUS_TONE: Record<ProductStatus, StatusTone> = { active: "success", draft: "warning", archived: "neutral" };
const STATUS_LABEL: Record<ProductStatus, string> = { active: "Active", draft: "Draft", archived: "Archived" };

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "variants", label: "Variants" },
  { key: "stock", label: "Stock" },
  { key: "prices", label: "Price history" },
  { key: "history", label: "History" },
] as const;

type Tab = (typeof TABS)[number]["key"];

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="animate-fade-up rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 px-5 pt-5">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-[13px] font-medium">{children}</dd>
    </div>
  );
}

function VariantsPanel({ workspaceId, detail }: { workspaceId: number; detail: ProductDetail }) {
  const product = detail.product;
  const options = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "product-options", product.id],
    queryFn: () => financeApi.listProductOptions(workspaceId, product.id),
  });
  const variants = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "product-variants", product.id],
    queryFn: () => financeApi.listProductVariants(workspaceId, product.id),
  });
  const [optionOpen, setOptionOpen] = useState(false);
  const [variantOpen, setVariantOpen] = useState(false);
  const [option, setOption] = useState({ name: "", values: "" });
  const [variant, setVariant] = useState({ name: "", price: "", cost: "", sku: "", barcode: "" });
  const [error, setError] = useState("");

  const createOption = useFinanceAction(
    workspaceId,
    () => financeApi.createProductOption(workspaceId, product.id, { name: option.name.trim(), values: option.values.split(",").map((value) => value.trim()).filter(Boolean) }),
    { success: "Option added", onDone: () => { setOptionOpen(false); setOption({ name: "", values: "" }); } },
  );
  const createVariant = useFinanceAction(
    workspaceId,
    () =>
      financeApi.createProductVariant(workspaceId, product.id, {
        name: variant.name.trim(),
        selling_price: variant.price,
        cost_price: variant.cost || undefined,
        sku: variant.sku.trim() || undefined,
        barcode: variant.barcode.trim() || undefined,
      }),
    { success: "Variant added", onDone: () => { setVariantOpen(false); setVariant({ name: "", price: "", cost: "", sku: "", barcode: "" }); } },
  );

  return (
    <div className="space-y-4">
      <Panel title="Options" action={<AppButton size="sm" variant="secondary" startContent={<Plus weight="bold" />} label="New option" onPress={() => setOptionOpen(true)} />}>
        {(options.data ?? []).length === 0 ? (
          <p className="text-[13px] text-muted">No options yet. Add one like Size (S, M, L) or Colour (Red, Blue).</p>
        ) : (
          <ul className="space-y-2">
            {(options.data ?? []).map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold">{item.name}</span>
                {item.values.map((value) => (
                  <span key={value} className="rounded-full bg-surface-secondary px-2.5 py-1 text-[12px]">
                    {value}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Sellable variants" action={<AppButton size="sm" startContent={<Plus weight="bold" />} label="New variant" onPress={() => setVariantOpen(true)} />}>
        <ul className="divide-y divide-separator">
          {(variants.data ?? []).map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[14px] font-semibold">
                  {item.name}
                  {item.is_default && item.name.toLowerCase() !== "default" ? <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary-soft-foreground">Default</span> : null}
                  {!item.is_active ? <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-[11px] text-muted">Inactive</span> : null}
                </span>
                <span className="block text-[12px] text-muted">{item.sku ? `SKU ${item.sku}` : "No SKU"}</span>
              </span>
              <span className="shrink-0 text-right text-[13px] tabular">
                <span className="block font-semibold">{formatMinorAmount(item.selling_price_minor, item.currency, item.currency_exponent)}</span>
                <span className="block text-[12px] text-muted">Cost {formatMinorAmount(item.cost_price_minor, item.currency, item.currency_exponent)}</span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <FormDrawer
        isOpen={optionOpen}
        onOpenChange={setOptionOpen}
        title="New option"
        description="Something the product comes in different kinds of."
        submitLabel="Add option"
        isSubmitting={createOption.isPending}
        onSubmit={(event) => {
          event.preventDefault();
          if (!option.name.trim() || !option.values.trim()) return setError("Give the option a name and at least one value");
          setError("");
          createOption.mutate(undefined);
        }}
      >
        <AppInput label="Option name" isRequired placeholder="e.g. Size" value={option.name} onChange={(event) => setOption({ ...option, name: event.target.value })} errorMessage={error || undefined} />
        <AppInput label="Values" isRequired placeholder="S, M, L, XL" description="Separate values with commas." value={option.values} onChange={(event) => setOption({ ...option, values: event.target.value })} />
      </FormDrawer>

      <FormDrawer
        isOpen={variantOpen}
        onOpenChange={setVariantOpen}
        title="New variant"
        description="A version you sell separately, with its own price."
        submitLabel="Add variant"
        isSubmitting={createVariant.isPending}
        onSubmit={(event) => {
          event.preventDefault();
          if (!variant.name.trim() || toMinor(variant.price) <= BigInt(0)) return setError("Name the variant and give it a price");
          setError("");
          createVariant.mutate(undefined);
        }}
      >
        <AppInput label="Name" isRequired placeholder="e.g. Red / Large" value={variant.name} onChange={(event) => setVariant({ ...variant, name: event.target.value })} errorMessage={error || undefined} />
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyInput label="Selling price" isRequired currency={product.currency} value={variant.price} onValueChange={(value) => setVariant({ ...variant, price: value })} />
          <MoneyInput label="Cost price" currency={product.currency} value={variant.cost} onValueChange={(value) => setVariant({ ...variant, cost: value })} />
          <AppInput label="SKU" placeholder="Optional" value={variant.sku} onChange={(event) => setVariant({ ...variant, sku: event.target.value.toUpperCase() })} />
          <AppInput label="Barcode" placeholder="Optional" value={variant.barcode} onChange={(event) => setVariant({ ...variant, barcode: event.target.value })} />
        </div>
      </FormDrawer>
    </div>
  );
}

function ProductDetailContent({ workspaceId, productId }: WorkspaceInfo & { productId: number }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const detail = useQuery({ queryKey: productKeys.detail(workspaceId, productId), queryFn: () => productsApi.get(workspaceId, productId) });
  const prices = useQuery({ queryKey: productKeys.priceHistory(workspaceId, productId), queryFn: () => productsApi.priceHistory(workspaceId, productId), enabled: tab === "prices" });
  const events = useQuery({ queryKey: productKeys.events(workspaceId, productId), queryFn: () => productsApi.events(workspaceId, productId), enabled: tab === "history" });
  const collections = useProductCollections(workspaceId);
  const outlets = useOutlets(workspaceId);

  const archive = useMutation({
    mutationFn: (archived: boolean) => (archived ? productsApi.archive(workspaceId, productId) : productsApi.restore(workspaceId, productId)),
    onSuccess: () => {
      setConfirmArchive(false);
      void queryClient.invalidateQueries({ queryKey: productKeys.all(workspaceId) });
    },
  });

  if (detail.isPending) {
    return (
      <Page>
        <div className="h-10 w-64 animate-pulse rounded-lg bg-default" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl bg-default" />
          ))}
        </div>
      </Page>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <Page>
        <Alert status="error" description="This product could not be found." />
        <Link href="/products" className="text-[14px] font-semibold text-primary hover:underline">
          Back to products
        </Link>
      </Page>
    );
  }

  const { product } = detail.data;
  const show = (minor?: string | null) => (minor ? formatMinorAmount(minor, product.currency, product.currency_exponent) : "—");
  const priceMinor = BigInt(product.selling_price_minor);
  const costMinor = BigInt(product.cost_price_minor);
  const profit = priceMinor - costMinor;
  const margin = priceMinor > BigInt(0) && costMinor > BigInt(0) ? Number((profit * BigInt(1000)) / priceMinor) / 10 : null;
  const unit = unitLabel(product.unit_name).replace(/ \(.*\)/, "").toLowerCase();
  const isArchived = product.status === "archived";
  const productCollections = (collections.data ?? []).filter((collection) => detail.data.collection_ids.includes(collection.id));
  const productOutlets = (outlets.data ?? []).filter((outlet) => detail.data.outlet_ids.includes(outlet.id));
  const image = product.image_urls[Math.min(activeImage, product.image_urls.length - 1)];

  return (
    <Page>
      <div className="pt-2">
        <Link href="/products" className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-foreground">
          <ArrowRight size={13} className="rotate-180" weight="bold" aria-hidden="true" />
          Products
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            {product.image_urls[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.image_urls[0]} alt="" className="size-14 shrink-0 rounded-xl border border-border object-cover" />
            ) : (
              <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-surface-secondary text-muted">
                <ImageSquare size={22} aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[24px] leading-tight font-bold tracking-[-0.02em]">{product.name}</h1>
                <StatusPill tone={STATUS_TONE[product.status]}>{STATUS_LABEL[product.status]}</StatusPill>
              </div>
              <p className="mt-1 text-[14px] text-muted">
                {productTypeLabel(product.kind)} · {product.sku ?? "No SKU"} · sold per {unit}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {isArchived ? (
              <AppButton variant="secondary" startContent={<ArrowCounterClockwise />} label="Restore" isLoading={archive.isPending} onPress={() => archive.mutate(false)} />
            ) : (
              <AppButton variant="ghost" startContent={<Archive />} label="Archive" onPress={() => setConfirmArchive(true)} />
            )}
            <Link href={`/products/${product.id}/edit`} className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-[14px] font-medium text-accent-foreground transition-opacity hover:opacity-90">
              <PencilSimple size={16} aria-hidden="true" />
              Edit
            </Link>
          </div>
        </div>
      </div>

      {isArchived ? <Alert status="warning" description="This product is archived. It is hidden from new sales and invoices until you restore it." /> : null}

      <KpiRow className="xl:grid-cols-4">
        <KpiCard tone="accent" icon={Tag} label="Selling price" value={show(product.selling_price_minor)} hint={product.compare_at_price_minor ? `Was ${show(product.compare_at_price_minor)}` : `Per ${unit}`} />
        <KpiCard icon={Coins} label="Profit per sale" value={costMinor > BigInt(0) ? formatMinorAmount(profit.toString(), product.currency, product.currency_exponent) : "—"} hint={margin !== null ? `${margin.toFixed(1)}% margin` : "Add a cost price to see this"} />
        <KpiCard icon={Cube} label="In stock" value={product.kind === "stock_tracked" ? `${Number(product.quantity_on_hand)}` : "Not tracked"} hint={product.kind === "stock_tracked" ? `${unit} across outlets` : productTypeLabel(product.kind)} />
        <KpiCard icon={Stack} label="Variants" value={String(product.variant_count)} hint={product.variant_count > 1 ? "Sold in different versions" : "One version"} />
      </KpiRow>

      <Segmented aria-label="Product sections" options={TABS} value={tab} onChange={setTab} />

      {tab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Panel title="Store details" action={<Link href={`/products/${product.id}/edit`} className="text-[13px] font-semibold text-primary hover:underline">Edit</Link>}>
            {product.image_urls.length ? (
              <div className="space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt={product.name} className="aspect-[4/5] max-h-80 w-full rounded-xl border border-border object-contain" />
                {product.image_urls.length > 1 ? (
                  <div className="flex gap-2 overflow-x-auto">
                    {product.image_urls.map((url, index) => (
                      <button key={url} type="button" onClick={() => setActiveImage(index)} className={`size-14 shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 ${index === activeImage ? "border-primary" : "border-transparent"}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="rounded-xl bg-surface-secondary p-4 text-[13px] text-muted">No images yet. Add some so this product looks good on your store.</p>
            )}
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-[12px] font-semibold text-muted">Short description</p>
                <p className="mt-0.5 text-[14px]">{product.short_description || <span className="text-muted">Not added yet</span>}</p>
              </div>
              <div>
                <p className="text-[12px] font-semibold text-muted">Long description</p>
                {product.long_description ? <RichText html={product.long_description} className="mt-0.5" /> : <p className="mt-0.5 text-[14px] text-muted">Not added yet</p>}
              </div>
            </div>
          </Panel>

          <Panel title="Details">
            <dl className="divide-y divide-separator">
              <Row label="Type">{productTypeLabel(product.kind)}</Row>
              <Row label="Unit">{unitLabel(product.unit_name)}</Row>
              <Row label="Cost price">{costMinor > BigInt(0) ? show(product.cost_price_minor) : "—"}</Row>
              <Row label="Compare-at price">{show(product.compare_at_price_minor)}</Row>
              <Row label="SKU">
                <span className="inline-flex items-center gap-1.5">
                  <Barcode size={14} aria-hidden="true" />
                  {product.sku ?? "—"}
                </span>
              </Row>
              <Row label="Barcode">{product.barcode ?? "—"}</Row>
              <Row label="Sold in">{productOutlets.length ? productOutlets.map((outlet) => outlet.name).join(", ") : "All outlets"}</Row>
              <Row label="Collections">
                {productCollections.length ? (
                  <span className="flex flex-wrap justify-end gap-1">
                    {productCollections.map((collection) => (
                      <span key={collection.id} className="rounded-full bg-primary-soft px-2 py-0.5 text-[12px] text-primary-soft-foreground">
                        {collection.name}
                      </span>
                    ))}
                  </span>
                ) : (
                  "None"
                )}
              </Row>
              <Row label="Added">{formatDate(product.created_at)}</Row>
            </dl>
          </Panel>
        </div>
      ) : null}

      {tab === "variants" ? <VariantsPanel workspaceId={workspaceId} detail={detail.data} /> : null}

      {tab === "stock" ? (
        <ProductStockPanel workspaceId={workspaceId} detail={detail.data} />
      ) : null}

      {tab === "prices" ? (
        <Panel title="Price history">
          {prices.isPending ? (
            <div className="h-24 animate-pulse rounded-xl bg-default" />
          ) : (prices.data ?? []).length === 0 ? (
            <p className="text-[13px] text-muted">No price changes yet.</p>
          ) : (
            <div className="scroll-thin overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="text-right">Selling price</th>
                    <th className="text-right">Cost price</th>
                  </tr>
                </thead>
                <tbody>
                  {(prices.data ?? []).map((change) => {
                    const money = (minor?: string | null) => (minor ? formatMinorAmount(minor, change.currency, change.currency_exponent) : "—");
                    return (
                      <tr key={change.id}>
                        <td>{formatDate(change.changed_at)}</td>
                        <td className="text-right tabular">
                          {change.old_selling_price_minor && change.old_selling_price_minor !== change.new_selling_price_minor ? (
                            <span className="mr-2 text-muted line-through">{money(change.old_selling_price_minor)}</span>
                          ) : null}
                          <span className="font-semibold">{money(change.new_selling_price_minor)}</span>
                        </td>
                        <td className="text-right tabular">
                          {change.old_cost_price_minor && change.old_cost_price_minor !== change.new_cost_price_minor ? (
                            <span className="mr-2 text-muted line-through">{money(change.old_cost_price_minor)}</span>
                          ) : null}
                          {money(change.new_cost_price_minor)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {tab === "history" ? (
        <Panel title="History">
          {events.isPending ? (
            <div className="h-24 animate-pulse rounded-xl bg-default" />
          ) : (events.data ?? []).length === 0 ? (
            <EmptyState icon={ClockCounterClockwise} title="No history yet" description="Changes to this product will show here." />
          ) : (
            <ol className="relative ml-2 space-y-4 border-l border-separator pl-5">
              {(events.data ?? []).map((event) => (
                <li key={event.id} className="relative">
                  <span className={`absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-surface ${event.event_type === "price_changed" ? "bg-secondary" : event.event_type === "archived" ? "bg-muted" : "bg-primary"}`} />
                  <p className="text-[14px] font-medium">{event.summary}</p>
                  <p className="text-[12px] text-muted">{formatDate(event.created_at)}</p>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      ) : null}

      <ConfirmDialog
        isOpen={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={`Archive ${product.name}?`}
        description="It will be hidden from new sales and invoices. Past records keep it, and you can restore it any time."
        confirmLabel="Archive"
        isDanger
        isLoading={archive.isPending}
        onConfirm={() => archive.mutate(true)}
      />
    </Page>
  );
}

export function ProductDetailPage({ productId }: { productId: number }) {
  return <WorkspaceGate businessOnly>{(workspace) => <ProductDetailContent key={workspace.workspaceId} {...workspace} productId={productId} />}</WorkspaceGate>;
}
