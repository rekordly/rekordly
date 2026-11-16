"use client";

import { CheckCircle, LinkSimple, Package, PaperPlaneTilt, PencilSimple, Trash } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppSelect } from "@/components/ui/app-select";
import { FormDrawer } from "@/components/ui/form-drawer";
import { StatusPill } from "@/components/ui/page";
import { formatDate } from "@/lib/format";
import { financeApi, formatMinorAmount, moneyKeys } from "@/lib/money";
import type { CatalogueItem, InventoryOutlet, MerchantOrder, ProductVariant, Storefront, StorefrontCollection } from "@/types/finance";

import { StatusBadge, useFinanceAction } from "../finance/shared";

export function PublishVariantDrawer({
  workspaceId,
  storefront,
  item,
  collections,
  onClose,
}: {
  workspaceId: number;
  storefront: Storefront;
  item: CatalogueItem | null;
  collections: StorefrontCollection[];
  onClose: () => void;
}) {
  const variantsQuery = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "catalogue-variants", item?.id],
    queryFn: () => financeApi.listProductVariants(workspaceId, item!.id),
    enabled: Boolean(item),
  });
  const pubQuery = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "storefront-products"],
    queryFn: () => financeApi.listMerchantStorefrontProducts(workspaceId),
    enabled: Boolean(item),
  });

  if (!item) return null;
  return (
    <PublishVariantInner
      key={`pub-${item.id}-${variantsQuery.data ? variantsQuery.data.length : "load"}`}
      workspaceId={workspaceId}
      storefront={storefront}
      item={item}
      variants={variantsQuery.data ?? []}
      existing={(pubQuery.data ?? []).filter((p) => p.product_id === item.id)}
      collections={collections}
      onClose={onClose}
    />
  );
}

