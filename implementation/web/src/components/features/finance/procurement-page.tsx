"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowUUpLeft, CheckCircle, ClipboardText, LinkSimple, Package, PaperPlaneTilt, Plus, Trash } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useFieldArray, useForm } from "react-hook-form";
import { useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppRowActions } from "@/components/ui/app-row-actions";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader, Segmented, StatusPill } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { formatDate } from "@/lib/format";
import { financeApi, formatMinorAmount, moneyKeys } from "@/lib/money";
import { purchaseRequestSchema, type PurchaseRequestValues } from "@/lib/schemas/finance.schemas";
import { useActiveWorkspace } from "@/stores/workspace-store";
import type { GoodsReceipt, PurchaseOrder, PurchaseRequest, SupplierAdvance, SupplierBill, SupplierReturn } from "@/types/finance";

import { MoneyField, NotesField, SelectField, TextInputField } from "./fields";
import { StatusBadge, useAccountOptions, useContacts, useFinanceAction, WorkspaceGate, type WorkspaceInfo } from "./shared";
import { PaymentDrawer } from "./payment-drawer";

const EMPTY_LINE = { product_id: "", description: "", quantity: "1", unit_name: "each", estimated_unit_price: "" };
const PROCUREMENT_TABS = [{ key: "requests", label: "Requests" }, { key: "orders", label: "Purchase orders" }, { key: "receipts", label: "Receipts" }, { key: "bills", label: "Bills" }, { key: "advances", label: "Advances" }, { key: "returns", label: "Returns" }, { key: "reports", label: "Reports" }] as const;
type RequestDecisionCommand = "reject" | "request_changes" | "cancel";
type RequestDecisionTarget = { request: PurchaseRequest; command: RequestDecisionCommand };
type PurchaseOrderResolutionCommand = "cancel" | "cancel_remainder" | "close";
type PurchaseOrderResolutionTarget = { order: PurchaseOrder; command: PurchaseOrderResolutionCommand };
type SupplierAdvanceValues = { supplier_id: string; money_account_id: string; amount: string; payment_date: string; notes: string };
type ApplyAdvanceValues = { supplier_bill_id: string; amount: string };
type DirectBillValues = { supplier_id: string; amount: string; bill_date: string; due_date: string; description: string; bill_type: "direct_expense" | "direct_service" };

function RequestStatus({ status }: { status: PurchaseRequest["status"] }) {
  return status === "approved" ? <StatusPill tone="success">Approved</StatusPill> : <StatusBadge status={status} />;
}

