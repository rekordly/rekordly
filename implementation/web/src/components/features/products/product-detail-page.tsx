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
  Stack,
  Tag,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { KpiCard } from "@/components/ui/cards";
import { DataView } from "@/components/ui/data-view";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState, Page, Segmented, StatusPill, type StatusTone } from "@/components/ui/page";
import { RichText } from "@/components/ui/rich-text-editor";
import { ChangePriceDrawer } from "./product-price-drawer";
import { ProductStockPanel } from "./product-stock";
import { productTypeLabel, unitLabel } from "@/components/pickers";
import { KpiRow } from "@/components/features/finance/dashboard-parts";
import { WorkspaceGate, type WorkspaceInfo } from "@/components/features/finance/shared";
import { formatDate } from "@/lib/format";
import { formatMinorAmount } from "@/lib/money";
import { productKeys, productsApi } from "@/lib/products";
import type { ProductDetail, ProductStatus } from "@/types/products";

const STATUS_TONE: Record<ProductStatus, StatusTone> = { active: "success", draft: "warning", archived: "neutral" };
const STATUS_LABEL: Record<ProductStatus, string> = { active: "Active", draft: "Draft", archived: "Archived" };

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "variants", label: "Variants" },
  { key: "stock", label: "Stock" },
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

function VariantsPanel({ detail }: { detail: ProductDetail }) {
  const product = detail.product;
  const options = detail.options ?? [];
  const variants = (detail.variants ?? []).filter((variant) => !variant.is_default && !variant.archived_at);
  const qty = (value: string) => String(Math.round(Number(value || 0) * 10000) / 10000);
  return (
    <div className="grid items-start gap-4 lg:grid-cols-12">
      <div className="lg:col-span-4">
      <Panel
        title="Options"
        action={
          <Link href={`/products/${product.id}/edit?section=options`} className="text-[13px] font-semibold text-primary hover:underline">
            Edit options
          </Link>
        }
      >
        {options.length ? (
          <ul className="divide-y divide-separator">
            {options.map((option) => (
              <li key={option.id} className="py-3 first:pt-0 last:pb-0">
                <span className="block text-[13px] font-semibold">{option.name}</span>
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  {option.values.map((value) => (
                    <span key={value} className="rounded-full bg-surface-secondary px-2.5 py-1 text-[12px] font-medium">
                      {value}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted">This product has one version.</p>
        )}
      </Panel>
      </div>
      <div className="lg:col-span-8">
      {variants.length ? (
        <DataView
          title="Variants"
          heading="Variants"
          rows={variants}
          rowKey={(variant) => variant.id}
          embedded
          selectable={false}
          columns={[
            {
              key: "name",
              label: "Variant",
              render: (variant) => (
                <span>
                  <span className="block font-semibold">{variant.name}</span>
                  <span className="block font-mono text-[11px] text-muted">{variant.sku || "No SKU"}</span>
                </span>
              ),
            },
            { key: "price", label: "Price", align: "right", render: (variant) => <span className="font-semibold tabular">{formatMinorAmount(variant.selling_price_minor, product.currency, product.currency_exponent)}</span> },
            { key: "cost", label: "Cost", align: "right", render: (variant) => <span className="tabular text-muted">{formatMinorAmount(variant.cost_price_minor, product.currency, product.currency_exponent)}</span> },
            { key: "stock", label: "Stock", align: "right", render: (variant) => <span className={`tabular ${Number(variant.quantity_on_hand) > 0 ? "font-semibold" : "text-muted"}`}>{qty(variant.quantity_on_hand)}</span> },
            { key: "status", label: "Status", align: "right", render: (variant) => <StatusPill tone={variant.is_active ? "success" : "neutral"}>{variant.is_active ? "On sale" : "Off"}</StatusPill> },
          ]}
          renderCard={(variant) => (
            <div className="space-y-1 rounded-xl border border-border bg-surface p-3 text-[13px]">
              <div className="flex justify-between">
                <strong>{variant.name}</strong>
                <span>{variant.is_active ? "On" : "Off"}</span>
              </div>
              <p>
                {formatMinorAmount(variant.selling_price_minor, product.currency, product.currency_exponent)} · {qty(variant.quantity_on_hand)} in stock
              </p>
              <p className="text-muted">
                Cost {formatMinorAmount(variant.cost_price_minor, product.currency, product.currency_exponent)} · SKU {variant.sku || "—"}
              </p>
            </div>
          )}
          empty={<p>No variants yet.</p>}
        />
      ) : (
        <Panel title="Variants">
          <p className="text-[13px] text-muted">No variants. Add options like Size or Colour to sell this product in different versions.</p>
        </Panel>
      )}
      </div>
    </div>
  );
}

function ProductDetailContent({ workspaceId, productId }: WorkspaceInfo & { productId: number }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const detail = useQuery({ queryKey: productKeys.detail(workspaceId, productId), queryFn: () => productsApi.get(workspaceId, productId) });
  const history = useQuery({
    queryKey: [...productKeys.detail(workspaceId, productId), "history"],
    queryFn: () => productsApi.combinedHistory(workspaceId, productId),
    enabled: tab === "history",
  });

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
  const activeVariants = (detail.data.variants ?? []).filter((variant) => !variant.is_default && !variant.archived_at && variant.is_active !== false);
  const show = (minor?: string | null) => (minor ? formatMinorAmount(minor, product.currency, product.currency_exponent) : "—");
  const priceMinor = BigInt(product.selling_price_minor);
  const costMinor = BigInt(product.cost_price_minor);
  const profit = priceMinor - costMinor;
  const margin = priceMinor > BigInt(0) && costMinor > BigInt(0) ? Number((profit * BigInt(1000)) / priceMinor) / 10 : null;
  const unit = unitLabel(product.unit_name).replace(/ \(.*\)/, "").toLowerCase();
  const isArchived = product.status === "archived";
  const productCollections = detail.data.collections ?? [];
  const productOutlets = detail.data.outlets ?? [];
  const image = product.image_urls[Math.min(activeImage, product.image_urls.length - 1)];

  const variantPrices = activeVariants.map((variant) => BigInt(variant.selling_price_minor || "0")).filter((v) => v > BigInt(0));
  const minVariantPrice = variantPrices.length ? variantPrices.reduce((a, b) => (a < b ? a : b)) : priceMinor;
  const maxVariantPrice = variantPrices.length ? variantPrices.reduce((a, b) => (a > b ? a : b)) : priceMinor;
  const hasPriceRange = activeVariants.length > 1 && minVariantPrice !== maxVariantPrice;
  const sellingPriceValue = hasPriceRange ? `From ${show(minVariantPrice.toString())}` : show(product.selling_price_minor);
  const sellingPriceHint = hasPriceRange
    ? `Up to ${show(maxVariantPrice.toString())} across ${activeVariants.length} variants`
    : product.compare_at_price_minor
      ? `Was ${show(product.compare_at_price_minor)}`
      : `Per ${unit}`;

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
              <>
                <AppButton variant="ghost" startContent={<Archive />} label="Archive" onPress={() => setConfirmArchive(true)} />
                <AppButton variant="secondary" startContent={<Tag />} label="Change price" onPress={() => setPriceOpen(true)} />
              </>
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
        <KpiCard tone="accent" icon={Tag} label="Selling price" value={sellingPriceValue} hint={sellingPriceHint} />
        <KpiCard icon={Coins} label="Profit per sale" value={costMinor > BigInt(0) ? formatMinorAmount(profit.toString(), product.currency, product.currency_exponent) : "—"} hint={margin !== null ? `${margin.toFixed(1)}% margin` : "Add a cost price to see this"} />
        <KpiCard
          icon={Cube}
          label="In stock"
          value={product.kind === "stock_tracked" ? `${Number(product.quantity_on_hand)}` : "Not tracked"}
          hint={product.kind === "stock_tracked" ? (activeVariants.length > 1 ? `${unit} across ${activeVariants.length} variants` : `${unit} across outlets`) : productTypeLabel(product.kind)}
        />
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

      {tab === "variants" ? <VariantsPanel detail={detail.data} /> : null}

      {tab === "stock" ? (
        <ProductStockPanel workspaceId={workspaceId} detail={detail.data} />
      ) : null}

      {tab === "history" ? (
        (() => {
          const historyList = (history.data ?? []) as any[];
          const pricesList = historyList.filter((item) => item.kind === "price");
          const eventsList = historyList.filter((item) => item.kind === "event");
          return (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Price history">
                  {history.isPending ? (
                    <div className="h-24 animate-pulse rounded-xl bg-default" />
                  ) : pricesList.length === 0 ? (
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
                          {pricesList.map((change) => {
                            const money = (minor?: string | null) => (minor ? formatMinorAmount(minor, change.currency, change.currency_exponent) : "—");
                            return (
                              <tr key={change.id}>
                                <td>{formatDate(change.created_at)}</td>
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

                <Panel title="Product changes">
                  {history.isPending ? (
                    <div className="h-24 animate-pulse rounded-xl bg-default" />
                  ) : eventsList.length === 0 ? (
                    <EmptyState icon={ClockCounterClockwise} title="No history yet" description="Changes to this product will show here." />
                  ) : (
                    <ol className="relative ml-2 space-y-4 border-l border-separator pl-5">
                      {eventsList.map((event) => (
                        <li key={event.id} className="relative">
                          <span className={`absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-surface ${event.event_type === "price_changed" ? "bg-secondary" : event.event_type === "archived" ? "bg-muted" : "bg-primary"}`} />
                          <p className="text-[14px] font-medium">{event.summary}</p>
                          <p className="text-[12px] text-muted">{formatDate(event.created_at)}</p>
                        </li>
                      ))}
                    </ol>
                  )}
                </Panel>
              </div>
            </div>
          );
        })()
      ) : null}

      {priceOpen ? <ChangePriceDrawer workspaceId={workspaceId} detail={detail.data} onClose={() => setPriceOpen(false)} /> : null}
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
