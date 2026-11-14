"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowsLeftRight,
  BookmarkSimple,
  ClipboardText,
  SealCheck,
  Storefront,
  Warehouse,
  WarningCircle,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";

import { AppButton } from "@/components/ui/app-button";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader, Segmented, StatusPill } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { capitalise, formatDate } from "@/lib/format";
import { financeApi, formatMinorAmount, moneyKeys } from "@/lib/money";
import {
  catalogueItemSchema,
  openingStockSchema,
  outletSchema,
  productOptionSchema,
  productVariantSchema,
  stockAdjustmentSchema,
  stockCountSchema,
  stockReservationSchema,
  stockTransferSchema,
  type CatalogueItemValues,
  type OpeningStockValues,
  type OutletValues,
  type ProductOptionValues,
  type ProductVariantValues,
  type StockAdjustmentValues,
  type StockCountValues,
  type StockReservationValues,
  type StockTransferValues,
} from "@/lib/schemas/finance.schemas";
import type {
  CatalogueItem,
  InventoryBalance,
  InventoryOutlet,
  ProductOption,
  ProductVariant,
  StockAdjustment,
  StockCount,
  StockReservation,
  StockTransfer,
} from "@/types/finance";

import { MoneyField, NotesField, SelectField, TextInputField } from "./fields";
import { useFinanceAction, WorkspaceGate, type WorkspaceInfo } from "./shared";
import { InventoryStats } from "./section-stats";

const INVENTORY_TABS = [
  { key: "balances", label: "Stock balances" },
  { key: "outlets", label: "Outlets" },
  { key: "transfers", label: "Transfers" },
  { key: "counts", label: "Stock counts" },
  { key: "adjustments", label: "Adjustments" },
  { key: "reservations", label: "Reservations" },
] as const;

type InventoryTab = (typeof INVENTORY_TABS)[number]["key"];

const ITEM_TYPES = [
  { key: "service", label: "Service" },
  { key: "non_stock", label: "Product (no stock tracking)" },
  { key: "stock_tracked", label: "Product (track stock)" },
];

const ITEM_STATES = [
  { key: "active", label: "Active" },
  { key: "draft", label: "Draft" },
];

const OUTLET_TYPES = [
  { key: "outlet", label: "Retail Outlet / Shop" },
  { key: "warehouse", label: "Warehouse" },
  { key: "store", label: "Storage Room" },
  { key: "other", label: "Other Location" },
];

const COUNT_SCOPES = [
  { key: "full", label: "Full location audit" },
  { key: "category", label: "Category subset" },
  { key: "custom", label: "Selected items" },
];

const ADJUSTMENT_REASONS = [
  { key: "damage", label: "Damage / Breakage" },
  { key: "spoilage", label: "Spoilage / Expiry" },
  { key: "shrinkage", label: "Theft / Unexplained Loss" },
  { key: "internal_use", label: "Internal Company Use" },
  { key: "correction", label: "Inventory Data Correction" },
  { key: "other", label: "Other Reason" },
];

function TransferStatusPill({ status }: { status: StockTransfer["status"] }) {
  const tone = status === "received" ? "success" : status === "dispatched" ? "warning" : "neutral";
  return <StatusPill tone={tone}>{capitalise(status)}</StatusPill>;
}

function CountStatusPill({ status }: { status: StockCount["status"] }) {
  const tone = status === "completed" ? "success" : status === "in_progress" ? "warning" : "neutral";
  return <StatusPill tone={tone}>{capitalise(status.replace("_", " "))}</StatusPill>;
}

