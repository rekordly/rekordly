"use client";

// Procurement lists: purchase requests, purchase orders, goods receipts and bills.
// Each row opens its document page (see procurement-detail-pages.tsx).

import { ClipboardText, HandCoins, Package, Plus, Receipt, ShoppingCart, Warning } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppRowActions } from "@/components/ui/app-row-actions";
import { DataView } from "@/components/ui/data-view";
import { EmptyState, Page, PageHeader, StatusPill } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { formatDate } from "@/lib/format";
import { financeApi, formatMinorAmount, moneyKeys } from "@/lib/money";
import type { GoodsReceipt, PurchaseOrder, PurchaseRequest, SupplierBill } from "@/types/finance";

import { DocumentActions as DetailActions, minorToInput as formatMinorToMajor } from "./document-page";
import { PaymentDrawer, type PaymentPreset } from "./payment-drawer";
import { ProcurementStats, PurchaseOrderStats, PurchaseRequestStats, SupplierBillStats } from "./section-stats";
import { StatusBadge, useRecords, WorkspaceGate, type WorkspaceInfo } from "./shared";


/* -------------------------------------------------------------------------- */
/* Shared Detail Card Helper                                                   */
/* -------------------------------------------------------------------------- */

/** One primary button, everything else behind the three-dot menu. */



/* -------------------------------------------------------------------------- */
/* 1. Purchase Requests List & Detail (/purchase-requests, /[id])              */
/* -------------------------------------------------------------------------- */

