"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowsLeftRight, Package, Plus, SealCheck, ShoppingBag, Wrench, Warehouse } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { AppButton } from "@/components/ui/app-button";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader, StatusPill } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { capitalise } from "@/lib/format";
import { financeApi, formatMinorAmount, moneyKeys } from "@/lib/money";
import { catalogueItemSchema, openingStockSchema, type CatalogueItemValues, type OpeningStockValues } from "@/lib/schemas/finance.schemas";
import type { CatalogueItem, InventoryBalance } from "@/types/finance";

import { MoneyField, NotesField, SelectField, TextInputField } from "./fields";
import { useFinanceAction, WorkspaceGate, type WorkspaceInfo } from "./shared";

const ITEM_TYPES = [
  { key: "service", label: "Service" },
  { key: "non_stock", label: "Product (no stock tracking)" },
  { key: "stock_tracked", label: "Product (track stock)" },
];

const ITEM_STATES = [
  { key: "active", label: "Active" },
  { key: "draft", label: "Draft" },
];

function kindLabel(kind: CatalogueItem["kind"]) {
  if (kind === "non_stock") return "Product";
  if (kind === "stock_tracked") return "Stock product";
  return "Service";
}

function kindIcon(kind: CatalogueItem["kind"]) {
  return kind === "service" ? Wrench : kind === "stock_tracked" ? Package : ShoppingBag;
}

function ItemStatus({ status }: { status: CatalogueItem["status"] }) {
  return <StatusPill tone={status === "active" ? "success" : "neutral"}>{capitalise(status)}</StatusPill>;
}