function PublishVariantInner({
  workspaceId,
  storefront,
  item,
  variants,
  existing,
  collections,
  onClose,
}: {
  workspaceId: number;
  storefront: Storefront;
  item: CatalogueItem;
  variants: ProductVariant[];
  existing: { variant_id: number; is_published: boolean; is_featured: boolean; public_title: string; collection_id?: number | null; public_price_minor: string; availability_policy: string; max_qty_per_order: number }[];
  collections: StorefrontCollection[];
  onClose: () => void;
}) {
  const firstVar = variants[0];
  const [selectedVariantId, setSelectedVariantId] = useState(() => (firstVar ? String(firstVar.id) : ""));
  const matched = existing.find((e) => String(e.variant_id) === selectedVariantId);
  const [isPublished, setIsPublished] = useState(() => matched?.is_published ?? true);
  const [isFeatured, setIsFeatured] = useState(() => matched?.is_featured ?? false);
  const [publicTitle, setPublicTitle] = useState(() => matched?.public_title || item.name);
  const [publicDesc, setPublicDesc] = useState(() => item.description || "");
  const [collectionId, setCollectionId] = useState(() => (matched?.collection_id ? String(matched.collection_id) : ""));
  const [availPolicy, setAvailPolicy] = useState(() => matched?.availability_policy || "in_out_stock");
  const [priceMajor, setPriceMajor] = useState("");
  const [maxQty, setMaxQty] = useState(() => String(matched?.max_qty_per_order ?? 50));

  const save = useFinanceAction(
    workspaceId,
    (body: unknown) => financeApi.upsertStorefrontProduct(workspaceId, Number(selectedVariantId), body),
    { success: "Storefront catalogue projection updated", onDone: onClose },
  );

  return (
    <FormDrawer
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Publish ${item.name}`}
      description="Only selected allowlisted public fields appear on your storefront. Internal costs, suppliers, and notes are never exposed."
      submitLabel="Save storefront visibility"
      isSubmitting={save.isPending}
      onSubmit={(e) => {
        e.preventDefault();
        if (!selectedVariantId) return;
        save.mutate({
          collection_id: collectionId ? Number(collectionId) : undefined,
          is_published: isPublished,
          is_featured: isFeatured,
          public_title: publicTitle.trim(),
          public_description: publicDesc.trim(),
          public_price: priceMajor.trim() || undefined,
          availability_policy: availPolicy,
          max_qty_per_order: Number(maxQty || "50"),
        });
      }}
    >
      <AppSelect
        label="Variant"
        isRequired
        selectedKey={selectedVariantId}
        onSelectionChange={setSelectedVariantId}
        options={variants.map((v) => ({
          key: String(v.id),
          label: `${v.name} · ${formatMinorAmount(String(v.selling_price_minor), storefront.currency, storefront.currency_exponent)}`,
        }))}
      />
      <div className="flex flex-wrap gap-4 text-xs">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
          Visible on public storefront
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
          Featured item
        </label>
      </div>
      <AppInput label="Public title" isRequired value={publicTitle} onChange={(e) => setPublicTitle(e.target.value)} />
      <AppInput label="Public description" value={publicDesc} onChange={(e) => setPublicDesc(e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <AppSelect
          label="Collection"
          selectedKey={collectionId}
          onSelectionChange={setCollectionId}
          placeholder="No collection"
          options={collections.map((c) => ({ key: String(c.id), label: c.name }))}
        />
        <AppSelect
          label="Availability display"
          selectedKey={availPolicy}
          onSelectionChange={setAvailPolicy}
          options={[
            { key: "in_out_stock", label: "In stock / Out of stock" },
            { key: "low_stock", label: "Show low stock badge" },
            { key: "exact_quantity", label: "Exact quantity" },
            { key: "hide_unavailable", label: "Hide when unavailable" },
            { key: "allow_request", label: "Allow request when out" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <AppInput label={`Public price override (${storefront.currency})`} placeholder="Leave blank to use catalogue price" value={priceMajor} onChange={(e) => setPriceMajor(e.target.value)} />
        <AppInput label="Max qty per order" value={maxQty} onChange={(e) => setMaxQty(e.target.value)} />
      </div>
    </FormDrawer>
  );
}

export function MerchantOrderDetailDrawer({
  workspaceId,
  orderId,
  outlets,
  canConfirm,
  canFulfil,
  canCancel,
  onClose,
}: {
  workspaceId: number;
  orderId: number | null;
  outlets: InventoryOutlet[];
  canConfirm: boolean;
  canFulfil: boolean;
  canCancel: boolean;
  onClose: () => void;
}) {
  const detailQuery = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "storefront-order", orderId],
    queryFn: () => financeApi.getMerchantOrder(workspaceId, orderId!),
    enabled: Boolean(orderId),
  });

  if (!orderId) return null;
  return (
    <MerchantOrderDetailInner
      key={`ord-${orderId}-${detailQuery.data?.version ?? "load"}`}
      workspaceId={workspaceId}
      order={detailQuery.data ?? null}
      isLoading={detailQuery.isPending}
      outlets={outlets}
      canConfirm={canConfirm}
      canFulfil={canFulfil}
      canCancel={canCancel}
      onClose={onClose}
    />
  );
}

function MerchantOrderDetailInner({
  workspaceId,
  order,
  isLoading,
  outlets,
  canConfirm,
  canFulfil,
  canCancel,
  onClose,
}: {
  workspaceId: number;
  order: MerchantOrder | null;
  isLoading: boolean;
  outlets: InventoryOutlet[];
  canConfirm: boolean;
  canFulfil: boolean;
  canCancel: boolean;
  onClose: () => void;
}) {
  const defaultLoc = order?.outlet_id ?? outlets.find((o) => o.is_default)?.id ?? outlets[0]?.id ?? 0;
  const [outletId, setOutletId] = useState(() => (defaultLoc ? String(defaultLoc) : ""));
  const [payArrangement, setPayArrangement] = useState(() => order?.payment_arrangement ?? "");
  const [deliveryFee, setDeliveryFee] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [requiresAck, setRequiresAck] = useState(true);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");
  const [trackingNote, setTrackingNote] = useState("");
  const [fulfilQtys, setFulfilQtys] = useState<Record<number, string>>({});
  const [returnReason, setReturnReason] = useState("");

  const confirmAct = useFinanceAction(
    workspaceId,
    (body: unknown, key: string) => financeApi.confirmStorefrontOrder(workspaceId, order!.id, body, key),
    { success: "Order confirmed and stock reserved" },
  );
  const fulfilAct = useFinanceAction(
    workspaceId,
    (body: unknown) => financeApi.fulfilStorefrontOrder(workspaceId, order!.id, body),
    { success: "Order fulfilled and COGS posted" },
  );
  const changeAct = useFinanceAction(
    workspaceId,
    (body: unknown) => financeApi.requestOrderChange(workspaceId, order!.id, body),
    { success: "Revision sent for review", onDone: () => setChangeSummary("") },
  );
  const cancelAct = useFinanceAction(
    workspaceId,
    (action: "cancel" | "decline") =>
      action === "decline" ? financeApi.declineStorefrontOrder(workspaceId, order!.id, reason) : financeApi.cancelStorefrontOrder(workspaceId, order!.id, reason),
    { success: "Order updated and eligible reservations released", onDone: () => setReason("") },
  );
  const linkCustAct = useFinanceAction(
    workspaceId,
    (counterpartyId?: number) => financeApi.linkOrderCustomer(workspaceId, order!.id, counterpartyId),
    { success: "Customer record linked" },
  );
  const invoiceAct = useFinanceAction(
    workspaceId,
    (proforma: boolean) => financeApi.convertOrderToInvoice(workspaceId, order!.id, proforma),
    { success: "Sales document created cleanly" },
  );
  const msgAct = useFinanceAction(
    workspaceId,
    (text: string) => financeApi.postMerchantOrderMessage(workspaceId, order!.id, text, true),
    { success: "Message sent to order portal", onDone: () => setMsg("") },
  );
  const returnAct = useFinanceAction(
    workspaceId,
    (body: { reason: string }) => financeApi.returnStorefrontOrder(workspaceId, order!.id, body),
    { success: "Return recorded and stock restored", onDone: () => setReturnReason("") },
  );

  return (
    <FormDrawer
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={order ? `Order ${order.order_reference}` : "Order review"}
      description="Confirming reserves stock; fulfilling issues stock and COGS; invoicing remains a separate explicit action."
      submitLabel="Close"
      isSubmitting={false}
      onSubmit={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {isLoading || !order ? (
        <p className="text-sm text-muted">Loading order details…</p>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={order.commercial_status} />
            <StatusPill tone="neutral">Fulfilment: {order.fulfilment_status}</StatusPill>
            <StatusPill tone="neutral">Payment: {order.payment_status}</StatusPill>
          </div>

          <div className="rounded-xl bg-default p-3 text-xs space-y-1">
            <p className="font-semibold text-foreground">{order.customer_name}</p>
            <p className="text-muted">
              {order.customer_phone || "No phone"} · {order.customer_email || "No email"}
            </p>
            <p className="text-muted">
              Delivery: {order.delivery_method} {order.delivery_address ? `— ${order.delivery_address}` : ""}
            </p>
            {order.customer_note ? <p className="italic text-foreground">&ldquo;{order.customer_note}&rdquo;</p> : null}
            {!order.customer_id ? (
              <div className="pt-2 flex flex-wrap gap-2">
                {(order.suggested_customers ?? []).map((sc) => (
                  <AppButton key={sc.id} size="sm" variant="secondary" label={`Link: ${sc.name}`} onPress={() => linkCustAct.mutate(sc.id)} />
                ))}
                <AppButton size="sm" variant="tertiary" label="Create & link customer" onPress={() => linkCustAct.mutate(undefined)} />
              </div>
            ) : (
              <p className="text-success font-medium pt-1">Linked to Customer #{order.customer_id}</p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Items & Live Stock Comparison</p>
            {(order.lines ?? []).map((line) => (
              <div key={line.id} className="rounded-xl border border-default p-2.5 text-xs flex justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground">{line.title}</p>
                  <p className="text-muted">
                    Req: {line.requested_quantity} · Conf: {line.confirmed_quantity} · Fulfilled: {line.fulfilled_quantity} · Avail: {line.available_quantity}
                  </p>
                </div>
                <span className="tabular font-semibold">{formatMinorAmount(line.line_total_minor, order.currency, order.currency_exponent)}</span>
              </div>
            ))}
            <div className="flex justify-between text-xs pt-1 font-semibold">
              <span>Total (Delivery {formatMinorAmount(order.delivery_fee_minor, order.currency, order.currency_exponent)})</span>
              <span className="tabular">{formatMinorAmount(order.total_minor, order.currency, order.currency_exponent)}</span>
            </div>
          </div>

          {canConfirm && ["request_received", "needs_review"].includes(order.commercial_status) ? (
            <div className="rounded-xl border border-default p-3 space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Confirm & Reserve Stock</p>
              <AppSelect label="Fulfilment outlet" selectedKey={outletId} onSelectionChange={setOutletId} options={outlets.map((o) => ({ key: String(o.id), label: o.name }))} />
              <AppInput label="Payment arrangement note" value={payArrangement} onChange={(e) => setPayArrangement(e.target.value)} placeholder="Pay by transfer or cash on pickup" />
              <AppButton
                variant="primary"
                startContent={<CheckCircle weight="duotone" />}
                label="Confirm order & reserve stock"
                isLoading={confirmAct.isPending}
                onPress={() =>
                  confirmAct.mutate({
                    expected_version: order.version,
                    outlet_id: Number(outletId),
                    payment_arrangement: payArrangement,
                  })
                }
              />
            </div>
          ) : null}

          {canConfirm && ["request_received", "needs_review", "quote_changes_requested"].includes(order.commercial_status) ? (
            <div className="rounded-xl border border-default p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Propose Price / Delivery Changes</p>
              <AppInput label={`Revised delivery fee (${order.currency})`} value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} placeholder="Leave unchanged if empty" />
              <AppInput label="Change summary for customer" value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)} placeholder="Updated delivery fee based on area" />
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={requiresAck} onChange={(e) => setRequiresAck(e.target.checked)} />
                Require customer acknowledgement before confirming
              </label>
              <AppButton
                size="sm"
                variant="secondary"
                startContent={<PencilSimple weight="duotone" />}
                label="Send revision"
                isDisabled={!changeSummary.trim()}
                onPress={() => changeAct.mutate({ expected_version: order.version, delivery_fee: deliveryFee || undefined, payment_arrangement: payArrangement || undefined, change_summary: changeSummary, requires_customer_ack: requiresAck })}
              />
            </div>
          ) : null}

          {canFulfil && order.commercial_status === "confirmed" && ["reserved", "partially_fulfilled"].includes(order.fulfilment_status) ? (
            <div className="rounded-xl border border-default p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Fulfilment &amp; COGS</p>
              <div className="space-y-1.5">
                {(order.lines ?? []).map((l) => {
                  const rem = Math.max(0, Number(l.confirmed_quantity) - Number(l.fulfilled_quantity));
                  if (rem <= 0) return null;
                  const val = fulfilQtys[l.id] ?? String(rem);
                  return (
                    <div key={l.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-foreground">{l.title} (rem: {rem})</span>
                      <input
                        type="number"
                        min="0"
                        max={rem}
                        step="any"
                        value={val}
                        onChange={(e) => setFulfilQtys((prev) => ({ ...prev, [l.id]: e.target.value }))}
                        className="w-20 rounded-lg border border-default bg-surface px-2 py-1 text-right text-xs"
                      />
                    </div>
                  );
                })}
              </div>
              <AppInput label="Dispatch / tracking / batch note" value={trackingNote} onChange={(e) => setTrackingNote(e.target.value)} placeholder="Dispatched via rider or picked up" />
              <AppButton
                variant="primary"
                startContent={<Package weight="duotone" />}
                label="Fulfil selected & post COGS"
                isLoading={fulfilAct.isPending}
                onPress={() => {
                  const lines = (order.lines ?? [])
                    .map((l) => {
                      const rem = Math.max(0, Number(l.confirmed_quantity) - Number(l.fulfilled_quantity));
                      const q = Number(fulfilQtys[l.id] ?? rem);
                      return q > 0 ? { order_line_id: l.id, quantity: String(q) } : null;
                    })
                    .filter(Boolean);
                  fulfilAct.mutate({ expected_version: order.version, recipient_name: order.customer_name, tracking_note: trackingNote, lines });
                }}
              />
            </div>
          ) : null}

          {canFulfil && ["fulfilled", "partially_fulfilled"].includes(order.fulfilment_status) ? (
            <div className="rounded-xl border border-default p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Record Return</p>
              <AppInput label="Return reason" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="Customer returned items" />
              <AppButton
                size="sm"
                variant="secondary"
                label="Record full return & restock"
                isLoading={returnAct.isPending}
                onPress={() => returnAct.mutate({ reason: returnReason })}
              />
            </div>
          ) : null}

          {order.linked_sale_id ? <a href="/sales?source=online_store" className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">View sale #{order.linked_sale_id}</a> : null}
          {!order.linked_invoice_id && !["declined", "cancelled"].includes(order.commercial_status) ? (
            <div className="flex flex-wrap gap-2">
              <AppButton size="sm" variant="secondary" startContent={<LinkSimple />} label="Create Draft Invoice" onPress={() => invoiceAct.mutate(false)} />
              <AppButton size="sm" variant="tertiary" startContent={<LinkSimple />} label="Create Proforma" onPress={() => invoiceAct.mutate(true)} />
            </div>
          ) : order.linked_invoice_id ? (
            <p className="text-xs font-medium text-foreground">Linked Sales Document #{order.linked_invoice_id}</p>
          ) : null}

          {canCancel && !["fulfilled", "partially_fulfilled"].includes(order.fulfilment_status) && !["declined", "cancelled", "completed"].includes(order.commercial_status) ? (
            <div className="rounded-xl border border-default p-3 space-y-2">
              <AppInput label="Decline / Cancel reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer unresponsive or out of stock" />
              <div className="flex gap-2">
                <AppButton size="sm" variant="secondary" startContent={<Trash />} label="Cancel & release stock" onPress={() => cancelAct.mutate("cancel")} />
                <AppButton size="sm" variant="tertiary" startContent={<Trash />} label="Decline request" onPress={() => cancelAct.mutate("decline")} />
              </div>
            </div>
          ) : null}

          <div className="space-y-2 pt-2 border-t border-default">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Timeline & Messages</p>
            {(order.events ?? []).map((ev, i) => (
              <div key={i} className="text-xs flex justify-between gap-2">
                <span><strong>{ev.actor_type}:</strong> {ev.message || ev.event_type}</span>
                <span className="text-muted shrink-0">{formatDate(ev.created_at)}</span>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <AppInput placeholder="Send update to customer portal" value={msg} onChange={(e) => setMsg(e.target.value)} />
              <AppButton size="sm" variant="secondary" startContent={<PaperPlaneTilt />} label="Send" isDisabled={!msg.trim()} onPress={() => msgAct.mutate(msg)} />
            </div>
          </div>
        </div>
      )}
    </FormDrawer>
  );
}