function PurchaseRequestsListContent({ workspaceId, currency }: WorkspaceInfo) {
  const router = useRouter();
  const requests = useRecords<PurchaseRequest>("purchase-requests", workspaceId);
  const supplierName = (r: PurchaseRequest) => r.supplier_name || r.supplier?.name || "Any supplier";

  const addButton = (
    <AppButton startContent={<Plus weight="bold" />} label="New request" onPress={() => router.push("/purchase-requests/new")} />
  );

  const rowActions = (r: PurchaseRequest) => {
    const canConvert = r.status === "draft" || r.status === "submitted" || r.status === "approved";
    return (
      <AppRowActions
        ariaLabel="Request actions"
        items={[
          { key: "open", label: "Open request", icon: <ClipboardText size={16} />, onClick: () => router.push(`/purchase-requests/${r.id}`) },
          ...(canConvert
            ? [
                { key: "po", label: "Create PO", icon: <Package size={16} />, onClick: () => router.push(`/purchase-orders/new?requestId=${r.id}`) },
                { key: "receipt", label: "Procure goods", icon: <ShoppingCart size={16} />, onClick: () => router.push(`/procurement/new?requestId=${r.id}`) },
              ]
            : []),
        ]}
      />
    );
  };

  return (
    <Page>
      <PageHeader
        title="Purchase requests"
        description="Internal stock requests awaiting approval."
        actions={
          <DetailActions
            primary={addButton}
            more={[
              { key: "orders", label: "Purchase orders", icon: <Package size={16} />, onClick: () => router.push("/purchase-orders") },
              { key: "procurement", label: "Procure goods", icon: <ShoppingCart size={16} />, onClick: () => router.push("/procurement") },
            ]}
          />
        }
      />
      <PurchaseRequestStats workspaceId={workspaceId} currency={currency} />
      <DataView<PurchaseRequest>
        title="Purchase requests"
        server={requests.controls}
        rows={requests.rows}
        rowKey={(r) => r.id}
        isLoading={requests.isPending}
        isError={requests.isError}
        onRowClick={(r) => router.push(`/purchase-requests/${r.id}`)}
        searchPlaceholder="Search reason, reference or supplier"
        getSearchText={(r) => `${r.id} ${r.reason} ${r.reference ?? ""} ${supplierName(r)}`}
        empty={
          <EmptyState
            icon={ClipboardText}
            title="No purchase requests yet"
            action={addButton}
          />
        }
        columns={[
          { key: "request", label: "Request", render: (r) => <span className="font-semibold">#{r.id} · {r.reason}</span> },
          { key: "supplier", label: "Supplier", render: (r) => supplierName(r) },
          { key: "priority", label: "Priority", render: (r) => <span className="capitalize">{r.priority}</span> },
          { key: "needed", label: "Needed by", render: (r) => (r.needed_by ? formatDate(r.needed_by) : "Flexible") },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
          {
            key: "total",
            label: "Estimate",
            align: "right",
            render: (r) => <span className="font-semibold tabular">{formatMinorAmount(r.estimated_total_minor, r.currency, r.currency_exponent)}</span>,
          },
          { key: "actions", label: "", align: "right", render: rowActions },
        ]}
        renderCard={(r) => (
          <RecordCard
            icon={<ClipboardText size={18} weight="duotone" />}
            iconClassName="bg-primary-soft text-primary"
            reference={`Request #${r.id}`}
            title={r.reason}
            amount={formatMinorAmount(r.estimated_total_minor, r.currency, r.currency_exponent)}
            status={<StatusBadge status={r.status} />}
            meta={[
              { label: "Supplier", value: supplierName(r) },
              { label: "Priority", value: r.priority },
              { label: "Needed by", value: r.needed_by ? formatDate(r.needed_by) : "Flexible" },
            ]}
            onView={() => router.push(`/purchase-requests/${r.id}`)}
            actions={rowActions(r)}
          />
        )}
      />
    </Page>
  );
}

export function PurchaseRequestsListPage() {
  return <WorkspaceGate businessOnly>{(ws) => <PurchaseRequestsListContent {...ws} />}</WorkspaceGate>;
}


/* -------------------------------------------------------------------------- */
/* 2. Purchase Orders List & Detail (/purchase-orders, /[id])                  */
/* -------------------------------------------------------------------------- */

function PurchaseOrdersListContent({ workspaceId, currency }: WorkspaceInfo) {
  const router = useRouter();
  const orders = useRecords<PurchaseOrder>("purchase-orders", workspaceId);
  const supplierName = (o: PurchaseOrder) => o.supplier_name || o.supplier?.name || "Supplier";

  const addButton = (
    <AppButton startContent={<Plus weight="bold" />} label="New order" onPress={() => router.push("/purchase-orders/new")} />
  );

  const rowActions = (o: PurchaseOrder) => {
    const canReceive = ["issued", "acknowledged", "partially_received"].includes(o.status);
    const canBill = ["issued", "acknowledged", "partially_received", "fully_received"].includes(o.status);
    return (
      <AppRowActions
        ariaLabel="Order actions"
        items={[
          { key: "open", label: "Open order", icon: <Package size={16} />, onClick: () => router.push(`/purchase-orders/${o.id}`) },
          ...(canReceive
            ? [{ key: "receive", label: "Receive goods", icon: <ShoppingCart size={16} />, onClick: () => router.push(`/procurement/new?poId=${o.id}`) }]
            : []),
          ...(canBill
            ? [{ key: "bill", label: "Create bill", icon: <Receipt size={16} />, onClick: () => router.push(`/bills/new?poId=${o.id}`) }]
            : []),
        ]}
      />
    );
  };

  return (
    <Page>
      <PageHeader
        title="Purchase orders"
        description="Orders sent to your suppliers."
        actions={
          <DetailActions
            primary={addButton}
            more={[
              { key: "requests", label: "Purchase requests", icon: <ClipboardText size={16} />, onClick: () => router.push("/purchase-requests") },
              { key: "procurement", label: "Procure goods", icon: <ShoppingCart size={16} />, onClick: () => router.push("/procurement") },
              { key: "bills", label: "Supplier bills", icon: <Receipt size={16} />, onClick: () => router.push("/bills") },
            ]}
          />
        }
      />
      <PurchaseOrderStats workspaceId={workspaceId} currency={currency} />
      <DataView<PurchaseOrder>
        title="Purchase orders"
        server={orders.controls}
        rows={orders.rows}
        rowKey={(o) => o.id}
        isLoading={orders.isPending}
        isError={orders.isError}
        onRowClick={(o) => router.push(`/purchase-orders/${o.id}`)}
        searchPlaceholder="Search PO number, supplier or status"
        getSearchText={(o) => `${o.order_number ?? ""} ${o.id} ${supplierName(o)} ${o.status}`}
        empty={
          <EmptyState
            icon={Package}
            title="No purchase orders yet"
            action={addButton}
          />
        }
        columns={[
          { key: "number", label: "Purchase order", render: (o) => <span className="font-semibold">{o.order_number || `PO #${o.id}`}</span> },
          { key: "supplier", label: "Supplier", render: (o) => supplierName(o) },
          {
            key: "source",
            label: "Source",
            render: (o) => (o.source_purchase_request_id > 0 ? `Request #${o.source_purchase_request_id}` : "Direct"),
          },
          { key: "status", label: "Status", render: (o) => <StatusBadge status={o.status} /> },
          {
            key: "total",
            label: "Total",
            align: "right",
            render: (o) => <span className="font-semibold tabular">{formatMinorAmount(o.total_minor, o.currency, o.currency_exponent)}</span>,
          },
          { key: "actions", label: "", align: "right", render: rowActions },
        ]}
        renderCard={(o) => (
          <RecordCard
            icon={<Package size={18} weight="duotone" />}
            iconClassName="bg-primary-soft text-primary"
            reference={supplierName(o)}
            title={o.order_number || `PO #${o.id}`}
            amount={formatMinorAmount(o.total_minor, o.currency, o.currency_exponent)}
            status={<StatusBadge status={o.status} />}
            onView={() => router.push(`/purchase-orders/${o.id}`)}
            actions={rowActions(o)}
          />
        )}
      />
    </Page>
  );
}

export function PurchaseOrdersListPage() {
  return <WorkspaceGate businessOnly>{(ws) => <PurchaseOrdersListContent {...ws} />}</WorkspaceGate>;
}


/* -------------------------------------------------------------------------- */
/* 3. Procurement / Goods Receipts List & Detail (/procurement, /[id])         */
/* -------------------------------------------------------------------------- */

function ProcurementReceiptsListContent({ workspaceId, currency }: WorkspaceInfo) {
  const router = useRouter();
  const [payingReceipt, setPayingReceipt] = useState<PaymentPreset | null>(null);
  const receipts = useRecords<GoodsReceipt>("goods-receipts", workspaceId);
  const supplierName = (r: GoodsReceipt) => r.supplier_name || r.supplier?.name || "Direct supplier";

  const openReceiptPayment = (r: GoodsReceipt) => {
    const exp = r.currency_exponent ?? 2;
    const cur = r.currency || currency;
    const outstanding = r.outstanding_minor ?? r.goods_total_minor ?? r.total_minor ?? "0";
    setPayingReceipt({
      direction: "outgoing",
      linkedType: "goods_receipt",
      linkedId: r.id,
      supplierId: r.supplier_id,
      billId: r.bill_id,
      billStatus: r.bill_status,
      billVersion: r.bill_version,
      partyName: supplierName(r),
      defaultAmount: formatMinorToMajor(outstanding, exp),
      summary: `Pay ${supplierName(r)} for ${r.receipt_reference || `Receipt #${r.id}`} (${formatMinorAmount(outstanding, cur, exp)} outstanding).`,
    });
  };

  const rowActions = (r: GoodsReceipt) => {
    const isPaid = r.status === "paid";
    return (
      <AppRowActions
        ariaLabel="Receipt actions"
        items={[
          { key: "open", label: "Open receipt", icon: <Package size={16} />, onClick: () => router.push(`/procurement/${r.id}`) },
          ...(!isPaid
            ? [{ key: "pay", label: "Record payment", icon: <HandCoins size={16} />, onClick: () => openReceiptPayment(r) }]
            : []),
          r.bill_id
            ? { key: "bill", label: "Open bill", icon: <Receipt size={16} />, onClick: () => router.push(`/bills/${r.bill_id}`) }
            : { key: "bill", label: "Create bill", icon: <Receipt size={16} />, onClick: () => router.push(`/bills/new?receiptId=${r.id}`) },
        ]}
      />
    );
  };

  return (
    <Page>
      <PageHeader
        title="Procurement"
        description="Goods received into stock and landed costs."
        actions={
          <DetailActions
            primary={<AppButton startContent={<Plus weight="bold" />} label="Procure goods" onPress={() => router.push("/procurement/new")} />}
            more={[
              { key: "orders", label: "Purchase orders", icon: <Package size={16} />, onClick: () => router.push("/purchase-orders") },
              { key: "bills", label: "Supplier bills", icon: <Receipt size={16} />, onClick: () => router.push("/bills") },
              { key: "requests", label: "Purchase requests", icon: <ClipboardText size={16} />, onClick: () => router.push("/purchase-requests") },
            ]}
          />
        }
      />
      <ProcurementStats workspaceId={workspaceId} currency={currency} />
      <DataView<GoodsReceipt>
        title="Goods receipts"
        server={receipts.controls}
        rows={receipts.rows}
        rowKey={(r) => r.id}
        isLoading={receipts.isPending}
        isError={receipts.isError}
        onRowClick={(r) => router.push(`/procurement/${r.id}`)}
        searchPlaceholder="Search receipt number, reference or supplier"
        getSearchText={(r) => `${r.id} ${r.receipt_reference ?? ""} ${supplierName(r)} ${r.purchase_order_id || "direct"} ${r.status || ""}`}
        empty={
          <EmptyState
            icon={Package}
            title="No procured goods yet"
            action={<AppButton startContent={<Plus weight="bold" />} label="Procure goods" onPress={() => router.push("/procurement/new")} />}
          />
        }
        columns={[
          {
            key: "receipt",
            label: "Receipt",
            render: (r) => <span className="font-semibold">{r.receipt_reference || `Receipt #${r.id}`}</span>,
          },
          { key: "supplier", label: "Supplier", render: (r) => supplierName(r) },
          {
            key: "source",
            label: "Source",
            render: (r) => (r.source_type === "unplanned" || !r.purchase_order_id ? "Direct" : `PO #${r.purchase_order_id}`),
          },
          { key: "date", label: "Received", render: (r) => formatDate(r.received_on) },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status || "unpaid"} /> },
          {
            key: "landed",
            label: "Extra cost",
            align: "right",
            render: (r) =>
              r.landed_cost_minor && r.landed_cost_minor !== "0" ? (
                <span className="tabular font-medium text-primary">{formatMinorAmount(r.landed_cost_minor, currency, 2)}</span>
              ) : (
                <span className="text-muted">—</span>
              ),
          },
          {
            key: "total",
            label: "Total",
            align: "right",
            render: (r) => <span className="font-semibold tabular">{formatMinorAmount(r.total_minor ?? "0", r.currency || currency, r.currency_exponent ?? 2)}</span>,
          },
          { key: "actions", label: "", align: "right", render: rowActions },
        ]}
        renderCard={(r) => (
          <RecordCard
            icon={<Package size={18} weight="duotone" />}
            iconClassName="bg-primary-soft text-primary"
            reference={r.source_type === "unplanned" || !r.purchase_order_id ? "Direct" : `PO #${r.purchase_order_id}`}
            title={r.receipt_reference || `Receipt #${r.id}`}
            amount={formatMinorAmount(r.total_minor ?? "0", r.currency || currency, r.currency_exponent ?? 2)}
            status={<StatusBadge status={r.status || "unpaid"} />}
            meta={[
              { label: "Supplier", value: supplierName(r) },
              { label: "Received", value: formatDate(r.received_on) },
            ]}
            onView={() => router.push(`/procurement/${r.id}`)}
            actions={rowActions(r)}
          />
        )}
      />

      <PaymentDrawer
        workspaceId={workspaceId}
        currency={currency}
        isOpen={Boolean(payingReceipt)}
        onClose={() => {
          setPayingReceipt(null);
          void receipts.refetch();
        }}
        preset={payingReceipt ?? undefined}
      />
    </Page>
  );
}