function CatalogueContent({ workspaceId, currency }: WorkspaceInfo) {
  const [tab, setTab] = useState<InventoryTab>("balances");

  // Drawers
  const [isItemOpen, setIsItemOpen] = useState(false);
  const [isOpeningStockOpen, setIsOpeningStockOpen] = useState(false);
  const [isOutletOpen, setIsOutletOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isCountOpen, setIsCountOpen] = useState(false);
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const [isReservationOpen, setIsReservationOpen] = useState(false);

  // Variant manager drawer state
  const [selectedProductForVariants, setSelectedProductForVariants] = useState<CatalogueItem | null>(null);
  const [isAddOptionOpen, setIsAddOptionOpen] = useState(false);
  const [isAddVariantOpen, setIsAddVariantOpen] = useState(false);

  // Transfer receive drawer state
  const [selectedTransferForReceive, setSelectedTransferForReceive] = useState<StockTransfer | null>(null);
  const [receiveQuantity, setReceiveQuantity] = useState("");

  // Count record lines drawer state
  const [selectedCountForRecord, setSelectedCountForRecord] = useState<StockCount | null>(null);
  const [countLineValues, setCountLineValues] = useState<Record<number, string>>({});

  // Queries
  const catalogue = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "catalogue"],
    queryFn: () => financeApi.listCatalogueItems(workspaceId),
  });
  const balances = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "inventory-balances"],
    queryFn: () => financeApi.listInventoryBalances(workspaceId),
  });
  const outlets = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "outlets"],
    queryFn: () => financeApi.listOutlets(workspaceId),
  });
  const transfers = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "transfers"],
    queryFn: () => financeApi.listStockTransfers(workspaceId),
  });
  const counts = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "counts"],
    queryFn: () => financeApi.listStockCounts(workspaceId),
  });
  const adjustments = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "adjustments"],
    queryFn: () => financeApi.listStockAdjustments(workspaceId),
  });
  const reservations = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "reservations"],
    queryFn: () => financeApi.listStockReservations(workspaceId),
  });

  // Product variants & options query for selected product
  const productOptions = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "product-options", selectedProductForVariants?.id],
    queryFn: () => (selectedProductForVariants ? financeApi.listProductOptions(workspaceId, selectedProductForVariants.id) : Promise.resolve([])),
    enabled: !!selectedProductForVariants,
  });
  const productVariants = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "product-variants", selectedProductForVariants?.id],
    queryFn: () => (selectedProductForVariants ? financeApi.listProductVariants(workspaceId, selectedProductForVariants.id) : Promise.resolve([])),
    enabled: !!selectedProductForVariants,
  });

  // Forms
  const itemForm = useForm<CatalogueItemValues>({
    resolver: zodResolver(catalogueItemSchema),
    defaultValues: { name: "", kind: "service", status: "active", unit_name: "each", selling_price: "", sku: "", description: "" },
  });
  const openingForm = useForm<OpeningStockValues>({
    resolver: zodResolver(openingStockSchema),
    defaultValues: { product_id: "", location_id: "", quantity: "", unit_cost: "", effective_on: new Date().toISOString().slice(0, 10), reason: "" },
  });
  const outletForm = useForm<OutletValues>({
    resolver: zodResolver(outletSchema),
    defaultValues: { name: "", location_type: "outlet", code: "", address: "", phone: "" },
  });
  const transferForm = useForm<StockTransferValues>({
    resolver: zodResolver(stockTransferSchema),
    defaultValues: { source_location_id: "", destination_location_id: "", product_id: "", quantity: "", notes: "" },
  });
  const countForm = useForm<StockCountValues>({
    resolver: zodResolver(stockCountSchema),
    defaultValues: { location_id: "", scope: "full", notes: "" },
  });
  const adjustmentForm = useForm<StockAdjustmentValues>({
    resolver: zodResolver(stockAdjustmentSchema),
    defaultValues: { location_id: "", reason_code: "damage", product_id: "", quantity_delta: "", unit_cost: "", notes: "" },
  });
  const reservationForm = useForm<StockReservationValues>({
    resolver: zodResolver(stockReservationSchema),
    defaultValues: { product_id: "", location_id: "", quantity: "", notes: "" },
  });
  const optionForm = useForm<ProductOptionValues>({
    resolver: zodResolver(productOptionSchema),
    defaultValues: { name: "", values: "" },
  });
  const variantForm = useForm<ProductVariantValues>({
    resolver: zodResolver(productVariantSchema),
    defaultValues: { name: "", selling_price: "", cost_price: "", sku: "", barcode: "" },
  });

  // Actions
  const createItem = useFinanceAction(
    workspaceId,
    (values: CatalogueItemValues, key: string) =>
      financeApi.createCatalogueItem(
        workspaceId,
        {
          ...values,
          sku: values.sku || undefined,
          description: values.description || undefined,
          currency,
        },
        key,
      ),
    { success: "Catalogue item added", onDone: () => { setIsItemOpen(false); itemForm.reset(); } },
  );

  const createOpeningStock = useFinanceAction(
    workspaceId,
    (values: OpeningStockValues, key: string) =>
      financeApi.createOpeningStock(
        workspaceId,
        {
          ...values,
          product_id: Number(values.product_id),
          location_id: values.location_id ? Number(values.location_id) : undefined,
          currency,
        },
        key,
      ),
    { success: "Opening stock recorded", onDone: () => { setIsOpeningStockOpen(false); openingForm.reset(); } },
  );

  const createOutlet = useFinanceAction(
    workspaceId,
    (values: OutletValues) =>
      financeApi.createOutlet(workspaceId, {
        ...values,
        code: values.code || undefined,
        address: values.address || undefined,
        phone: values.phone || undefined,
      }),
    { success: "Outlet created", onDone: () => { setIsOutletOpen(false); outletForm.reset(); } },
  );

  const createTransfer = useFinanceAction(
    workspaceId,
    (values: StockTransferValues, key: string) =>
      financeApi.createStockTransfer(
        workspaceId,
        {
          source_location_id: Number(values.source_location_id),
          destination_location_id: Number(values.destination_location_id),
          notes: values.notes || undefined,
          lines: [{ product_id: Number(values.product_id), quantity_requested: values.quantity }],
        },
        key,
      ),
    { success: "Transfer draft created", onDone: () => { setIsTransferOpen(false); transferForm.reset(); } },
  );

  const dispatchTransfer = useFinanceAction(
    workspaceId,
    (transferId: number) =>
      financeApi.dispatchStockTransfer(workspaceId, transferId, { occurred_on: new Date().toISOString().slice(0, 10) }),
    { success: "Transfer dispatched into transit" },
  );

  const receiveTransfer = useFinanceAction(
    workspaceId,
    (transfer: StockTransfer) => {
      const line = transfer.lines?.[0];
      return financeApi.receiveStockTransfer(workspaceId, transfer.id, {
        occurred_on: new Date().toISOString().slice(0, 10),
        lines: line ? [{ line_id: line.id, quantity_received: receiveQuantity || line.quantity_dispatched }] : [],
      });
    },
    { success: "Transfer received at destination", onDone: () => { setSelectedTransferForReceive(null); setReceiveQuantity(""); } },
  );

  const startCount = useFinanceAction(
    workspaceId,
    (values: StockCountValues, key: string) =>
      financeApi.startStockCount(
        workspaceId,
        {
          location_id: Number(values.location_id),
          scope: values.scope,
          notes: values.notes || undefined,
        },
        key,
      ),
    { success: "Stock count audit started", onDone: () => { setIsCountOpen(false); countForm.reset(); } },
  );

  const recordCountLines = useFinanceAction(
    workspaceId,
    (count: StockCount) => {
      const linesToRecord = (count.lines ?? []).map((l) => ({
        line_id: l.id,
        counted_quantity: countLineValues[l.id] || l.expected_quantity,
      }));
      return financeApi.recordStockCountLines(workspaceId, count.id, { lines: linesToRecord });
    },
    { success: "Count values recorded", onDone: () => setSelectedCountForRecord(null) },
  );

  const approveCount = useFinanceAction(
    workspaceId,
    (countId: number) =>
      financeApi.approveStockCount(workspaceId, countId, { occurred_on: new Date().toISOString().slice(0, 10) }),
    { success: "Stock count approved and inventory adjusted" },
  );

  const createAdjustment = useFinanceAction(
    workspaceId,
    (values: StockAdjustmentValues, key: string) =>
      financeApi.createStockAdjustment(
        workspaceId,
        {
          location_id: Number(values.location_id),
          reason_code: values.reason_code,
          notes: values.notes || undefined,
          occurred_on: new Date().toISOString().slice(0, 10),
          lines: [{
            product_id: Number(values.product_id),
            quantity_delta: values.quantity_delta,
            unit_cost: values.unit_cost || undefined,
          }],
        },
        key,
      ),
    { success: "Stock adjustment posted", onDone: () => { setIsAdjustmentOpen(false); adjustmentForm.reset(); } },
  );

  const createReservation = useFinanceAction(
    workspaceId,
    (values: StockReservationValues, key: string) =>
      financeApi.createStockReservation(
        workspaceId,
        {
          product_id: Number(values.product_id),
          location_id: values.location_id ? Number(values.location_id) : undefined,
          quantity: values.quantity,
          notes: values.notes || undefined,
        },
        key,
      ),
    { success: "Stock reserved", onDone: () => { setIsReservationOpen(false); reservationForm.reset(); } },
  );

  const releaseReservation = useFinanceAction(
    workspaceId,
    (id: number) => financeApi.releaseStockReservation(workspaceId, id),
    { success: "Reservation released" },
  );

  const createOption = useFinanceAction(
    workspaceId,
    (values: ProductOptionValues) => {
      if (!selectedProductForVariants) return Promise.reject(new Error("No product selected"));
      const vals = values.values.split(",").map((v) => v.trim()).filter(Boolean);
      return financeApi.createProductOption(workspaceId, selectedProductForVariants.id, {
        name: values.name,
        values: vals,
      });
    },
    { success: "Option created", onDone: () => { setIsAddOptionOpen(false); optionForm.reset(); } },
  );

  const createVariant = useFinanceAction(
    workspaceId,
    (values: ProductVariantValues) => {
      if (!selectedProductForVariants) return Promise.reject(new Error("No product selected"));
      return financeApi.createProductVariant(workspaceId, selectedProductForVariants.id, {
        name: values.name,
        selling_price: values.selling_price,
        cost_price: values.cost_price || undefined,
        sku: values.sku || undefined,
        barcode: values.barcode || undefined,
      });
    },
    { success: "Variant created", onDone: () => { setIsAddVariantOpen(false); variantForm.reset(); } },
  );

  // Dropdown options
  const stockProducts = (catalogue.data ?? [])
    .filter((item) => item.kind === "stock_tracked")
    .map((item) => ({ key: String(item.id), label: `${item.name} · ${item.unit_name}` }));

  const outletOptions = (outlets.data ?? []).map((o) => ({
    key: String(o.id),
    label: `${o.name}${o.is_default ? " (Default)" : ""}`,
  }));

  return (
    <Page>
      <PageHeader
        title="Inventory"
        description="Stock on hand across outlets, with transfers, counts and adjustments. Products live under Products."
        actions={
          <div className="flex flex-wrap gap-2">
            <AppButton variant="secondary" startContent={<Warehouse weight="duotone" />} label="Opening stock" onPress={() => setIsOpeningStockOpen(true)} />
            <AppButton variant="secondary" startContent={<Storefront weight="duotone" />} label="New outlet" onPress={() => setIsOutletOpen(true)} />
            <Link href="/products" className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-[14px] font-medium text-accent-foreground transition-opacity hover:opacity-90">Manage products</Link>
          </div>
        }
      />
      <InventoryStats workspaceId={workspaceId} currency={currency} />

      <Segmented aria-label="Inventory sections" options={INVENTORY_TABS} value={tab} onChange={setTab} />

      {/* TAB 1: STOCK BALANCES */}
      {tab === "balances" && (
        <DataView<InventoryBalance>
          title="Stock on hand & reservations"
          rows={balances.data ?? []}
          rowKey={(row) => row.id}
          isLoading={balances.isPending}
          isError={balances.isError}
          searchPlaceholder="Search product or outlet"
          getSearchText={(row) => `${row.product_name} ${row.location_name}`}
          empty={
            <EmptyState
              icon={Warehouse}
              title="No stock balances recorded"
              description="Add a stock-tracked product, then record its opening stock to start tracking."
              action={<AppButton startContent={<Warehouse weight="duotone" />} label="Record opening stock" onPress={() => setIsOpeningStockOpen(true)} />}
            />
          }
          columns={[
            { key: "product", label: "Product", render: (row) => <span className="font-medium text-foreground">{row.product_name}</span> },
            { key: "location", label: "Outlet / Location", render: (row) => row.location_name },
            { key: "on_hand", label: "On hand", align: "right", render: (row) => <span className="tabular font-medium">{row.quantity_on_hand}</span> },
            { key: "reserved", label: "Reserved", align: "right", render: (row) => <span className="tabular text-muted">{row.reserved_quantity ?? "0.0000"}</span> },
            { key: "available", label: "Available", align: "right", render: (row) => <span className="tabular font-semibold text-primary">{row.available_quantity ?? row.quantity_on_hand}</span> },
            { key: "in_transit", label: "In transit", align: "right", render: (row) => <span className="tabular text-secondary">{row.in_transit_quantity ?? "0.0000"}</span> },
            { key: "value", label: "Inventory value", align: "right", render: (row) => <span className="tabular font-semibold">{formatMinorAmount(row.value_on_hand_minor, currency, 2)}</span> },
          ]}
          renderCard={(row) => (
            <RecordCard
              icon={<Warehouse size={18} weight="duotone" />}
              iconClassName="bg-primary-soft text-primary"
              reference={row.location_name}
              title={row.product_name}
              amount={formatMinorAmount(row.value_on_hand_minor, currency, 2)}
              meta={[
                { label: "On hand", value: row.quantity_on_hand },
                { label: "Reserved", value: row.reserved_quantity ?? "0.0000" },
                { label: "Available", value: row.available_quantity ?? row.quantity_on_hand },
                { label: "In transit", value: row.in_transit_quantity ?? "0.0000" },
              ]}
            />
          )}
        />
      )}

      {/* TAB 3: OUTLETS & LOCATIONS */}
      {tab === "outlets" && (
        <DataView<InventoryOutlet>
          title="Outlets and warehouses"
          rows={outlets.data ?? []}
          rowKey={(item) => item.id}
          isLoading={outlets.isPending}
          isError={outlets.isError}
          searchPlaceholder="Search outlet name or code"
          getSearchText={(item) => `${item.name} ${item.code ?? ""} ${item.location_type}`}
          empty={
            <EmptyState
              icon={Storefront}
              title="No custom outlets created"
              description="Create shops, warehouses or branches to track inventory by physical location."
              action={<AppButton startContent={<Storefront weight="duotone" />} label="New outlet" onPress={() => setIsOutletOpen(true)} />}
            />
          }
          columns={[
            {
              key: "name",
              label: "Outlet name",
              render: (item) => (
                <div>
                  <span className="font-medium text-foreground">{item.name}</span>
                  {item.is_default && <span className="ml-2 inline-flex items-center text-xs font-semibold text-primary">Default</span>}
                </div>
              ),
            },
            { key: "type", label: "Type", render: (item) => capitalise(item.location_type) },
            { key: "code", label: "Code", render: (item) => item.code || "—" },
            { key: "address", label: "Address", render: (item) => item.address || "—" },
            { key: "phone", label: "Phone", render: (item) => item.phone || "—" },
            {
              key: "status",
              label: "Status",
              render: (item) => <StatusPill tone={item.is_active ? "success" : "neutral"}>{item.is_active ? "Active" : "Archived"}</StatusPill>,
            },
          ]}
          renderCard={(item) => (
            <RecordCard
              icon={<Storefront size={18} weight="duotone" />}
              iconClassName="bg-primary-soft text-primary"
              reference={item.code || capitalise(item.location_type)}
              title={item.name}
              amount={item.code || "—"}
              status={<StatusPill tone={item.is_active ? "success" : "neutral"}>{item.is_active ? "Active" : "Archived"}</StatusPill>}
              meta={[
                { label: "Address", value: item.address || "—" },
                { label: "Default", value: item.is_default ? "Yes" : "No" },
              ]}
            />
          )}
        />
      )}

      {/* TAB 4: TRANSFERS */}
      {tab === "transfers" && (
        <DataView<StockTransfer>
          title="Stock transfers between locations"
          rows={transfers.data ?? []}
          rowKey={(trf) => trf.id}
          isLoading={transfers.isPending}
          isError={transfers.isError}
          searchPlaceholder="Search transfer number"
          getSearchText={(trf) => `${trf.transfer_number} ${trf.source_location_name} ${trf.destination_location_name}`}
          empty={
            <EmptyState
              icon={ArrowsLeftRight}
              title="No transfers recorded"
              description="Move inventory safely between warehouses and storefronts with dispatch & receipt tracking."
              action={<AppButton startContent={<ArrowsLeftRight weight="duotone" />} label="New transfer" onPress={() => setIsTransferOpen(true)} />}
            />
          }
          columns={[
            { key: "number", label: "Transfer #", render: (trf) => <span className="font-mono text-sm font-semibold">{trf.transfer_number}</span> },
            { key: "source", label: "From", render: (trf) => trf.source_location_name },
            { key: "destination", label: "To", render: (trf) => trf.destination_location_name },
            { key: "status", label: "Status", render: (trf) => <TransferStatusPill status={trf.status} /> },
            { key: "created", label: "Created", render: (trf) => formatDate(trf.created_at) },
            {
              key: "actions",
              label: "Actions",
              align: "right",
              render: (trf) => (
                <div className="flex justify-end gap-2">
                  {trf.status === "draft" && (
                    <AppButton
                      size="sm"
                      label="Dispatch"
                      onPress={() => dispatchTransfer.mutate(trf.id)}
                      isLoading={dispatchTransfer.isPending}
                    />
                  )}
                  {trf.status === "dispatched" && (
                    <AppButton
                      size="sm"
                      variant="secondary"
                      label="Receive"
                      onPress={() => setSelectedTransferForReceive(trf)}
                    />
                  )}
                </div>
              ),
            },
          ]}
          renderCard={(trf) => (
            <RecordCard
              icon={<ArrowsLeftRight size={18} weight="duotone" />}
              iconClassName="bg-primary-soft text-primary"
              reference={trf.transfer_number}
              title={`${trf.source_location_name} → ${trf.destination_location_name}`}
              amount={capitalise(trf.status)}
              status={<TransferStatusPill status={trf.status} />}
              meta={[{ label: "Date", value: formatDate(trf.created_at) }]}
            />
          )}
        />
      )}

      {/* TAB 5: STOCK COUNTS */}
      {tab === "counts" && (
        <DataView<StockCount>
          title="Physical stock audits"
          rows={counts.data ?? []}
          rowKey={(cnt) => cnt.id}
          isLoading={counts.isPending}
          isError={counts.isError}
          searchPlaceholder="Search count number"
          getSearchText={(cnt) => `${cnt.count_number} ${cnt.location_name}`}
          empty={
            <EmptyState
              icon={ClipboardText}
              title="No physical audits started"
              description="Start a stock count to snapshot expected inventory, record physical counts, and reconcile shrinkage."
              action={<AppButton startContent={<ClipboardText weight="duotone" />} label="Start audit" onPress={() => setIsCountOpen(true)} />}
            />
          }
          columns={[
            { key: "number", label: "Audit #", render: (cnt) => <span className="font-mono text-sm font-semibold">{cnt.count_number}</span> },
            { key: "location", label: "Location", render: (cnt) => cnt.location_name },
            { key: "scope", label: "Scope", render: (cnt) => capitalise(cnt.scope) },
            { key: "status", label: "Status", render: (cnt) => <CountStatusPill status={cnt.status} /> },
            { key: "created", label: "Created", render: (cnt) => formatDate(cnt.created_at) },
            {
              key: "actions",
              label: "Actions",
              align: "right",
              render: (cnt) => (
                <div className="flex justify-end gap-2">
                  {cnt.status === "in_progress" && (
                    <>
                      <AppButton
                        size="sm"
                        variant="secondary"
                        label="Record counts"
                        onPress={() => {
                          setSelectedCountForRecord(cnt);
                          const initial: Record<number, string> = {};
                          (cnt.lines ?? []).forEach((l) => {
                            initial[l.id] = l.counted_quantity ?? l.expected_quantity;
                          });
                          setCountLineValues(initial);
                        }}
                      />
                      <AppButton
                        size="sm"
                        label="Approve variance"
                        onPress={() => approveCount.mutate(cnt.id)}
                        isLoading={approveCount.isPending}
                      />
                    </>
                  )}
                </div>
              ),
            },
          ]}
          renderCard={(cnt) => (
            <RecordCard
              icon={<ClipboardText size={18} weight="duotone" />}
              iconClassName="bg-primary-soft text-primary"
              reference={cnt.count_number}
              title={cnt.location_name}
              amount={capitalise(cnt.scope)}
              status={<CountStatusPill status={cnt.status} />}
              meta={[{ label: "Scope", value: capitalise(cnt.scope) }, { label: "Date", value: formatDate(cnt.created_at) }]}
            />
          )}
        />
      )}

      {/* TAB 6: ADJUSTMENTS */}
      {tab === "adjustments" && (
        <DataView<StockAdjustment>
          title="Stock adjustments & write-offs"
          rows={adjustments.data ?? []}
          rowKey={(adj) => adj.id}
          isLoading={adjustments.isPending}
          isError={adjustments.isError}
          searchPlaceholder="Search adjustment number"
          getSearchText={(adj) => `${adj.adjustment_number} ${adj.location_name} ${adj.reason_code}`}
          empty={
            <EmptyState
              icon={WarningCircle}
              title="No adjustments recorded"
              description="Record damage, breakage, shrinkage or found stock to keep your balance sheet accurate."
              action={<AppButton startContent={<WarningCircle weight="duotone" />} label="New adjustment" onPress={() => setIsAdjustmentOpen(true)} />}
            />
          }
          columns={[
            { key: "number", label: "Adjustment #", render: (adj) => <span className="font-mono text-sm font-semibold">{adj.adjustment_number}</span> },
            { key: "location", label: "Location", render: (adj) => adj.location_name },
            { key: "reason", label: "Reason", render: (adj) => capitalise(adj.reason_code.replace("_", " ")) },
            { key: "notes", label: "Notes", render: (adj) => adj.notes || "—" },
            { key: "created", label: "Date", render: (adj) => formatDate(adj.created_at) },
          ]}
          renderCard={(adj) => (
            <RecordCard
              icon={<WarningCircle size={18} weight="duotone" />}
              iconClassName="bg-warning-soft text-warning"
              reference={adj.adjustment_number}
              title={capitalise(adj.reason_code.replace("_", " "))}
              amount={capitalise(adj.reason_code.replace("_", " "))}
              meta={[{ label: "Location", value: adj.location_name }, { label: "Date", value: formatDate(adj.created_at) }]}
            />
          )}
        />
      )}

      {/* TAB 7: RESERVATIONS */}
      {tab === "reservations" && (
        <DataView<StockReservation>
          title="Active order reservations"
          rows={reservations.data ?? []}
          rowKey={(res) => res.id}
          isLoading={reservations.isPending}
          isError={reservations.isError}
          searchPlaceholder="Search product"
          getSearchText={(res) => `${res.product_name ?? ""} ${res.status}`}
          empty={
            <EmptyState
              icon={BookmarkSimple}
              title="No active stock reservations"
              description="Reservations hold inventory for confirmed sales orders without reducing on-hand stock."
              action={<AppButton startContent={<BookmarkSimple weight="duotone" />} label="New reservation" onPress={() => setIsReservationOpen(true)} />}
            />
          }
          columns={[
            { key: "product", label: "Product", render: (res) => <span className="font-medium text-foreground">{res.product_name || `Product #${res.product_id}`}</span> },
            { key: "quantity", label: "Reserved quantity", align: "right", render: (res) => <span className="tabular font-semibold text-primary">{res.quantity}</span> },
            { key: "status", label: "Status", render: (res) => <StatusPill tone={res.status === "active" ? "warning" : "neutral"}>{capitalise(res.status)}</StatusPill> },
            { key: "notes", label: "Notes", render: (res) => res.notes || "—" },
            { key: "created", label: "Date", render: (res) => formatDate(res.created_at) },
            {
              key: "actions",
              label: "Actions",
              align: "right",
              render: (res) => (
                res.status === "active" && (
                  <AppButton
                    size="sm"
                    variant="secondary"
                    label="Release"
                    onPress={() => releaseReservation.mutate(res.id)}
                    isLoading={releaseReservation.isPending}
                  />
                )
              ),
            },
          ]}
          renderCard={(res) => (
            <RecordCard
              icon={<BookmarkSimple size={18} weight="duotone" />}
              iconClassName="bg-warning-soft text-warning"
              reference={res.status}
              title={res.product_name || `Product #${res.product_id}`}
              amount={res.quantity}
              meta={[{ label: "Status", value: capitalise(res.status) }, { label: "Date", value: formatDate(res.created_at) }]}
            />
          )}
        />
      )}

      {/* DRAWERS */}

      {/* 1. Add Product / Service Drawer */}
      <FormDrawer
        isOpen={isItemOpen}
        onOpenChange={(open) => !open && setIsItemOpen(false)}
        title="Add product or service"
        description="Creates catalogue records. Stock quantities are established via opening stock or procurement."
        submitLabel="Add item"
        isSubmitting={createItem.isPending}
        onSubmit={itemForm.handleSubmit((values) => createItem.mutate(values))}
      >
        <TextInputField control={itemForm.control} name="name" label="Name" placeholder="Classic T-Shirt" isRequired />
        <SelectField control={itemForm.control} name="kind" label="What do you sell?" options={ITEM_TYPES} isRequired />
        <TextInputField control={itemForm.control} name="unit_name" label="Unit" placeholder="piece, kg, bag" isRequired />
        <MoneyField control={itemForm.control} name="selling_price" label="Selling price" currency={currency} isRequired />
        <TextInputField control={itemForm.control} name="sku" label="SKU" placeholder="Optional identifier" />
        <SelectField control={itemForm.control} name="status" label="Availability" options={ITEM_STATES} isRequired />
        <NotesField control={itemForm.control} name="description" label="Description" placeholder="Notes for catalogue" />
        {itemForm.watch("kind") === "stock_tracked" ? (
          <p className="flex gap-2 text-[13px] leading-relaxed text-muted">
            <SealCheck size={17} weight="duotone" className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            Stock-tracked products start with zero quantity. Use &quot;Opening stock&quot; or goods receipts to record inventory.
          </p>
        ) : null}
      </FormDrawer>

      {/* 2. Opening Stock Drawer */}
      <FormDrawer
        isOpen={isOpeningStockOpen}
        onOpenChange={(open) => !open && setIsOpeningStockOpen(false)}
        title="Record opening stock"
        description="Establish starting inventory balance and weighted-average cost."
        submitLabel="Save opening stock"
        isSubmitting={createOpeningStock.isPending}
        onSubmit={openingForm.handleSubmit((values) => createOpeningStock.mutate(values))}
      >
        <SelectField control={openingForm.control} name="product_id" label="Stock product" options={stockProducts} isRequired />
        <SelectField control={openingForm.control} name="location_id" label="Location / Outlet" options={outletOptions} />
        <TextInputField control={openingForm.control} name="quantity" label="Quantity on hand" placeholder="50" isRequired />
        <MoneyField control={openingForm.control} name="unit_cost" label="Unit cost" currency={currency} isRequired />
        <TextInputField control={openingForm.control} name="effective_on" label="Effective date" type="date" isRequired />
        <NotesField control={openingForm.control} name="reason" label="Reason" placeholder="Launch opening stock" isRequired />
      </FormDrawer>

      {/* 3. Add Outlet Drawer */}
      <FormDrawer
        isOpen={isOutletOpen}
        onOpenChange={(open) => !open && setIsOutletOpen(false)}
        title="Add outlet or warehouse"
        description="Set up distinct physical or retail locations for your inventory."
        submitLabel="Create outlet"
        isSubmitting={createOutlet.isPending}
        onSubmit={outletForm.handleSubmit((values) => createOutlet.mutate(values))}
      >
        <TextInputField control={outletForm.control} name="name" label="Outlet name" placeholder="Ikeja Retail Store" isRequired />
        <SelectField control={outletForm.control} name="location_type" label="Location type" options={OUTLET_TYPES} isRequired />
        <TextInputField control={outletForm.control} name="code" label="Short code" placeholder="IKJ-01" />
        <TextInputField control={outletForm.control} name="address" label="Address" placeholder="Plot 12 Commercial Ave" />
        <TextInputField control={outletForm.control} name="phone" label="Phone number" placeholder="+2348012345678" />
      </FormDrawer>

      {/* 4. Stock Transfer Drawer */}
      <FormDrawer
        isOpen={isTransferOpen}
        onOpenChange={(open) => !open && setIsTransferOpen(false)}
        title="Transfer stock between outlets"
        description="Creates a transfer draft. Dispatching will move stock into in-transit status."
        submitLabel="Create transfer"
        isSubmitting={createTransfer.isPending}
        onSubmit={transferForm.handleSubmit((values) => createTransfer.mutate(values))}
      >
        <SelectField control={transferForm.control} name="source_location_id" label="Source outlet (from)" options={outletOptions} isRequired />
        <SelectField control={transferForm.control} name="destination_location_id" label="Destination outlet (to)" options={outletOptions} isRequired />
        <SelectField control={transferForm.control} name="product_id" label="Product to transfer" options={stockProducts} isRequired />
        <TextInputField control={transferForm.control} name="quantity" label="Quantity to transfer" placeholder="10" isRequired />
        <NotesField control={transferForm.control} name="notes" label="Transfer notes" placeholder="Replenishment" />
      </FormDrawer>

      {/* 5. Receive Transfer Drawer */}
      <FormDrawer
        isOpen={!!selectedTransferForReceive}
        onOpenChange={(open) => !open && setSelectedTransferForReceive(null)}
        title="Receive dispatched transfer"
        description="Accept transferred inventory at destination. Any shortage/damage is recognized as variance."
        submitLabel="Confirm receipt"
        isSubmitting={receiveTransfer.isPending}
        onSubmit={(e) => {
          e.preventDefault();
          if (selectedTransferForReceive) receiveTransfer.mutate(selectedTransferForReceive);
        }}
      >
        {selectedTransferForReceive && (
          <div className="space-y-4">
            <div className="rounded-medium bg-surface p-3 text-sm">
              <p className="font-semibold text-foreground">Transfer #{selectedTransferForReceive.transfer_number}</p>
              <p className="text-muted">{selectedTransferForReceive.source_location_name} → {selectedTransferForReceive.destination_location_name}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-muted">Quantity Received</label>
              <input
                type="text"
                className="mt-1 w-full rounded-medium border border-border bg-input px-3 py-2 text-foreground"
                placeholder={selectedTransferForReceive.lines?.[0]?.quantity_dispatched ?? "0"}
                value={receiveQuantity}
                onChange={(e) => setReceiveQuantity(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted">Leave blank to accept the full dispatched quantity.</p>
            </div>
          </div>
        )}
      </FormDrawer>

      {/* 6. Start Stock Count Drawer */}
      <FormDrawer
        isOpen={isCountOpen}
        onOpenChange={(open) => !open && setIsCountOpen(false)}
        title="Start physical stock audit"
        description="Snapshots expected inventory on hand for verification."
        submitLabel="Start audit"
        isSubmitting={startCount.isPending}
        onSubmit={countForm.handleSubmit((values) => startCount.mutate(values))}
      >
        <SelectField control={countForm.control} name="location_id" label="Location to audit" options={outletOptions} isRequired />
        <SelectField control={countForm.control} name="scope" label="Audit scope" options={COUNT_SCOPES} isRequired />
        <NotesField control={countForm.control} name="notes" label="Audit notes" placeholder="Year-end verification" />
      </FormDrawer>

      {/* 7. Record Count Values Drawer */}
      <FormDrawer
        isOpen={!!selectedCountForRecord}
        onOpenChange={(open) => !open && setSelectedCountForRecord(null)}
        title="Record counted inventory"
        description="Enter the physical count found during the audit."
        submitLabel="Save counts"
        isSubmitting={recordCountLines.isPending}
        onSubmit={(e) => {
          e.preventDefault();
          if (selectedCountForRecord) recordCountLines.mutate(selectedCountForRecord);
        }}
      >
        {selectedCountForRecord && (
          <div className="space-y-4">
            {(selectedCountForRecord.lines ?? []).map((line) => (
              <div key={line.id} className="rounded-medium border border-border p-3">
                <p className="font-medium text-foreground">{line.product_name}</p>
                <p className="text-xs text-muted">Expected on hand: {line.expected_quantity}</p>
                <div className="mt-2">
                  <label className="block text-xs font-semibold uppercase text-muted">Physical Count</label>
                  <input
                    type="text"
                    className="mt-1 w-full rounded-medium border border-border bg-input px-3 py-2 text-foreground"
                    value={countLineValues[line.id] ?? line.expected_quantity}
                    onChange={(e) => setCountLineValues({ ...countLineValues, [line.id]: e.target.value })}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </FormDrawer>

      {/* 8. Stock Adjustment Drawer */}
      <FormDrawer
        isOpen={isAdjustmentOpen}
        onOpenChange={(open) => !open && setIsAdjustmentOpen(false)}
        title="Record stock adjustment"
        description="Adjust on-hand inventory for breakage, damage, shrinkage, or found stock."
        submitLabel="Post adjustment"
        isSubmitting={createAdjustment.isPending}
        onSubmit={adjustmentForm.handleSubmit((values) => createAdjustment.mutate(values))}
      >
        <SelectField control={adjustmentForm.control} name="location_id" label="Location" options={outletOptions} isRequired />
        <SelectField control={adjustmentForm.control} name="reason_code" label="Adjustment reason" options={ADJUSTMENT_REASONS} isRequired />
        <SelectField control={adjustmentForm.control} name="product_id" label="Product" options={stockProducts} isRequired />
        <TextInputField control={adjustmentForm.control} name="quantity_delta" label="Quantity delta" placeholder="-2 (write-off) or +1 (found)" isRequired />
        <MoneyField control={adjustmentForm.control} name="unit_cost" label="Custom unit cost (optional)" currency={currency} />
        <NotesField control={adjustmentForm.control} name="notes" label="Reason & documentation" placeholder="Explain the discrepancy" isRequired />
      </FormDrawer>

      {/* 9. Stock Reservation Drawer */}
      <FormDrawer
        isOpen={isReservationOpen}
        onOpenChange={(open) => !open && setIsReservationOpen(false)}
        title="Reserve stock for customer order"
        description="Protects available quantity from overselling without reducing on-hand inventory."
        submitLabel="Reserve quantity"
        isSubmitting={createReservation.isPending}
        onSubmit={reservationForm.handleSubmit((values) => createReservation.mutate(values))}
      >
        <SelectField control={reservationForm.control} name="product_id" label="Product" options={stockProducts} isRequired />
        <SelectField control={reservationForm.control} name="location_id" label="Location (optional)" options={outletOptions} />
        <TextInputField control={reservationForm.control} name="quantity" label="Quantity to hold" placeholder="5" isRequired />
        <NotesField control={reservationForm.control} name="notes" label="Order reference / customer notes" placeholder="Hold for Order #104" />
      </FormDrawer>

      {/* 10. Product Variants & Options Matrix Drawer */}
      <FormDrawer
        isOpen={!!selectedProductForVariants}
        onOpenChange={(open) => !open && setSelectedProductForVariants(null)}
        title={`Options & Variants: ${selectedProductForVariants?.name ?? ""}`}
        description="Define product options (e.g. Size, Color) and manage sellable variants."
        submitLabel="Close"
        onSubmit={(e) => {
          e.preventDefault();
          setSelectedProductForVariants(null);
        }}
      >
        {selectedProductForVariants && (
          <div className="space-y-6">
            {/* Options Section */}
            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold uppercase text-muted">Product Options</h4>
                <AppButton size="sm" variant="secondary" label="Add option" onPress={() => setIsAddOptionOpen(true)} />
              </div>
              <div className="mt-2 space-y-2">
                {(productOptions.data ?? []).length === 0 ? (
                  <p className="text-xs text-muted">No options configured yet (e.g. Size, Color).</p>
                ) : (
                  (productOptions.data ?? []).map((opt: ProductOption) => (
                    <div key={opt.id} className="rounded-medium bg-surface p-2.5 text-xs">
                      <span className="font-semibold text-foreground">{opt.name}: </span>
                      <span className="text-muted">{opt.values.join(", ")}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Add Option Sub-Form */}
            {isAddOptionOpen && (
              <div className="rounded-medium border border-border p-3 space-y-3">
                <p className="text-xs font-semibold text-foreground">New Option</p>
                <TextInputField control={optionForm.control} name="name" label="Option name" placeholder="Size" isRequired />
                <TextInputField control={optionForm.control} name="values" label="Values (comma-separated)" placeholder="S, M, L, XL" isRequired />
                <div className="flex gap-2">
                  <AppButton size="sm" label="Save option" onPress={() => { optionForm.handleSubmit((values) => createOption.mutate(values))(); }} isLoading={createOption.isPending} />
                  <AppButton size="sm" variant="secondary" label="Cancel" onPress={() => setIsAddOptionOpen(false)} />
                </div>
              </div>
            )}

            {/* Variants Section */}
            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold uppercase text-muted">Sellable Variants</h4>
                <AppButton size="sm" variant="secondary" label="Add variant" onPress={() => setIsAddVariantOpen(true)} />
              </div>
              <div className="mt-2 space-y-2">
                {(productVariants.data ?? []).length === 0 ? (
                  <p className="text-xs text-muted">Only the default variant exists.</p>
                ) : (
                  (productVariants.data ?? []).map((v: ProductVariant) => (
                    <div key={v.id} className="flex items-center justify-between rounded-medium border border-border p-2.5 text-xs">
                      <div>
                        <span className="font-semibold text-foreground">{v.name}</span>
                        {v.sku && <span className="ml-2 font-mono text-muted">SKU: {v.sku}</span>}
                      </div>
                      <div className="text-right font-medium">
                        <span className="text-foreground">{formatMinorAmount(v.selling_price_minor, v.currency, v.currency_exponent)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Add Variant Sub-Form */}
            {isAddVariantOpen && (
              <div className="rounded-medium border border-border p-3 space-y-3">
                <p className="text-xs font-semibold text-foreground">New Variant</p>
                <TextInputField control={variantForm.control} name="name" label="Variant name" placeholder="Red / Large" isRequired />
                <MoneyField control={variantForm.control} name="selling_price" label="Selling price" currency={currency} isRequired />
                <MoneyField control={variantForm.control} name="cost_price" label="Cost price (optional)" currency={currency} />
                <TextInputField control={variantForm.control} name="sku" label="SKU" placeholder="Optional code" />
                <TextInputField control={variantForm.control} name="barcode" label="Barcode" placeholder="Optional barcode" />
                <div className="flex gap-2">
                  <AppButton size="sm" label="Save variant" onPress={() => { variantForm.handleSubmit((values) => createVariant.mutate(values))(); }} isLoading={createVariant.isPending} />
                  <AppButton size="sm" variant="secondary" label="Cancel" onPress={() => setIsAddVariantOpen(false)} />
                </div>
              </div>
            )}
          </div>
        )}
      </FormDrawer>
    </Page>
  );
}

export function CataloguePage() {
  return <WorkspaceGate businessOnly>{(workspace) => <CatalogueContent key={workspace.workspaceId} {...workspace} />}</WorkspaceGate>;
}