function ProcurementContent({ workspaceId, currency }: WorkspaceInfo) {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<"requests" | "orders" | "receipts" | "bills" | "advances" | "returns" | "reports">("requests");
  const [receiptOrder, setReceiptOrder] = useState<PurchaseOrder | null>(null);
  const [receiptQuantities, setReceiptQuantities] = useState<Record<number, string>>({});
  const [billReceipt, setBillReceipt] = useState<GoodsReceipt | null>(null);
  const [isDirectBillOpen, setIsDirectBillOpen] = useState(false);
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [paymentBill, setPaymentBill] = useState<SupplierBill | null>(null);
  const [matchBill, setMatchBill] = useState<SupplierBill | null>(null);
  const [decisionTarget, setDecisionTarget] = useState<RequestDecisionTarget | null>(null);
  const [orderResolutionTarget, setOrderResolutionTarget] = useState<PurchaseOrderResolutionTarget | null>(null);
  const [orderDetail, setOrderDetail] = useState<PurchaseOrder | null>(null);
  const [shareLink, setShareLink] = useState<{ order: PurchaseOrder; token: string; expiresAt: string } | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [isAdvanceOpen, setIsAdvanceOpen] = useState(false);
  const [applyAdvanceTarget, setApplyAdvanceTarget] = useState<SupplierAdvance | null>(null);
  const [returnReceipt, setReturnReceipt] = useState<GoodsReceipt | null>(null);
  const { active } = useActiveWorkspace();
  const requests = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "purchase-requests"],
    queryFn: () => financeApi.listPurchaseRequests(workspaceId),
  });
  const suppliers = useContacts(workspaceId, "suppliers");
  const orders = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "purchase-orders"], queryFn: () => financeApi.listPurchaseOrders(workspaceId) });
  const orderDetailQuery = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "purchase-order", orderDetail?.id], queryFn: () => financeApi.getPurchaseOrder(workspaceId, orderDetail!.id), enabled: Boolean(orderDetail) });
  const receipts = useQuery({queryKey:[...moneyKeys.workspace(workspaceId),"goods-receipts"],queryFn:()=>financeApi.listGoodsReceipts(workspaceId)});
  const bills = useQuery({queryKey:[...moneyKeys.workspace(workspaceId),"supplier-bills"],queryFn:()=>financeApi.listSupplierBills(workspaceId)});
  const billMatch = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "supplier-bill-match", matchBill?.id], queryFn: () => financeApi.supplierBillMatch(workspaceId, matchBill!.id), enabled: Boolean(matchBill) });
  const advances = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "supplier-advances"], queryFn: () => financeApi.listSupplierAdvances(workspaceId) });
  const returns = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "supplier-returns"], queryFn: () => financeApi.listSupplierReturns(workspaceId) });
  const procurementReport = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "procurement-report"], queryFn: () => financeApi.procurementReport(workspaceId) });
  const returnOptions = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "return-options", returnReceipt?.id], queryFn: () => financeApi.listReturnOptions(workspaceId, returnReceipt!.id), enabled: Boolean(returnReceipt) });
  const accounts = useAccountOptions(workspaceId);
  const receiptOptions = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "receipt-options", receiptOrder?.id], queryFn: () => financeApi.receiptOptions(workspaceId, receiptOrder!.id), enabled: Boolean(receiptOrder) });
  const products = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "catalogue"],
    queryFn: () => financeApi.listCatalogueItems(workspaceId),
  });
  const form = useForm<PurchaseRequestValues>({
    resolver: zodResolver(purchaseRequestSchema),
    defaultValues: { supplier_id: "", needed_by: "", reason: "", reference: "", priority: "normal", lines: [EMPTY_LINE] },
  });
  const lines = useFieldArray({ control: form.control, name: "lines" });
  const advanceForm = useForm<SupplierAdvanceValues>({ defaultValues: { supplier_id: "", money_account_id: "", amount: "", payment_date: new Date().toISOString().slice(0, 10), notes: "" } });
  const applyAdvanceForm = useForm<ApplyAdvanceValues>({ defaultValues: { supplier_bill_id: "", amount: "" } });
  const returnForm = useForm<{ line_id: string; quantity: string; reason: string }>({ defaultValues: { line_id: "", quantity: "", reason: "" } });
  const directBillForm = useForm<DirectBillValues>({ defaultValues: { supplier_id: "", amount: "", bill_date: new Date().toISOString().slice(0, 10), due_date: "", description: "", bill_type: "direct_expense" } });
  const createReturn = useFinanceAction(workspaceId, (values: { line_id: string; quantity: string; reason: string }, key: string) => financeApi.createSupplierReturn(workspaceId, { goods_receipt_id: returnReceipt?.id, effective_on: new Date().toISOString().slice(0, 10), reason: values.reason, lines: [{ goods_receipt_line_id: Number(values.line_id), quantity: values.quantity }] }, key), { success: "Supplier return posted", onDone: () => { setReturnReceipt(null); returnForm.reset(); } });

  const close = () => {
    setIsOpen(false);
    form.reset({ supplier_id: "", needed_by: "", reason: "", reference: "", priority: "normal", lines: [EMPTY_LINE] });
  };
  const create = useFinanceAction(
    workspaceId,
    (values: PurchaseRequestValues, key: string) =>
      financeApi.createPurchaseRequest(
        workspaceId,
        {
          supplier_id: values.supplier_id ? Number(values.supplier_id) : undefined,
          needed_by: values.needed_by || undefined,
          reason: values.reason,
          reference: values.reference || undefined,
          priority: values.priority,
          currency,
          lines: values.lines.map((line) => ({
            product_id: line.product_id ? Number(line.product_id) : undefined,
            description: line.description,
            quantity: line.quantity,
            unit_name: line.unit_name,
            estimated_unit_price: line.estimated_unit_price,
          })),
        },
        key,
      ),
    { success: "Purchase request saved", onDone: close },
  );
  const submit = useFinanceAction(
    workspaceId,
    ({ id, version }: { id: number; version: number }, key) => financeApi.submitPurchaseRequest(workspaceId, id, version, key),
    { success: "Request submitted for approval" },
  );
  const approve = useFinanceAction(
    workspaceId,
    ({ id, version }: { id: number; version: number }, key) => financeApi.approvePurchaseRequest(workspaceId, id, version, key),
    { success: "Purchase request approved" },
  );
  const reject = useFinanceAction(
    workspaceId,
    ({ id, version, reason }: { id: number; version: number; reason: string }, key) => financeApi.rejectPurchaseRequest(workspaceId, id, version, reason, key),
    { success: "Purchase request rejected" },
  );
  const requestChanges = useFinanceAction(
    workspaceId,
    ({ id, version, reason }: { id: number; version: number; reason: string }, key) => financeApi.requestPurchaseRequestChanges(workspaceId, id, version, reason, key),
    { success: "Changes requested" },
  );
  const cancel = useFinanceAction(
    workspaceId,
    ({ id, version, reason }: { id: number; version: number; reason: string }, key) => financeApi.cancelPurchaseRequest(workspaceId, id, version, reason, key),
    { success: "Purchase request cancelled" },
  );
  const createOrder = useFinanceAction(
    workspaceId,
    ({ requestId }: { requestId: number }, key) => financeApi.createPurchaseOrder(workspaceId, requestId, key),
    { success: "Purchase order draft created", onDone: () => setTab("orders") },
  );
  const advanceOrder = useFinanceAction(
    workspaceId,
    ({ id, version, command }: { id: number; version: number; command: "submitted" | "approved" | "issued" }, key) =>
      financeApi.advancePurchaseOrder(workspaceId, id, version, command, key),
    {
      success: "Purchase order updated",
    },
  );
  const resolveOrder = useFinanceAction(
    workspaceId,
    ({ id, version, command, reason }: { id: number; version: number; command: PurchaseOrderResolutionCommand; reason: string }, key) => financeApi.resolvePurchaseOrder(workspaceId, id, version, command, reason, key),
    { success: "Purchase order updated" },
  );
  const createShare = useFinanceAction(
    workspaceId,
    ({ id }: { id: number }, key: string) => financeApi.createPurchaseOrderShare(workspaceId, id, { expires_in_days: 7 }, key),
    { success: "Supplier share link created", onDone: (result) => {
      const response = result as { share: { token: string; expires_at: string }; order: PurchaseOrder };
      setShareLink({ order: response.order, token: response.share.token, expiresAt: response.share.expires_at });
    } },
  );
  const receiveOrder = useFinanceAction(
    workspaceId,
    (body: { purchase_order_id: number; received_on: string; lines: { purchase_order_line_id: number; accepted_quantity: string }[] }, key) => financeApi.createGoodsReceipt(workspaceId, body, key),
    { success: "Goods receipt posted", onDone: () => { setReceiptOrder(null); setReceiptQuantities({}); } },
  );
  const createBill=useFinanceAction(workspaceId,(body:{goods_receipt_id:number;supplier_invoice_number:string;bill_date:string},key)=>financeApi.createSupplierBill(workspaceId,body,key),{success:"Supplier bill saved",onDone:()=>{setBillReceipt(null);setSupplierInvoiceNumber("");setTab("bills")}});
  const createDirectBill = useFinanceAction(workspaceId, (values: DirectBillValues, key: string) => financeApi.createSupplierBill(workspaceId, { supplier_id: Number(values.supplier_id), amount: values.amount, currency, bill_date: values.bill_date, due_date: values.due_date || undefined, description: values.description || undefined, bill_type: values.bill_type }, key), { success: "Direct supplier bill saved", onDone: () => { setIsDirectBillOpen(false); directBillForm.reset({ supplier_id: "", amount: "", bill_date: new Date().toISOString().slice(0, 10), due_date: "", description: "", bill_type: "direct_expense" }); setTab("bills"); } });
  const approveBill=useFinanceAction(workspaceId,({id,version}:{id:number;version:number},key)=>financeApi.approveSupplierBill(workspaceId,id,version,key),{success:"Supplier bill approved"});
  const createAdvance = useFinanceAction(
    workspaceId,
    (values: SupplierAdvanceValues, key) => financeApi.createSupplierAdvance(workspaceId, {
      supplier_id: Number(values.supplier_id), payment_date: values.payment_date, amount: values.amount, currency,
      payment_legs: [{ money_account_id: Number(values.money_account_id), amount: values.amount }], notes: values.notes || undefined,
    }, key),
    { success: "Supplier advance recorded", onDone: () => { setIsAdvanceOpen(false); advanceForm.reset({ supplier_id: "", money_account_id: "", amount: "", payment_date: new Date().toISOString().slice(0, 10), notes: "" }); } },
  );
  const applyAdvance = useFinanceAction(
    workspaceId,
    (values: ApplyAdvanceValues, key) => {
      const bill = (bills.data ?? []).find((candidate) => candidate.id === Number(values.supplier_bill_id));
      if (!applyAdvanceTarget || !bill) return Promise.reject(new Error("Choose an approved supplier bill"));
      return financeApi.applySupplierAdvance(workspaceId, applyAdvanceTarget.id, {
        supplier_bill_id: bill.id, amount: values.amount,
        expected_advance_version: applyAdvanceTarget.version, expected_bill_version: bill.version,
      }, key);
    },
    { success: "Supplier advance applied to Accounts Payable", onDone: () => { setApplyAdvanceTarget(null); applyAdvanceForm.reset({ supplier_bill_id: "", amount: "" }); } },
  );

  const supplierName = (id?: number | null) => suppliers.data?.find((supplier) => supplier.id === id)?.name || "No supplier yet";
  const openDecision = (request: PurchaseRequest, command: RequestDecisionCommand) => {
    setDecisionReason("");
    setDecisionTarget({ request, command });
  };
  const closeDecision = () => {
    setDecisionTarget(null);
    setDecisionReason("");
  };
  const openAdvanceApplication = (advance: SupplierAdvance) => {
    applyAdvanceForm.reset({ supplier_bill_id: "", amount: "" });
    setApplyAdvanceTarget(advance);
  };
  const openOrderResolution = (order: PurchaseOrder, command: PurchaseOrderResolutionCommand) => {
    setDecisionReason("");
    setOrderResolutionTarget({ order, command });
  };
  const closeOrderResolution = () => {
    setOrderResolutionTarget(null);
    setDecisionReason("");
  };
  const submitOrderResolution = () => {
    if (!orderResolutionTarget) return;
    resolveOrder.mutate({ id: orderResolutionTarget.order.id, version: orderResolutionTarget.order.version, command: orderResolutionTarget.command, reason: decisionReason.trim() }, { onSuccess: closeOrderResolution });
  };
  const submitDecision = () => {
    if (!decisionTarget) return;
    const payload = { id: decisionTarget.request.id, version: decisionTarget.request.version, reason: decisionReason.trim() };
    if (decisionTarget.command === "reject") reject.mutate(payload, { onSuccess: closeDecision });
    if (decisionTarget.command === "request_changes") requestChanges.mutate(payload, { onSuccess: closeDecision });
    if (decisionTarget.command === "cancel") cancel.mutate(payload, { onSuccess: closeDecision });
  };
  const rows = requests.data ?? [];
  const actions = (request: PurchaseRequest) => (
    <AppRowActions
      ariaLabel="Purchase request actions"
      items={[
        {
          key: "submit",
          label: "Submit for approval",
          icon: <PaperPlaneTilt size={16} weight="duotone" aria-hidden="true" />,
          disabled: request.status !== "draft" || submit.isPending,
          onClick: () => submit.mutate({ id: request.id, version: request.version }),
        },
        {
          key: "approve",
          label: "Approve request",
          icon: <CheckCircle size={16} weight="duotone" aria-hidden="true" />,
          disabled: request.status !== "submitted" || !active?.is_owner || approve.isPending,
          onClick: () => approve.mutate({ id: request.id, version: request.version }),
        },
        {
          key: "reject",
          label: "Reject request",
          icon: <Trash size={16} weight="duotone" aria-hidden="true" />,
          disabled: request.status !== "submitted" || !active?.is_owner || reject.isPending,
          onClick: () => openDecision(request, "reject"),
        },
        {
          key: "request-changes",
          label: "Request changes",
          icon: <ClipboardText size={16} weight="duotone" aria-hidden="true" />,
          disabled: request.status !== "submitted" || !active?.is_owner || requestChanges.isPending,
          onClick: () => openDecision(request, "request_changes"),
        },
        {
          key: "cancel",
          label: "Cancel request",
          icon: <Trash size={16} weight="duotone" aria-hidden="true" />,
          disabled: !["draft", "submitted", "approved"].includes(request.status) || cancel.isPending,
          onClick: () => openDecision(request, "cancel"),
        },
        {
          key: "create-order",
          label: "Create PO draft",
          icon: <Package size={16} weight="duotone" aria-hidden="true" />,
          disabled: request.status !== "approved" || createOrder.isPending,
          onClick: () => createOrder.mutate({ requestId: request.id }),
        },
      ]}
    />
  );
  const orderActions = (order: PurchaseOrder) => (
    <AppRowActions
      ariaLabel="Purchase order actions"
      items={[
        {
          key: "submit",
          label: "Submit for approval",
          icon: <PaperPlaneTilt size={16} weight="duotone" aria-hidden="true" />,
          disabled: order.status !== "draft" || !active?.is_owner || advanceOrder.isPending,
          onClick: () => advanceOrder.mutate({ id: order.id, version: order.version, command: "submitted" }),
        },
        {
          key: "approve",
          label: "Approve purchase order",
          icon: <CheckCircle size={16} weight="duotone" aria-hidden="true" />,
          disabled: order.status !== "submitted" || !active?.is_owner || advanceOrder.isPending,
          onClick: () => advanceOrder.mutate({ id: order.id, version: order.version, command: "approved" }),
        },
        {
          key: "issue",
          label: "Issue to supplier",
          icon: <PaperPlaneTilt size={16} weight="duotone" aria-hidden="true" />,
          disabled: order.status !== "approved" || !active?.is_owner || advanceOrder.isPending,
          onClick: () => advanceOrder.mutate({ id: order.id, version: order.version, command: "issued" }),
        },
        {
          key: "share",
          label: "Share with supplier",
          icon: <LinkSimple size={16} weight="duotone" aria-hidden="true" />,
          disabled: !["issued", "acknowledged", "partially_received"].includes(order.status) || !active?.is_owner || createShare.isPending,
          onClick: () => createShare.mutate({ id: order.id }),
        },
        {
          key: "receive",
          label: "Receive goods or service",
          icon: <Package size={16} weight="duotone" aria-hidden="true" />,
          disabled: (order.status !== "issued" && order.status !== "partially_received") || !active?.is_owner,
          onClick: () => setReceiptOrder(order),
        },
        {
          key: "cancel",
          label: "Cancel purchase order",
          icon: <Trash size={16} weight="duotone" aria-hidden="true" />,
          disabled: !["draft", "submitted", "approved"].includes(order.status) || !active?.is_owner || resolveOrder.isPending,
          onClick: () => openOrderResolution(order, "cancel"),
        },
        {
          key: "cancel-remainder",
          label: "Cancel unreceived remainder",
          icon: <Trash size={16} weight="duotone" aria-hidden="true" />,
          disabled: !["issued", "acknowledged", "partially_received"].includes(order.status) || !active?.is_owner || resolveOrder.isPending,
          onClick: () => openOrderResolution(order, "cancel_remainder"),
        },
        {
          key: "close",
          label: "Close purchase order",
          icon: <CheckCircle size={16} weight="duotone" aria-hidden="true" />,
          disabled: !["fully_received", "partially_cancelled"].includes(order.status) || !active?.is_owner || resolveOrder.isPending,
          onClick: () => openOrderResolution(order, "close"),
        },
      ]}
    />
  );

  return (
    <Page>
      <PageHeader
        title="Procurement"
        description={tab === "requests" ? "Ask, review and approve needs before any order or payment is made." : tab === "advances" ? "Record supplier prepayments as an asset, then apply them to approved bills without moving cash twice." : tab === "returns" ? "Return eligible stock at its original receipt cost, then resolve the supplier credit separately." : tab === "reports" ? "Open commitments, unbilled receipts, payables and unapplied advances." : "Draft supplier commitments created from approved requests."}
        actions={tab === "requests" ? <AppButton startContent={<Plus weight="bold" />} label="New request" onPress={() => setIsOpen(true)} /> : tab === "advances" ? <AppButton startContent={<Plus weight="bold" />} label="Record advance" onPress={() => setIsAdvanceOpen(true)} /> : tab === "bills" ? <AppButton startContent={<Plus weight="bold" />} label="Direct bill" onPress={() => setIsDirectBillOpen(true)} /> : undefined}
      />
      <Segmented aria-label="Procurement documents" options={PROCUREMENT_TABS} value={tab} onChange={setTab} />
      {tab === "requests" ? (
      <DataView<PurchaseRequest>
        title="Purchase requests"
        rows={rows}
        rowKey={(request) => request.id}
        isLoading={requests.isPending}
        isError={requests.isError}
        searchPlaceholder="Search request reason or reference"
        getSearchText={(request) => `${request.reason} ${request.reference ?? ""} ${supplierName(request.supplier_id)}`}
        empty={
          <EmptyState
            icon={ClipboardText}
            title="No purchase requests yet"
            description="Create a request before making a supplier order."
            action={<AppButton startContent={<Plus weight="bold" />} label="New request" onPress={() => setIsOpen(true)} />}
          />
        }
        columns={[
          { key: "request", label: "Request", render: (request) => <span className="font-medium text-foreground">#{request.id} · {request.reason}</span> },
          { key: "supplier", label: "Supplier", render: (request) => supplierName(request.supplier_id) },
          { key: "priority", label: "Priority", render: (request) => request.priority },
          { key: "needed", label: "Needed by", render: (request) => request.needed_by ? formatDate(request.needed_by) : "—" },
          { key: "status", label: "Status", render: (request) => <RequestStatus status={request.status} /> },
          { key: "total", label: "Estimate", align: "right", render: (request) => <span className="tabular font-semibold">{formatMinorAmount(request.estimated_total_minor, request.currency, request.currency_exponent)}</span> },
          { key: "actions", label: "", align: "right", render: actions },
        ]}
        renderCard={(request) => (
          <RecordCard
            icon={<ClipboardText size={18} weight="duotone" aria-hidden="true" />}
            iconClassName="bg-primary-soft text-primary"
            reference={`Request #${request.id}`}
            title={request.reason}
            amount={formatMinorAmount(request.estimated_total_minor, request.currency, request.currency_exponent)}
            status={<RequestStatus status={request.status} />}
            meta={[
              { label: "Supplier", value: supplierName(request.supplier_id) },
              { label: "Priority", value: request.priority },
              { label: "Needed", value: request.needed_by ? formatDate(request.needed_by) : "Not set" },
            ]}
            actions={actions(request)}
          />
        )}
      />
      ) : tab === "orders" ? (
        <DataView<PurchaseOrder>
          title="Purchase orders"
          rows={orders.data ?? []}
          rowKey={(order) => order.id}
          isLoading={orders.isPending}
          isError={orders.isError}
          searchPlaceholder="Search purchase orders"
          getSearchText={(order) => `${order.order_number ?? ""} ${order.source_purchase_request_id} ${order.status}`}
          empty={<EmptyState icon={Package} title="No purchase orders yet" description="Approve a request, then create its PO draft from the Requests tab." />}
          columns={[
            { key: "number", label: "Purchase order", render: (order) => <span className="font-medium text-foreground">{order.order_number || `Draft #${order.id}`}</span> },
            { key: "source", label: "Source request", render: (order) => `#${order.source_purchase_request_id}` },
            { key: "status", label: "Status", render: (order) => <StatusBadge status={order.status} /> },
            { key: "total", label: "Total", align: "right", render: (order) => <span className="tabular font-semibold">{formatMinorAmount(order.total_minor, order.currency, order.currency_exponent)}</span> },
            { key: "actions", label: "", align: "right", render: (order) => <div className="flex items-center justify-end gap-2"><AppButton size="sm" variant="ghost" label="Details" onPress={() => setOrderDetail(order)} />{orderActions(order)}</div> },
          ]}
          renderCard={(order) => <RecordCard icon={<Package size={18} weight="duotone" aria-hidden="true" />} iconClassName="bg-primary-soft text-primary" reference={`Request #${order.source_purchase_request_id}`} title={order.order_number || `Draft PO #${order.id}`} amount={formatMinorAmount(order.total_minor, order.currency, order.currency_exponent)} status={<StatusBadge status={order.status} />} actions={orderActions(order)} />}
        />
      ) : tab === "receipts" ? (
        <DataView<GoodsReceipt> title="Goods receipts" rows={receipts.data??[]} rowKey={(receipt)=>receipt.id} isLoading={receipts.isPending} isError={receipts.isError} searchPlaceholder="Search receipts" getSearchText={(receipt)=>`${receipt.id} ${receipt.purchase_order_id} ${receipt.receipt_reference??""}`} empty={<EmptyState icon={Package} title="No goods receipts yet" description="Issue a purchase order, then receive accepted quantities."/>} columns={[{key:"receipt",label:"Receipt",render:(receipt)=><span className="font-medium">Receipt #{receipt.id}</span>},{key:"po",label:"Purchase order",render:(receipt)=>`#${receipt.purchase_order_id}`},{key:"date",label:"Received",render:(receipt)=>formatDate(receipt.received_on)},{key:"actions",label:"",align:"right",render:(receipt)=><AppRowActions ariaLabel="Receipt actions" items={[{key:"bill",label:"Create supplier bill",icon:<ClipboardText size={16} weight="duotone"/>,onClick:()=>setBillReceipt(receipt)},{key:"return",label:"Return stock",icon:<ArrowUUpLeft size={16} weight="duotone"/>,onClick:()=>setReturnReceipt(receipt)}]}/>}]}
        renderCard={(receipt)=><RecordCard icon={<Package size={18} weight="duotone"/>} iconClassName="bg-primary-soft text-primary" reference={`PO #${receipt.purchase_order_id}`} title={`Receipt #${receipt.id}`} amount={formatDate(receipt.received_on)} actions={<AppRowActions ariaLabel="Receipt actions" items={[{key:"bill",label:"Create supplier bill",onClick:()=>setBillReceipt(receipt)},{key:"return",label:"Return stock",onClick:()=>setReturnReceipt(receipt)}]}/>}/>}/>
      ) : tab === "bills" ? (
        <DataView<SupplierBill> title="Supplier bills" rows={bills.data??[]} rowKey={(bill)=>bill.id} isLoading={bills.isPending} isError={bills.isError} searchPlaceholder="Search supplier bills" getSearchText={(bill)=>`${bill.id} ${bill.goods_receipt_id} ${bill.status}`} empty={<EmptyState icon={ClipboardText} title="No supplier bills yet" description="Create a bill from a posted goods receipt or record a direct expense/service bill."/>} columns={[{key:"bill",label:"Bill",render:(bill)=><span className="font-medium">Bill #{bill.id}</span>},{key:"receipt",label:"Source",render:(bill)=>bill.goods_receipt_linked ? `Receipt #${bill.goods_receipt_id}` : "Direct bill"},{key:"due",label:"Due",render:(bill)=>bill.overdue ? <span className="text-danger">Overdue</span> : bill.due_date ? formatDate(bill.due_date) : "—"},{key:"status",label:"Status",render:(bill)=><StatusBadge status={bill.status}/>},{key:"total",label:"Total",align:"right",render:(bill)=><span className="tabular">{formatMinorAmount(bill.total_minor,currency,2)}</span>},{key:"actions",label:"",align:"right",render:(bill)=><AppRowActions ariaLabel="Bill actions" items={[{key:"match",label:"View three-way match",icon:<ClipboardText size={16} weight="duotone"/>,disabled:!bill.goods_receipt_linked,onClick:()=>setMatchBill(bill)},{key:"approve",label:"Approve bill",icon:<CheckCircle size={16} weight="duotone"/>,disabled:bill.status!=="draft"||!active?.is_owner,onClick:()=>approveBill.mutate({id:bill.id,version:bill.version})},{key:"pay",label:"Pay supplier bill",icon:<PaperPlaneTilt size={16} weight="duotone"/>,disabled:(bill.status!=="approved"&&bill.status!=="partially_paid")||!active?.is_owner,onClick:()=>setPaymentBill(bill)}]}/>}]}
        renderCard={(bill)=><RecordCard icon={<ClipboardText size={18} weight="duotone"/>} iconClassName="bg-primary-soft text-primary" reference={`Receipt #${bill.goods_receipt_id}`} title={`Bill #${bill.id}`} amount={formatMinorAmount(bill.total_minor,currency,2)} status={<StatusBadge status={bill.status}/>}/>}/>
      ) : tab === "returns" ? (
        <DataView<SupplierReturn> title="Supplier returns" rows={returns.data ?? []} rowKey={(item) => item.id} isLoading={returns.isPending} isError={returns.isError} searchPlaceholder="Search supplier returns" getSearchText={(item) => `${item.id} ${item.goods_receipt_id} ${item.status}`} empty={<EmptyState icon={ArrowUUpLeft} title="No supplier returns yet" description="Start a return from a posted receipt when stock is physically sent back." />} columns={[{ key: "return", label: "Return", render: (item) => <span className="font-medium">Return #{item.id}</span> }, { key: "receipt", label: "Receipt", render: (item) => `#${item.goods_receipt_id}` }, { key: "status", label: "Status", render: (item) => <StatusBadge status={item.status} /> }, { key: "total", label: "Value", align: "right", render: (item) => <span className="tabular">{formatMinorAmount(item.total_minor, currency, 2)}</span> }]} renderCard={(item) => <RecordCard icon={<ArrowUUpLeft size={18} weight="duotone" />} iconClassName="bg-primary-soft text-primary" reference={`Receipt #${item.goods_receipt_id}`} title={`Return #${item.id}`} amount={formatMinorAmount(item.total_minor, currency, 2)} status={<StatusBadge status={item.status} />} />} />
      ) : tab === "reports" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Open purchase orders", procurementReport.data ? `${procurementReport.data.open_purchase_order_count} · ${formatMinorAmount(procurementReport.data.open_purchase_order_minor, currency, 2)}` : "Loading…"],
            ["Ordered / received", procurementReport.data ? `${formatMinorAmount(procurementReport.data.ordered_minor, currency, 2)} · ${formatMinorAmount(procurementReport.data.received_minor, currency, 2)}` : "Loading…"],
            ["Unbilled receipts / GRNI", procurementReport.data ? `${procurementReport.data.unbilled_receipt_count} · ${formatMinorAmount(procurementReport.data.grni_minor, currency, 2)}` : "Loading…"],
            ["AP outstanding / overdue", procurementReport.data ? `${formatMinorAmount(procurementReport.data.ap_outstanding_minor, currency, 2)} · ${formatMinorAmount(procurementReport.data.ap_overdue_minor, currency, 2)}` : "Loading…"],
            ["Unapplied supplier advances", procurementReport.data ? `${procurementReport.data.unapplied_advance_count} · ${formatMinorAmount(procurementReport.data.unapplied_advance_minor, currency, 2)}` : "Loading…"],
          ].map(([label, value]) => <div key={label} className="rounded-2xl border border-default bg-surface p-4"><p className="text-[12px] text-muted">{label}</p><p className="mt-2 text-[18px] font-semibold tabular text-foreground">{value}</p></div>)}
        </div>
      ) : (
        <DataView<SupplierAdvance>
          title="Supplier advances"
          rows={advances.data ?? []}
          rowKey={(advance) => advance.id}
          isLoading={advances.isPending}
          isError={advances.isError}
          searchPlaceholder="Search supplier advances"
          getSearchText={(advance) => `${advance.id} ${supplierName(advance.supplier_id)} ${advance.status}`}
          empty={<EmptyState icon={PaperPlaneTilt} title="No supplier advances yet" description="Record a supplier prepayment only when cash has actually left the business." action={<AppButton startContent={<Plus weight="bold" />} label="Record advance" onPress={() => setIsAdvanceOpen(true)} />} />}
          columns={[
            { key: "advance", label: "Advance", render: (advance) => <span className="font-medium text-foreground">Advance #{advance.id}</span> },
            { key: "supplier", label: "Supplier", render: (advance) => supplierName(advance.supplier_id) },
            { key: "available", label: "Available", align: "right", render: (advance) => <span className="tabular font-semibold">{formatMinorAmount(advance.available_minor, advance.currency, advance.currency_exponent)}</span> },
            { key: "status", label: "Status", render: (advance) => <StatusBadge status={advance.status} /> },
            { key: "actions", label: "", align: "right", render: (advance) => <AppRowActions ariaLabel="Supplier advance actions" items={[{ key: "apply", label: "Apply to approved bill", icon: <CheckCircle size={16} weight="duotone" />, disabled: advance.available_minor === "0" || !active?.is_owner, onClick: () => openAdvanceApplication(advance) }]} /> },
          ]}
          renderCard={(advance) => <RecordCard icon={<PaperPlaneTilt size={18} weight="duotone" />} iconClassName="bg-primary-soft text-primary" reference={supplierName(advance.supplier_id)} title={`Advance #${advance.id}`} amount={formatMinorAmount(advance.available_minor, advance.currency, advance.currency_exponent)} status={<StatusBadge status={advance.status} />} actions={<AppRowActions ariaLabel="Supplier advance actions" items={[{ key: "apply", label: "Apply to approved bill", disabled: advance.available_minor === "0" || !active?.is_owner, onClick: () => openAdvanceApplication(advance) }]} />} />}
        />
      )}

      <FormDrawer
        isOpen={isOpen}
        onOpenChange={(open) => !open && close()}
        title="New purchase request"
        description="Saving or submitting this request does not buy, receive or pay for anything."
        submitLabel="Save draft"
        isSubmitting={create.isPending}
        onSubmit={form.handleSubmit((values) => create.mutate(values))}
      >
        <SelectField control={form.control} name="supplier_id" label="Suggested supplier" placeholder="Choose later if needed" options={(suppliers.data ?? []).map((supplier) => ({ key: String(supplier.id), label: supplier.name }))} />
        <TextInputField control={form.control} name="needed_by" label="Needed by" type="date" />
        <SelectField control={form.control} name="priority" label="Priority" options={[{ key: "low", label: "Low" }, { key: "normal", label: "Normal" }, { key: "high", label: "High" }, { key: "urgent", label: "Urgent" }]} />
        <NotesField control={form.control} name="reason" label="Why is this needed?" placeholder="Restock office supplies for the new team" />
        <TextInputField control={form.control} name="reference" label="Reference" placeholder="Optional project or request reference" />

        <div className="flex items-center justify-between gap-3 pt-2">
          <div>
            <p className="text-[14px] font-semibold text-foreground">Request lines</p>
            <p className="mt-0.5 text-[12px] text-muted">Amounts are estimates only until a later purchase order or bill.</p>
          </div>
          <AppButton size="sm" variant="tertiary" startContent={<Plus weight="bold" />} label="Add line" onPress={() => lines.append(EMPTY_LINE)} />
        </div>
        {lines.fields.map((line, index) => (
          <div key={line.id} className="space-y-3 rounded-2xl bg-default p-4">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-foreground">Line {index + 1}</p>
              {lines.fields.length > 1 ? <AppButton isIconOnly size="sm" variant="ghost" aria-label={`Remove line ${index + 1}`} onPress={() => lines.remove(index)} startContent={<Trash />} /> : null}
            </div>
            <SelectField control={form.control} name={`lines.${index}.product_id`} label="Product or service" placeholder="Optional catalogue item" options={(products.data ?? []).map((product) => ({ key: String(product.id), label: product.name }))} />
            <TextInputField control={form.control} name={`lines.${index}.description`} label="Description" placeholder="A4 printing paper" isRequired />
            <div className="grid grid-cols-2 gap-3">
              <TextInputField control={form.control} name={`lines.${index}.quantity`} label="Quantity" placeholder="1" isRequired />
              <TextInputField control={form.control} name={`lines.${index}.unit_name`} label="Unit" placeholder="each" isRequired />
            </div>
            <MoneyField control={form.control} name={`lines.${index}.estimated_unit_price`} label="Estimated unit price" currency={currency} isRequired />
          </div>
        ))}
      </FormDrawer>
      <FormDrawer
        isOpen={Boolean(receiptOrder)}
        onOpenChange={(open) => !open && setReceiptOrder(null)}
        title="Receive purchase order"
        description="Posting records accepted quantities, stock movement where applicable, and GRNI. It does not pay the supplier."
        submitLabel="Post receipt"
        isSubmitting={receiveOrder.isPending}
        onSubmit={(event) => { event.preventDefault(); if (!receiptOrder) return; const lines = (receiptOptions.data ?? []).map((line) => ({ purchase_order_line_id: line.purchase_order_line_id, accepted_quantity: receiptQuantities[line.purchase_order_line_id] ?? "" })).filter((line) => line.accepted_quantity.trim() !== ""); if (lines.length) receiveOrder.mutate({ purchase_order_id: receiptOrder.id, received_on: new Date().toISOString().slice(0, 10), lines }); }}
      >
        {receiptOptions.isPending ? <p className="text-sm text-muted">Loading open quantities…</p> : null}
        {(receiptOptions.data ?? []).map((line) => <AppInput key={line.purchase_order_line_id} label={`${line.description} · open ${line.remaining_quantity}`} placeholder="Accepted quantity" value={receiptQuantities[line.purchase_order_line_id] ?? ""} onChange={(event) => setReceiptQuantities((current) => ({ ...current, [line.purchase_order_line_id]: event.target.value }))} />)}
      </FormDrawer>
      <FormDrawer isOpen={Boolean(billReceipt)} onOpenChange={(open)=>!open&&setBillReceipt(null)} title="New supplier bill" description="Approval clears GRNI into Accounts Payable. It does not pay the supplier." submitLabel="Save bill" isSubmitting={createBill.isPending} onSubmit={(event)=>{event.preventDefault();if(billReceipt&&supplierInvoiceNumber.trim())createBill.mutate({goods_receipt_id:billReceipt.id,supplier_invoice_number:supplierInvoiceNumber.trim(),bill_date:new Date().toISOString().slice(0,10)})}}><AppInput label="Supplier invoice number" isRequired value={supplierInvoiceNumber} onChange={(event)=>setSupplierInvoiceNumber(event.target.value)}/></FormDrawer>
      <FormDrawer isOpen={isDirectBillOpen} onOpenChange={(open) => !open && setIsDirectBillOpen(false)} title="Direct supplier bill" description="Use this for an expense or service invoice that has no goods receipt. Approval posts the expense or asset to Accounts Payable." submitLabel="Save bill" isSubmitting={createDirectBill.isPending} onSubmit={directBillForm.handleSubmit((values) => createDirectBill.mutate(values))}>
        <SelectField control={directBillForm.control} name="supplier_id" label="Supplier" isRequired placeholder="Choose supplier" options={(suppliers.data ?? []).map((supplier) => ({ key: String(supplier.id), label: supplier.name }))} />
        <SelectField control={directBillForm.control} name="bill_type" label="Bill type" options={[{ key: "direct_expense", label: "Expense" }, { key: "direct_service", label: "Service" }]} />
        <MoneyField control={directBillForm.control} name="amount" label="Amount" currency={currency} isRequired />
        <div className="grid grid-cols-2 gap-3"><TextInputField control={directBillForm.control} name="bill_date" label="Bill date" type="date" isRequired /><TextInputField control={directBillForm.control} name="due_date" label="Due date" type="date" /></div>
        <NotesField control={directBillForm.control} name="description" label="Description" placeholder="Internet subscription for November" />
      </FormDrawer>
      <FormDrawer
        isOpen={Boolean(decisionTarget)}
        onOpenChange={(open) => !open && closeDecision()}
        title={decisionTarget?.command === "request_changes" ? "Request changes" : decisionTarget?.command === "reject" ? "Reject purchase request" : "Cancel purchase request"}
        description={decisionTarget?.command === "request_changes" ? "Explain what must change before this request can be resubmitted." : decisionTarget?.command === "reject" ? "Give the requester an auditable reason for this decision." : "Cancellation is non-posting and does not undo any purchase order, receipt, bill, or payment."}
        submitLabel={decisionTarget?.command === "request_changes" ? "Request changes" : decisionTarget?.command === "reject" ? "Reject request" : "Cancel request"}
        isSubmitting={reject.isPending || requestChanges.isPending || cancel.isPending}
        onSubmit={(event) => { event.preventDefault(); submitDecision(); }}
      >
        <AppInput
          label={decisionTarget?.command === "cancel" ? "Reason (optional)" : "Reason"}
          isRequired={decisionTarget?.command !== "cancel"}
          placeholder={decisionTarget?.command === "request_changes" ? "For example, add a supplier quote and delivery date" : "Explain this decision"}
          value={decisionReason}
          onChange={(event) => setDecisionReason(event.target.value)}
        />
      </FormDrawer>
      <FormDrawer
        isOpen={Boolean(orderResolutionTarget)}
        onOpenChange={(open) => !open && closeOrderResolution()}
        title={orderResolutionTarget?.command === "close" ? "Close purchase order" : orderResolutionTarget?.command === "cancel_remainder" ? "Cancel unreceived remainder" : "Cancel purchase order"}
        description={orderResolutionTarget?.command === "close" ? "Closing preserves all posted receipts, bills, payments, and the audit trail. It is allowed only after receiving and billing are resolved." : "This changes only the remaining supplier commitment. It cannot delete or reverse posted receipts, bills, payments, stock, or journals."}
        submitLabel={orderResolutionTarget?.command === "close" ? "Close purchase order" : "Confirm cancellation"}
        isSubmitting={resolveOrder.isPending}
        onSubmit={(event) => { event.preventDefault(); submitOrderResolution(); }}
      >
        <AppInput
          label={orderResolutionTarget?.command === "close" ? "Close note (optional)" : "Cancellation reason"}
          isRequired={orderResolutionTarget?.command !== "close"}
          placeholder={orderResolutionTarget?.command === "close" ? "Optional closure note" : "Explain why the supplier commitment is being cancelled"}
          value={decisionReason}
          onChange={(event) => setDecisionReason(event.target.value)}
        />
      </FormDrawer>
      <FormDrawer
        isOpen={isAdvanceOpen}
        onOpenChange={(open) => !open && setIsAdvanceOpen(false)}
        title="Record supplier advance"
        description="This records a real cash/bank prepayment as a Supplier Advances asset. It does not create an expense, stock, or payable."
        submitLabel="Record advance"
        isSubmitting={createAdvance.isPending}
        onSubmit={advanceForm.handleSubmit((values) => createAdvance.mutate(values))}
      >
        <SelectField control={advanceForm.control} name="supplier_id" label="Supplier" isRequired placeholder="Choose supplier" options={(suppliers.data ?? []).map((supplier) => ({ key: String(supplier.id), label: supplier.name }))} />
        <SelectField control={advanceForm.control} name="money_account_id" label="Paid from" isRequired placeholder="Choose cash or bank account" options={accounts.options} />
        <MoneyField control={advanceForm.control} name="amount" label="Advance amount" currency={currency} isRequired />
        <TextInputField control={advanceForm.control} name="payment_date" label="Payment date" type="date" isRequired />
        <NotesField control={advanceForm.control} name="notes" label="Note" placeholder="Optional PO, pro-forma, or agreement reference" />
      </FormDrawer>
      <FormDrawer
        isOpen={Boolean(applyAdvanceTarget)}
        onOpenChange={(open) => !open && setApplyAdvanceTarget(null)}
        title="Apply supplier advance"
        description="This clears Accounts Payable against an existing supplier advance. It does not move cash again. The bill must belong to the same supplier and currency."
        submitLabel="Apply advance"
        isSubmitting={applyAdvance.isPending}
        onSubmit={applyAdvanceForm.handleSubmit((values) => applyAdvance.mutate(values))}
      >
        <SelectField control={applyAdvanceForm.control} name="supplier_bill_id" label="Approved supplier bill" isRequired placeholder="Choose bill" options={(bills.data ?? []).filter((bill) => bill.status === "approved" || bill.status === "partially_paid").map((bill) => ({ key: String(bill.id), label: `Bill #${bill.id} · ${formatMinorAmount(bill.outstanding_minor, currency, 2)} outstanding` }))} />
        <MoneyField control={applyAdvanceForm.control} name="amount" label="Amount to apply" currency={applyAdvanceTarget?.currency ?? currency} isRequired description={applyAdvanceTarget ? `${formatMinorAmount(applyAdvanceTarget.available_minor, applyAdvanceTarget.currency, applyAdvanceTarget.currency_exponent)} available on this advance.` : undefined} />
      </FormDrawer>
      <FormDrawer isOpen={Boolean(returnReceipt)} onOpenChange={(open) => !open && setReturnReceipt(null)} title="Return stock to supplier" description="This removes eligible on-hand stock at its original receipt cost. Create a credit note separately after the supplier confirms the return." submitLabel="Post return" isSubmitting={createReturn.isPending} onSubmit={returnForm.handleSubmit((values) => createReturn.mutate(values))}>
        <SelectField control={returnForm.control} name="line_id" label="Receipt line" options={(returnOptions.data ?? []).map((line) => ({ key: String(line.id), label: `${line.product_name} · ${line.remaining_quantity} remaining` }))} isRequired />
        <TextInputField control={returnForm.control} name="quantity" label="Quantity to return" placeholder="1" isRequired />
        <NotesField control={returnForm.control} name="reason" label="Reason" placeholder="Damaged on arrival" isRequired />
      </FormDrawer>
      <FormDrawer isOpen={Boolean(matchBill)} onOpenChange={(open) => !open && setMatchBill(null)} title="Three-way match" description="Server-derived comparison of the purchase order, accepted receipt and supplier bill." submitLabel="Close" isSubmitting={false} onSubmit={(event) => { event.preventDefault(); setMatchBill(null); }}>
        {billMatch.isPending ? <p className="text-sm text-muted">Calculating match…</p> : billMatch.data ? <div className="space-y-3 text-sm"><p><span className="text-muted">Result:</span> <span className="font-semibold">{billMatch.data.result}</span></p><p><span className="text-muted">Ordered:</span> {formatMinorAmount(billMatch.data.ordered_minor, currency, 2)}</p><p><span className="text-muted">Received:</span> {formatMinorAmount(billMatch.data.received_minor, currency, 2)}</p><p><span className="text-muted">Billed:</span> {formatMinorAmount(billMatch.data.billed_minor, currency, 2)}</p><p><span className="text-muted">Open to bill:</span> {formatMinorAmount(billMatch.data.open_to_bill_minor, currency, 2)}</p><p><span className="text-muted">Variance:</span> {formatMinorAmount(billMatch.data.variance_minor, currency, 2)}</p></div> : <p className="text-sm text-muted">Match data is unavailable.</p>}
      </FormDrawer>
      <FormDrawer isOpen={Boolean(orderDetail)} onOpenChange={(open) => !open && setOrderDetail(null)} title={orderDetail ? `Purchase order ${orderDetail.order_number || `#${orderDetail.id}`}` : "Purchase order"} description="Immutable operational detail and timeline. Receipts, bills, payments and stock remain separate linked documents." submitLabel="Close" isSubmitting={false} onSubmit={(event) => { event.preventDefault(); setOrderDetail(null); }}>
        {orderDetailQuery.isPending ? <p className="text-sm text-muted">Loading order detail…</p> : orderDetailQuery.data ? <div className="space-y-5"><div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-muted">Status</p><p className="font-semibold">{orderDetailQuery.data.status}</p></div><div><p className="text-muted">Total</p><p className="font-semibold tabular">{formatMinorAmount(orderDetailQuery.data.total_minor, orderDetailQuery.data.currency, orderDetailQuery.data.currency_exponent)}</p></div></div><div><p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Lines</p><div className="mt-2 space-y-2">{(orderDetailQuery.data.lines ?? []).map((line) => <div key={line.id} className="flex justify-between gap-3 text-sm"><span>{line.description} · {line.quantity} {line.unit_name}</span><span className="tabular">{formatMinorAmount(line.line_total_minor, orderDetailQuery.data.currency, orderDetailQuery.data.currency_exponent)}</span></div>)}</div></div><div><p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Timeline</p><div className="mt-2 space-y-2">{(orderDetailQuery.data.events ?? []).map((event) => <div key={event.id} className="flex justify-between gap-3 text-sm"><span className="font-medium">{event.event_type}</span><span className="text-muted">{formatDate(event.created_at)}</span></div>)}</div></div></div> : <p className="text-sm text-muted">Order detail is unavailable.</p>}
      </FormDrawer>
      <FormDrawer isOpen={Boolean(shareLink)} onOpenChange={(open) => !open && setShareLink(null)} title="Supplier share link" description="This link gives the supplier a limited view of the issued purchase order and lets them acknowledge, decline, or request changes. It expires automatically." submitLabel="Close" isSubmitting={false} onSubmit={(event) => { event.preventDefault(); setShareLink(null); }}>
        {shareLink ? <div className="space-y-3 text-sm"><p className="text-muted">Order {shareLink.order.order_number || `#${shareLink.order.id}`}</p><AppInput label="Link" value={`${window.location.origin}/purchase-orders/share/${shareLink.token}`} readOnly /><p className="text-muted">Expires {formatDate(shareLink.expiresAt)}</p></div> : null}
      </FormDrawer>
      <PaymentDrawer workspaceId={workspaceId} currency={currency} isOpen={Boolean(paymentBill)} onClose={()=>setPaymentBill(null)} preset={paymentBill?{direction:"outgoing",linkedType:"supplier_bill",linkedId:paymentBill.id,partyName:"Supplier",summary:`Settle supplier bill #${paymentBill.id}. This reduces Accounts Payable and does not create another expense.`}:undefined}/>
    </Page>
  );
}

export function ProcurementPage() {
  return <WorkspaceGate businessOnly>{(workspace) => <ProcurementContent key={workspace.workspaceId} {...workspace} />}</WorkspaceGate>;
}
