"use client";

// Products: everything the business sells.
// Tiles, a Products / Collections switch, status filters, and Actions
// (import, export, import history). Rows open the product page.

import { Dropdown } from "@heroui/react";
import { CaretDown, ClockCounterClockwise, Cube, DownloadSimple, FileArrowUp, FolderSimple, ImageSquare, Package, Plus, Tag, WarningCircle } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { KpiCard } from "@/components/ui/cards";
import { DataView } from "@/components/ui/data-view";
import { EmptyState, Page, PageHeader, Segmented, StatusPill, type StatusTone } from "@/components/ui/page";
import { productTypeLabel, unitLabel, useProductCollections } from "@/components/pickers";
import { KpiRow } from "@/components/features/finance/dashboard-parts";
import { WorkspaceGate, type WorkspaceInfo } from "@/components/features/finance/shared";
import { buildCsv, downloadCsv } from "@/lib/csv";
import { formatDate } from "@/lib/format";
import { formatMinorAmount } from "@/lib/money";
import { productKeys, productsApi } from "@/lib/products";
import type { Product, ProductStatus } from "@/types/products";

import { ProductCollections } from "./product-collections";
import { BulkPriceDrawer } from "./product-price-drawer";
import { downloadProductTemplate, ProductImportDrawer, ProductImportHistoryDrawer } from "./product-import";

const STATUS_TONE: Record<ProductStatus, StatusTone> = { active: "success", draft: "warning", archived: "neutral" };
const STATUS_LABEL: Record<ProductStatus, string> = { active: "Active", draft: "Draft", archived: "Archived" };