export function ProcurementReceiptsListPage() {
  return <WorkspaceGate businessOnly>{(ws) => <ProcurementReceiptsListContent {...ws} />}</WorkspaceGate>;
}


/* -------------------------------------------------------------------------- */
/* 4. Supplier Bills List & Detail (/bills, /[id])                             */
/* -------------------------------------------------------------------------- */

function SupplierBillsListContent({ workspaceId, currency }: WorkspaceInfo) {
  const router = useRouter();
  const bills = useRecords<SupplierBill>("supplier-bills", workspaceId);
  const supplierName = (b: SupplierBill) => b.supplier_name || b.supplier?.name || "Supplier";

  const addButton = <AppButton startContent={<Plus weight="bold" />} label="New bill" onPress={() => router.push("/bills/new")} />;

  const rowActions = (b: SupplierBill) => {
    const canReceive = !b.goods_receipt_linked && !["reversed", "voided", "rejected"].includes(b.status);
    return (
      <AppRowActions
        ariaLabel="Bill actions"
        items={[
          { key: "open", label: "Open bill", icon: <Receipt size={16} />, onClick: () => router.push(`/bills/${b.id}`) },
          ...(b.goods_receipt_linked
            ? [{ key: "receipt", label: "View receipt", icon: <Package size={16} />, onClick: () => router.push(`/procurement/${b.goods_receipt_id}`) }]
            : canReceive
              ? [{ key: "receive", label: "Receive goods", icon: <ShoppingCart size={16} />, onClick: () => router.push(`/procurement/new?billId=${b.id}`) }]
              : []),
        ]}
      />
    );
  };

  return (
    <Page>
      <PageHeader
        title="Bills"
        description="Supplier invoices and payable balances."
        actions={
          <DetailActions
            primary={addButton}
            more={[
              { key: "procurement", label: "Procure goods", icon: <ShoppingCart size={16} />, onClick: () => router.push("/procurement") },
              { key: "orders", label: "Purchase orders", icon: <Package size={16} />, onClick: () => router.push("/purchase-orders") },
            ]}
          />
        }
      />
      <SupplierBillStats workspaceId={workspaceId} currency={currency} />
      <DataView<SupplierBill>
        title="Supplier bills"
        server={bills.controls}
        rows={bills.rows}
        rowKey={(b) => b.id}
        isLoading={bills.isPending}
        isError={bills.isError}
        onRowClick={(b) => router.push(`/bills/${b.id}`)}
        searchPlaceholder="Search invoice number, supplier or status"
        getSearchText={(b) => `${b.supplier_invoice_number ?? ""} ${b.id} ${supplierName(b)} ${b.status}`}
        empty={
          <EmptyState
            icon={Receipt}
            title="No supplier bills yet"
            action={addButton}
          />
        }
        columns={[
          {
            key: "bill",
            label: "Bill",
            render: (b) => (
              <div className="space-y-0.5">
                <p className="font-semibold text-foreground">{b.supplier_invoice_number || `Bill #${b.id}`}</p>
                {b.variance_minor && b.variance_minor !== "0" ? (
                  <p
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-warning"
                    title={`Price variance of ${formatMinorAmount(b.variance_minor, b.currency || currency, 2)} compared to the Purchase Order or Goods Receipt`}
                  >
                    <Warning size={12} weight="fill" />
                    Price variance ({formatMinorAmount(b.variance_minor, b.currency || currency, 2)})
                  </p>
                ) : null}
              </div>
            ),
          },
          { key: "supplier", label: "Supplier", render: (b) => supplierName(b) },
          {
            key: "source",
            label: "Source",
            render: (b) => (b.goods_receipt_linked ? `Receipt #${b.goods_receipt_id}` : "Direct"),
          },
          {
            key: "due",
            label: "Due",
            render: (b) => (b.overdue ? <StatusPill tone="danger">Overdue</StatusPill> : b.due_date ? formatDate(b.due_date) : "—"),
          },
          { key: "status", label: "Status", render: (b) => <StatusBadge status={b.status} /> },
          {
            key: "outstanding",
            label: "Balance",
            align: "right",
            render: (b) => <span className="tabular">{formatMinorAmount(b.outstanding_minor, b.currency || currency, 2)}</span>,
          },
          {
            key: "total",
            label: "Total",
            align: "right",
            render: (b) => <span className="font-semibold tabular">{formatMinorAmount(b.total_minor, b.currency || currency, 2)}</span>,
          },
          { key: "actions", label: "", align: "right", render: rowActions },
        ]}
        renderCard={(b) => (
          <RecordCard
            icon={<Receipt size={18} weight="duotone" />}
            iconClassName="bg-primary-soft text-primary"
            reference={supplierName(b)}
            title={b.supplier_invoice_number || `Bill #${b.id}`}
            amount={formatMinorAmount(b.total_minor, b.currency || currency, 2)}
            status={<StatusBadge status={b.status} />}
            onView={() => router.push(`/bills/${b.id}`)}
            actions={rowActions(b)}
          />
        )}
      />
    </Page>
  );
}

export function SupplierBillsListPage() {
  return <WorkspaceGate businessOnly>{(ws) => <SupplierBillsListContent {...ws} />}</WorkspaceGate>;
}


/* -------------------------------------------------------------------------- */
/* 5. Purchase Detail Page (/purchases/[id])                                   */
/* -------------------------------------------------------------------------- */


// Detail pages live in their own file, on the shared document layout.
export { GoodsReceiptDetailPage, PurchaseDetailPage, PurchaseOrderDetailPage, PurchaseRequestDetailPage, SupplierBillDetailPage } from "./procurement-detail-pages";