function CatalogueContent({ workspaceId, currency }: WorkspaceInfo) {
  const [isOpen, setIsOpen] = useState(false);
  const [isOpeningStockOpen, setIsOpeningStockOpen] = useState(false);
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isCountOpen, setIsCountOpen] = useState(false);
  const catalogue = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "catalogue"],
    queryFn: () => financeApi.listCatalogueItems(workspaceId),
  });
  const balances = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "inventory-balances"],
    queryFn: () => financeApi.listInventoryBalances(workspaceId),
  });
  const form = useForm<CatalogueItemValues>({
    resolver: zodResolver(catalogueItemSchema),
    defaultValues: { name: "", kind: "service", status: "active", unit_name: "each", selling_price: "", sku: "", description: "" },
  });
  const openingForm = useForm<OpeningStockValues>({
    resolver: zodResolver(openingStockSchema),
    defaultValues: { product_id: "", quantity: "", unit_cost: "", effective_on: new Date().toISOString().slice(0, 10), reason: "" },
  });
  const adjustmentForm = useForm<{ location_id:string; product_id:string; quantity_delta:string; unit_cost:string; reason_code:string; effective_on:string; notes:string }>({ defaultValues: { location_id:"", product_id:"", quantity_delta:"", unit_cost:"", reason_code:"correction", effective_on:new Date().toISOString().slice(0,10), notes:"" } });
  const transferForm = useForm<{ source_location_id:string; destination_location_id:string; product_id:string; quantity:string; effective_on:string; notes:string }>({ defaultValues: { source_location_id:"", destination_location_id:"", product_id:"", quantity:"", effective_on:new Date().toISOString().slice(0,10), notes:"" } });
  const countForm = useForm<{ location_id:string; product_id:string; counted_quantity:string; unit_cost:string; counted_at:string; notes:string }>({ defaultValues: { location_id:"", product_id:"", counted_quantity:"", unit_cost:"", counted_at:new Date().toISOString().slice(0,10), notes:"" } });

  const close = () => {
    setIsOpen(false);
    form.reset();
  };
  const create = useFinanceAction(
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
    { success: "Catalogue item added", onDone: close },
  );
  const closeOpeningStock = () => {
    setIsOpeningStockOpen(false);
    openingForm.reset({ product_id: "", quantity: "", unit_cost: "", effective_on: new Date().toISOString().slice(0, 10), reason: "" });
  };
  const createOpeningStock = useFinanceAction(
    workspaceId,
    (values: OpeningStockValues, key: string) => financeApi.createOpeningStock(workspaceId, { ...values, product_id: Number(values.product_id), currency }, key),
    { success: "Opening stock added", onDone: closeOpeningStock },
  );
  const createAdjustment = useFinanceAction(workspaceId, (values: { location_id:string; product_id:string; quantity_delta:string; unit_cost:string; reason_code:string; effective_on:string; notes:string }, key:string) => financeApi.createInventoryAdjustment(workspaceId, { location_id:Number(values.location_id), reason_code:values.reason_code, effective_on:values.effective_on, notes:values.notes || undefined, lines:[{ product_id:Number(values.product_id), quantity_delta:values.quantity_delta, unit_cost:values.unit_cost }] }, key), { success:"Stock adjustment posted", onDone:()=>{setIsAdjustmentOpen(false); adjustmentForm.reset()} });
  const createTransfer = useFinanceAction(workspaceId, (values: { source_location_id:string; destination_location_id:string; product_id:string; quantity:string; effective_on:string; notes:string }, key:string) => financeApi.createInventoryTransfer(workspaceId, { source_location_id:Number(values.source_location_id), destination_location_id:Number(values.destination_location_id), effective_on:values.effective_on, notes:values.notes || undefined, lines:[{ product_id:Number(values.product_id), quantity:values.quantity }] }, key), { success:"Stock transfer posted", onDone:()=>{setIsTransferOpen(false); transferForm.reset()} });
  const createCount = useFinanceAction(workspaceId, (values: { location_id:string; product_id:string; counted_quantity:string; unit_cost:string; counted_at:string; notes:string }, key:string) => financeApi.createStockCount(workspaceId, { location_id:Number(values.location_id), counted_at:values.counted_at, notes:values.notes || undefined, lines:[{ product_id:Number(values.product_id), counted_quantity:values.counted_quantity, unit_cost:values.unit_cost || undefined }] }, key), { success:"Stock count posted", onDone:()=>{setIsCountOpen(false); countForm.reset()} });
  const stockProducts = (catalogue.data ?? []).filter((item) => item.kind === "stock_tracked").map((item) => ({ key: String(item.id), label: `${item.name} · ${item.unit_name}` }));
  const locationOptions = Array.from(new Map((balances.data ?? []).map((row) => [row.location_id, { key:String(row.location_id), label:row.location_name }])).values());

  return (
    <Page>
      <PageHeader
        title="Products & services"
        description="Your catalogue and the stock value held at each location."
        actions={<div className="flex flex-wrap gap-2"><AppButton variant="secondary" startContent={<Warehouse weight="duotone" />} label="Opening stock" onPress={() => setIsOpeningStockOpen(true)} /><AppButton variant="secondary" startContent={<ArrowsLeftRight weight="duotone" />} label="Count stock" onPress={() => setIsCountOpen(true)} /><AppButton variant="secondary" startContent={<ArrowsLeftRight weight="duotone" />} label="Adjust stock" onPress={() => setIsAdjustmentOpen(true)} /><AppButton variant="secondary" startContent={<ArrowsLeftRight weight="duotone" />} label="Transfer stock" onPress={() => setIsTransferOpen(true)} /><AppButton startContent={<Plus weight="bold" />} label="Add item" onPress={() => setIsOpen(true)} /></div>}
      />

      <DataView<InventoryBalance>
        title="Stock on hand"
        rows={balances.data ?? []}
        rowKey={(row) => row.id}
        isLoading={balances.isPending}
        isError={balances.isError}
        renderCard={(row) => <RecordCard icon={<Warehouse size={18} weight="duotone" />} iconClassName="bg-primary-soft text-primary" reference={row.location_name} title={row.product_name} amount={formatMinorAmount(row.value_on_hand_minor, currency, 2)} meta={[{ label: "Quantity", value: row.quantity_on_hand }, { label: "Costing", value: "Weighted average" }]} />}
        empty={<EmptyState icon={Warehouse} title="No stock balances yet" description="Add a stock-tracked product, then record its opening quantity." action={<AppButton startContent={<Warehouse weight="duotone" />} label="Record opening stock" onPress={() => setIsOpeningStockOpen(true)} />} />}
        columns={[
          { key: "product", label: "Product", render: (row) => <span className="font-medium text-foreground">{row.product_name}</span> },
          { key: "location", label: "Location", render: (row) => row.location_name },
          { key: "quantity", label: "Quantity", align: "right", render: (row) => <span className="tabular">{row.quantity_on_hand}</span> },
          { key: "value", label: "Value", align: "right", render: (row) => <span className="tabular font-semibold">{formatMinorAmount(row.value_on_hand_minor, currency, 2)}</span> },
        ]}
      />

      <DataView<CatalogueItem>
        title="Products and services"
        rows={catalogue.data ?? []}
        rowKey={(item) => item.id}
        isLoading={catalogue.isPending}
        isError={catalogue.isError}
        searchPlaceholder="Search products or SKU"
        getSearchText={(item) => `${item.name} ${item.sku ?? ""} ${item.kind}`}
        empty={
          <EmptyState
            icon={Package}
            title="No products or services yet"
            description="Add the things you sell, so they are ready for a sale later."
            action={<AppButton startContent={<Plus weight="bold" />} label="Add item" onPress={() => setIsOpen(true)} />}
          />
        }
        columns={[
          { key: "name", label: "Item", render: (item) => <span className="font-medium text-foreground">{item.name}</span> },
          { key: "type", label: "Type", render: (item) => kindLabel(item.kind) },
          { key: "sku", label: "SKU", render: (item) => item.sku || "—" },
          { key: "status", label: "Status", render: (item) => <ItemStatus status={item.status} /> },
          {
            key: "price",
            label: "Selling price",
            align: "right",
            render: (item) => <span className="tabular font-semibold">{formatMinorAmount(item.selling_price_minor, item.currency, item.currency_exponent)}</span>,
          },
        ]}
        renderCard={(item) => {
          const Icon = kindIcon(item.kind);
          return (
            <RecordCard
              icon={<Icon size={18} weight="duotone" aria-hidden="true" />}
              iconClassName="bg-primary-soft text-primary"
              reference={item.sku || kindLabel(item.kind)}
              title={item.name}
              amount={formatMinorAmount(item.selling_price_minor, item.currency, item.currency_exponent)}
              status={<ItemStatus status={item.status} />}
              meta={[
                { label: "Unit", value: item.unit_name },
                { label: "Stock", value: item.kind === "stock_tracked" ? "Set up next" : "Not tracked" },
              ]}
            />
          );
        }}
      />

      <FormDrawer
        isOpen={isOpen}
        onOpenChange={(open) => !open && close()}
        title="Add product or service"
        description="This does not add stock or change your books."
        submitLabel="Add item"
        isSubmitting={create.isPending}
        onSubmit={form.handleSubmit((values) => create.mutate(values))}
      >
        <TextInputField control={form.control} name="name" label="Name" placeholder="Website design" isRequired />
        <SelectField control={form.control} name="kind" label="What do you sell?" options={ITEM_TYPES} isRequired />
        <TextInputField control={form.control} name="unit_name" label="Unit" placeholder="each, hour or bag" isRequired />
        <MoneyField control={form.control} name="selling_price" label="Selling price" currency={currency} isRequired />
        <TextInputField control={form.control} name="sku" label="SKU" placeholder="Optional internal code" />
        <SelectField control={form.control} name="status" label="Availability" options={ITEM_STATES} isRequired />
        <NotesField control={form.control} name="description" label="Description" placeholder="Optional note for your team" />
        {form.watch("kind") === "stock_tracked" ? (
          <p className="flex gap-2 text-[13px] leading-relaxed text-muted">
            <SealCheck size={17} weight="duotone" className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            Save the item first. Opening stock, stock movements and counts will be handled in the inventory workflow.
          </p>
        ) : null}
      </FormDrawer>
      <FormDrawer isOpen={isAdjustmentOpen} onOpenChange={(open)=>!open&&setIsAdjustmentOpen(false)} title="Adjust stock" description="Post a controlled increase or decrease with a reason. Negative quantities cannot exceed stock on hand." submitLabel="Post adjustment" isSubmitting={createAdjustment.isPending} onSubmit={adjustmentForm.handleSubmit((values)=>createAdjustment.mutate(values))}>
        <SelectField control={adjustmentForm.control} name="location_id" label="Location" options={locationOptions} isRequired />
        <SelectField control={adjustmentForm.control} name="product_id" label="Stock product" options={stockProducts} isRequired />
        <TextInputField control={adjustmentForm.control} name="quantity_delta" label="Quantity change" placeholder="-2 or 5" isRequired />
        <MoneyField control={adjustmentForm.control} name="unit_cost" label="Unit cost" currency={currency} isRequired />
        <SelectField control={adjustmentForm.control} name="reason_code" label="Reason" options={[{key:"damage",label:"Damage"},{key:"spoilage",label:"Spoilage"},{key:"shrinkage",label:"Shrinkage"},{key:"internal_use",label:"Internal use"},{key:"correction",label:"Correction"},{key:"other",label:"Other"}]} />
        <TextInputField control={adjustmentForm.control} name="effective_on" label="Effective date" type="date" isRequired />
        <NotesField control={adjustmentForm.control} name="notes" label="Note" placeholder="Explain the count or correction" />
      </FormDrawer>
      <FormDrawer isOpen={isTransferOpen} onOpenChange={(open)=>!open&&setIsTransferOpen(false)} title="Transfer stock" description="Move stock between locations at its current weighted-average cost." submitLabel="Transfer stock" isSubmitting={createTransfer.isPending} onSubmit={transferForm.handleSubmit((values)=>createTransfer.mutate(values))}>
        <SelectField control={transferForm.control} name="source_location_id" label="From" options={locationOptions} isRequired />
        <SelectField control={transferForm.control} name="destination_location_id" label="To" options={locationOptions} isRequired />
        <SelectField control={transferForm.control} name="product_id" label="Stock product" options={stockProducts} isRequired />
        <TextInputField control={transferForm.control} name="quantity" label="Quantity" placeholder="3" isRequired />
        <TextInputField control={transferForm.control} name="effective_on" label="Effective date" type="date" isRequired />
        <NotesField control={transferForm.control} name="notes" label="Note" placeholder="Move stock to the back room" />
      </FormDrawer>
      <FormDrawer isOpen={isCountOpen} onOpenChange={(open)=>!open&&setIsCountOpen(false)} title="Count stock" description="Record a physical count. The variance updates stock and posts a balanced adjustment." submitLabel="Post count" isSubmitting={createCount.isPending} onSubmit={countForm.handleSubmit((values)=>createCount.mutate(values))}>
        <SelectField control={countForm.control} name="location_id" label="Location" options={locationOptions} isRequired />
        <SelectField control={countForm.control} name="product_id" label="Stock product" options={stockProducts} isRequired />
        <TextInputField control={countForm.control} name="counted_quantity" label="Counted quantity" placeholder="8" isRequired />
        <MoneyField control={countForm.control} name="unit_cost" label="Unit cost (optional)" currency={currency} />
        <TextInputField control={countForm.control} name="counted_at" label="Count date" type="date" isRequired />
        <NotesField control={countForm.control} name="notes" label="Note" placeholder="Physical count after closing" />
      </FormDrawer>

      <FormDrawer
        isOpen={isOpeningStockOpen}
        onOpenChange={(open) => !open && closeOpeningStock()}
        title="Record opening stock"
        description="Set the starting quantity and weighted-average cost for a stock product."
        submitLabel="Add opening stock"
        isSubmitting={createOpeningStock.isPending}
        onSubmit={openingForm.handleSubmit((values) => createOpeningStock.mutate(values))}
      >
        <SelectField control={openingForm.control} name="product_id" label="Stock product" options={stockProducts} isRequired />
        <TextInputField control={openingForm.control} name="quantity" label="Quantity on hand" placeholder="10" isRequired />
        <MoneyField control={openingForm.control} name="unit_cost" label="Unit cost" currency={currency} isRequired />
        <TextInputField control={openingForm.control} name="effective_on" label="Effective date" type="date" isRequired />
        <NotesField control={openingForm.control} name="reason" label="Reason" placeholder="Opening balance at launch" isRequired />
      </FormDrawer>
    </Page>
  );
}

export function CataloguePage() {
  return <WorkspaceGate businessOnly>{(workspace) => <CatalogueContent key={workspace.workspaceId} {...workspace} />}</WorkspaceGate>;
}