const STATUS_FILTERS = [
  { key: "all", label: "All", description: "Every product" },
  { key: "active", label: "Active", description: "On sale now" },
  { key: "draft", label: "Drafts", description: "Not on sale yet" },
  { key: "archived", label: "Archived", description: "Hidden from new sales" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["key"];

function price(product: Product, field: "selling_price_minor" | "cost_price_minor" | "compare_at_price_minor") {
  const value = product[field];
  return value ? formatMinorAmount(value, product.currency, product.currency_exponent) : "";
}

function stockText(product: Product) {
  if (product.kind !== "stock_tracked") return "—";
  const quantity = Number(product.quantity_on_hand);
  return `${Number.isInteger(quantity) ? quantity : quantity.toFixed(2)} ${unitLabel(product.unit_name).replace(/ \(.*\)/, "").toLowerCase()}`;
}

function Thumb({ product, size = "size-10" }: { product: Product; size?: string }) {
  return product.image_urls[0] ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={product.image_urls[0]} alt="" className={`${size} shrink-0 rounded-lg border border-border object-cover`} />
  ) : (
    <span className={`${size} grid shrink-0 place-items-center rounded-lg bg-surface-secondary text-muted`}>
      <ImageSquare size={16} aria-hidden="true" />
    </span>
  );
}

export function exportProducts(products: Product[], fileName: string) {
  downloadCsv(
    fileName,
    buildCsv(
      ["name", "type", "sku", "barcode", "unit", "price", "cost_price", "compare_at_price", "status", "stock", "short_description"],
      products.map((product) => [
        product.name,
        productTypeLabel(product.kind),
        product.sku,
        product.barcode,
        product.unit_name,
        (Number(product.selling_price_minor) / 10 ** product.currency_exponent).toFixed(product.currency_exponent),
        (Number(product.cost_price_minor) / 10 ** product.currency_exponent).toFixed(product.currency_exponent),
        product.compare_at_price_minor ? (Number(product.compare_at_price_minor) / 10 ** product.currency_exponent).toFixed(product.currency_exponent) : "",
        product.status,
        product.kind === "stock_tracked" ? product.quantity_on_hand : "",
        product.short_description,
      ]),
    ),
  );
}

function ProductsContent({ workspaceId, currency }: WorkspaceInfo) {
  const router = useRouter();
  const [tab, setTab] = useState<"products" | "collections">("products");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [collectionId, setCollectionId] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);

  // One full list feeds the tiles and the filters, so switching filters is instant.
  const products = useQuery({ queryKey: productKeys.list(workspaceId, {}), queryFn: () => productsApi.list(workspaceId) });
  const collections = useProductCollections(workspaceId);
  const all = useMemo(() => products.data ?? [], [products.data]);
  const source = useMemo(() => {
    if (!collectionId) return all;
    const cid = Number(collectionId);
    return all.filter((product) => (product.collection_ids ?? []).includes(cid));
  }, [all, collectionId]);
  const rows = status === "all" ? source.filter((product) => product.status !== "archived") : source.filter((product) => product.status === status);

  const active = all.filter((product) => product.status === "active");
  const drafts = all.filter((product) => product.status === "draft").length;
  const outOfStock = all.filter((product) => product.status !== "archived" && product.kind === "stock_tracked" && Number(product.quantity_on_hand) <= 0).length;

  const onSelection = useCallback((keys: (string | number)[]) => setSelectedIds(keys.map(Number)), []);
  const selected = all.filter((product) => selectedIds.includes(product.id));

  const statusCell = (product: Product) => <StatusPill tone={STATUS_TONE[product.status]}>{STATUS_LABEL[product.status]}</StatusPill>;

  return (
    <Page>
      <PageHeader
        title="Products"
        description="Everything you sell, with prices, stock and collections."
        actions={
          <>
            <Dropdown>
              <Dropdown.Trigger className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-4 text-[14px] font-medium outline-none transition-colors hover:bg-surface-secondary">
                Actions
                <CaretDown size={14} aria-hidden="true" />
              </Dropdown.Trigger>
              <Dropdown.Popover placement="bottom end" className="min-w-[220px] rounded-xl bg-overlay p-1">
                <Dropdown.Menu
                  aria-label="Product actions"
                  onAction={(key) => {
                    if (key === "import") setImportOpen(true);
                    if (key === "template") downloadProductTemplate();
                    if (key === "export") exportProducts(all.filter((product) => product.status !== "archived"), "rekordly-products.csv");
                    if (key === "history") setHistoryOpen(true);
                  }}
                >
                  <Dropdown.Item id="import" textValue="Import products" className="rounded-lg px-3 py-2 text-[13px]">
                    <FileArrowUp size={16} aria-hidden="true" />
                    Import products
                  </Dropdown.Item>
                  <Dropdown.Item id="template" textValue="Download template" className="rounded-lg px-3 py-2 text-[13px]">
                    <DownloadSimple size={16} aria-hidden="true" />
                    Download import template
                  </Dropdown.Item>
                  <Dropdown.Item id="export" textValue="Export all" className="rounded-lg px-3 py-2 text-[13px]">
                    <DownloadSimple size={16} aria-hidden="true" />
                    Export all products
                  </Dropdown.Item>
                  <Dropdown.Item id="history" textValue="Import history" className="rounded-lg px-3 py-2 text-[13px]">
                    <ClockCounterClockwise size={16} aria-hidden="true" />
                    Import history
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
            <AppButton startContent={<Plus weight="bold" />} label="Add product" onPress={() => router.push("/products/new")} />
          </>
        }
      />

      <KpiRow className="lg:grid-cols-4">
        <KpiCard loading={products.isPending} tone="accent" icon={Package} label="Active products" value={String(active.length)} hint={`${all.length} in total`} />
        <KpiCard loading={products.isPending} icon={Tag} label="Drafts" value={String(drafts)} hint={drafts ? "Not on sale yet" : "Nothing waiting"} />
        <KpiCard loading={products.isPending} icon={WarningCircle} label="Out of stock" value={String(outOfStock)} hint={outOfStock ? "Tracked products with none left" : "Everything in stock"} />
        <KpiCard loading={collections.isPending} icon={FolderSimple} label="Collections" value={String(collections.data?.length ?? 0)} hint="Groups of products" />
      </KpiRow>

      <Segmented
        aria-label="Products sections"
        options={[
          { key: "products", label: "Products" },
          { key: "collections", label: "Collections" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "products" ? (
        <DataView<Product>
          title="Products"
          rows={rows}
          rowKey={(product) => product.id}
          isLoading={products.isPending}
          isError={products.isError}
          searchPlaceholder="Search name or SKU"
          getSearchText={(product) => `${product.name} ${product.sku ?? ""} ${product.barcode ?? ""}`}
          onSelectionChange={onSelection}
          filters={
            <>
              <FilterDropdown label="Status" options={STATUS_FILTERS} value={status} onChange={setStatus} />
              {(collections.data ?? []).length ? (
                <FilterDropdown
                  label="Collection"
                  options={[{ key: "", label: "All" }, ...(collections.data ?? []).map((collection) => ({ key: String(collection.id), label: collection.name }))]}
                  value={collectionId || ""}
                  onChange={setCollectionId}
                />
              ) : null}
            </>
          }
          toolbarActions={
            selected.length ? (
              <>
                <AppButton size="sm" variant="secondary" startContent={<Tag />} label="Change prices" onPress={() => setPriceOpen(true)} />
                <AppButton size="sm" variant="secondary" startContent={<DownloadSimple />} label={`Export ${selected.length}`} onPress={() => exportProducts(selected, "rekordly-products-selected.csv")} />
              </>
            ) : null
          }
          empty={
            <EmptyState
              icon={Cube}
              title={status === "all" && !collectionId ? "No products yet" : "Nothing here"}
              description={status === "all" && !collectionId ? "Add what you sell, or import a list from a spreadsheet." : "Try another filter."}
              action={
                status === "all" && !collectionId ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <AppButton startContent={<Plus weight="bold" />} label="Add product" onPress={() => router.push("/products/new")} />
                    <AppButton variant="secondary" startContent={<FileArrowUp />} label="Import" onPress={() => setImportOpen(true)} />
                  </div>
                ) : undefined
              }
            />
          }
          columns={[
            {
              key: "name",
              label: "Product",
              sortValue: (product) => product.name,
              render: (product) => (
                <Link href={`/products/${product.id}`} className="flex min-w-0 items-center gap-3 hover:underline">
                  <Thumb product={product} />
                  <span className="min-w-0">
                    <span className="block max-w-[260px] truncate font-semibold text-foreground">{product.name}</span>
                    <span className="block text-[12px] text-muted">{product.sku ?? "No SKU"}</span>
                  </span>
                </Link>
              ),
            },
            { key: "type", label: "Type", render: (product) => <span className="text-muted">{productTypeLabel(product.kind)}</span> },
            {
              key: "price",
              label: "Price",
              align: "right",
              sortValue: (product) => Number(product.selling_price_minor),
              render: (product) => (
                <span className="tabular">
                  <span className="font-semibold">{price(product, "selling_price_minor")}</span>
                  {product.compare_at_price_minor ? <span className="block text-[12px] text-muted line-through">{price(product, "compare_at_price_minor")}</span> : null}
                </span>
              ),
            },
            { key: "stock", label: "Stock", align: "right", sortValue: (product) => Number(product.quantity_on_hand), render: (product) => <span className={`tabular ${product.kind === "stock_tracked" && Number(product.quantity_on_hand) <= 0 ? "font-semibold text-danger" : ""}`}>{stockText(product)}</span> },
            { key: "status", label: "Status", render: statusCell },
            { key: "updated", label: "Updated", sortValue: (product) => product.updated_at, render: (product) => <span className="text-muted">{formatDate(product.updated_at)}</span> },
          ]}
          renderCard={(product) => (
            <Link href={`/products/${product.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5">
              <Thumb product={product} size="size-14" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{product.name}</span>
                <span className="block text-[12px] text-muted">
                  {productTypeLabel(product.kind)} · {stockText(product)}
                </span>
                <span className="mt-1 block text-[14px] font-bold tabular">{price(product, "selling_price_minor")}</span>
              </span>
              {statusCell(product)}
            </Link>
          )}
        />
      ) : (
        <ProductCollections
          workspaceId={workspaceId}
          onView={(collection) => {
            setCollectionId(String(collection.id));
            setStatus("all");
            setTab("products");
          }}
        />
      )}

      <ProductImportDrawer workspaceId={workspaceId} currency={currency} isOpen={importOpen} onClose={() => setImportOpen(false)} />
      <ProductImportHistoryDrawer workspaceId={workspaceId} isOpen={historyOpen} onClose={() => setHistoryOpen(false)} />
      {priceOpen && selected.length ? <BulkPriceDrawer workspaceId={workspaceId} products={selected} onClose={() => setPriceOpen(false)} /> : null}
    </Page>
  );
}

export function ProductsPage() {
  return <WorkspaceGate businessOnly>{(workspace) => <ProductsContent key={workspace.workspaceId} {...workspace} />}</WorkspaceGate>;
}
