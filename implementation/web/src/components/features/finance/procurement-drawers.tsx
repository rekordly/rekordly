"use client";

import { Plus, Trash } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppSelect } from "@/components/ui/app-select";
import { FormDrawer } from "@/components/ui/form-drawer";
import { formatDate } from "@/lib/format";
import { financeApi, formatMinorAmount, moneyKeys } from "@/lib/money";
import type {
  CatalogueItem,
  Contact,
  GoodsReceipt,
  InventoryOutlet,
  ProcurementApprovalPolicy,
  ProcurementReport,
  PurchaseOrder,
  ReceiptOptionLine,
  SupplierBill,
  SupplierCredit,
} from "@/types/finance";

import { useFinanceAction } from "./shared";

function minorToMajorInput(minorStr: string | undefined, exponent: number): string {
  if (!minorStr) return "0";
  const n = Number(minorStr);
  if (!Number.isFinite(n) || n === 0) return "0";
  return (n / Math.pow(10, exponent)).toFixed(exponent).replace(/\.?0+$/, "");
}

type POLineFormState = {
  id?: number;
  product_id: string;
  description: string;
  quantity: string;
  unit_name: string;
  expected_unit_cost: string;
  discount: string;
  tax_amount: string;
};

function PurchaseOrderEditorInner({
  workspaceId,
  currency,
  isOpen,
  mode,
  order,
  initialOrder,
  suppliers,
  products,
  outlets,
  onClose,
}: {
  workspaceId: number;
  currency: string;
  isOpen: boolean;
  mode: "create" | "edit" | "revise";
  order?: PurchaseOrder | null;
  initialOrder?: PurchaseOrder | null;
  suppliers: Contact[];
  products: CatalogueItem[];
  outlets: InventoryOutlet[];
  onClose: () => void;
}) {
  const src = mode === "create" ? null : initialOrder ?? order ?? null;
  const exp = src?.currency_exponent ?? 2;

  const [supplierId, setSupplierId] = useState(() => (src?.supplier_id ? String(src.supplier_id) : ""));
  const [outletId, setOutletId] = useState(() => (src?.outlet_id ? String(src.outlet_id) : ""));
  const [expectedDate, setExpectedDate] = useState(() => src?.expected_date ?? "");
  const [paymentTerms, setPaymentTerms] = useState(() => src?.payment_terms ?? "");
  const [notes, setNotes] = useState(() => src?.notes ?? "");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<POLineFormState[]>(() =>
    src?.lines && src.lines.length > 0
      ? src.lines.map((l) => ({
          id: l.id,
          product_id: l.product_id ? String(l.product_id) : "",
          description: l.description,
          quantity: l.quantity,
          unit_name: l.unit_name,
          expected_unit_cost: minorToMajorInput(l.expected_unit_cost_minor, exp),
          discount: minorToMajorInput(l.discount_minor, exp),
          tax_amount: minorToMajorInput(l.tax_amount_minor, exp),
        }))
      : [{ product_id: "", description: "", quantity: "1", unit_name: "each", expected_unit_cost: "", discount: "0", tax_amount: "0" }],
  );

  const createPO = useFinanceAction(
    workspaceId,
    (body: unknown, key: string) => financeApi.createDirectPurchaseOrder(workspaceId, body, key),
    { success: "Direct purchase order created", onDone: onClose },
  );
  const updateDraft = useFinanceAction(
    workspaceId,
    (body: unknown) => financeApi.updatePurchaseOrderDraft(workspaceId, order!.id, body),
    { success: "Purchase order draft updated", onDone: onClose },
  );
  const revisePO = useFinanceAction(
    workspaceId,
    (body: unknown, key: string) => financeApi.revisePurchaseOrder(workspaceId, order!.id, body, key),
    { success: "Purchase order revised and version snapshot saved", onDone: onClose },
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const mappedLines = lines.map((l) => ({
      id: l.id,
      product_id: l.product_id ? Number(l.product_id) : undefined,
      description: l.description,
      quantity: l.quantity,
      unit_name: l.unit_name || "each",
      expected_unit_cost: l.expected_unit_cost,
      discount: l.discount || "0",
      tax_amount: l.tax_amount || "0",
    }));
    if (mode === "create") {
      createPO.mutate({
        supplier_id: Number(supplierId),
        outlet_id: outletId ? Number(outletId) : undefined,
        expected_date: expectedDate || undefined,
        payment_terms: paymentTerms || undefined,
        notes: notes || undefined,
        currency,
        lines: mappedLines,
      });
    } else if (mode === "edit" && src) {
      updateDraft.mutate({
        expected_version: src.version,
        supplier_id: supplierId ? Number(supplierId) : undefined,
        outlet_id: outletId ? Number(outletId) : undefined,
        expected_date: expectedDate || undefined,
        payment_terms: paymentTerms || undefined,
        notes: notes || undefined,
        currency,
        lines: mappedLines,
      });
    } else if (mode === "revise" && src) {
      revisePO.mutate({
        expected_version: src.version,
        reason,
        expected_date: expectedDate || undefined,
        payment_terms: paymentTerms || undefined,
        notes: notes || undefined,
        lines: mappedLines,
      });
    }
  };

  return (
    <FormDrawer
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title={mode === "create" ? "Direct purchase order" : mode === "edit" ? `Edit draft PO #${order?.id}` : `Revise PO ${order?.order_number || `#${order?.id}`}`}
      description={
        mode === "revise"
          ? "Revising preserves a snapshot of the prior version and prevents lowering quantities below already received quantities."
          : "Create or update a supplier purchase order commitment. No stock or ledger entry is posted yet."
      }
      submitLabel={mode === "create" ? "Create PO draft" : mode === "edit" ? "Save changes" : "Save revision"}
      isSubmitting={createPO.isPending || updateDraft.isPending || revisePO.isPending}
      onSubmit={handleSubmit}
    >
      {mode === "revise" ? (
        <AppInput label="Revision reason" isRequired value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Supplier confirmed price or quantity update" />
      ) : (
        <AppSelect
          label="Supplier"
          isRequired={mode === "create"}
          selectedKey={supplierId}
          onSelectionChange={setSupplierId}
          placeholder="Choose supplier"
          options={suppliers.map((s) => ({ key: String(s.id), label: s.name }))}
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <AppSelect
          label="Outlet / Location"
          selectedKey={outletId}
          onSelectionChange={setOutletId}
          placeholder="Default location"
          options={outlets.map((o) => ({ key: String(o.id), label: o.name }))}
        />
        <AppInput label="Expected delivery date" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <AppInput label="Payment terms" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="Net 30" />
        <AppInput label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional delivery instructions" />
      </div>
      <div className="flex items-center justify-between pt-2">
        <p className="text-[13px] font-semibold text-foreground">Order lines</p>
        <AppButton
          size="sm"
          variant="tertiary"
          startContent={<Plus weight="bold" />}
          label="Add line"
          onPress={() => setLines((cur) => [...cur, { product_id: "", description: "", quantity: "1", unit_name: "each", expected_unit_cost: "", discount: "0", tax_amount: "0" }])}
        />
      </div>
      {lines.map((line, idx) => (
        <div key={idx} className="space-y-3 rounded-2xl bg-default p-4">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-semibold text-foreground">Line {idx + 1}</p>
            {lines.length > 1 ? (
              <AppButton isIconOnly size="sm" variant="ghost" aria-label={`Remove line ${idx + 1}`} startContent={<Trash />} onPress={() => setLines((cur) => cur.filter((_, i) => i !== idx))} />
            ) : null}
          </div>
          <AppSelect
            label="Product or service"
            selectedKey={line.product_id}
            onSelectionChange={(k) => {
              const prod = products.find((p) => String(p.id) === k);
              setLines((cur) => cur.map((item, i) => (i === idx ? { ...item, product_id: k, description: item.description || prod?.name || "" } : item)));
            }}
            placeholder="Optional catalogue item"
            options={products.map((p) => ({ key: String(p.id), label: p.name }))}
          />
          <AppInput label="Description" isRequired value={line.description} onChange={(e) => setLines((cur) => cur.map((item, i) => (i === idx ? { ...item, description: e.target.value } : item)))} />
          <div className="grid grid-cols-3 gap-2">
            <AppInput label="Quantity" isRequired value={line.quantity} onChange={(e) => setLines((cur) => cur.map((item, i) => (i === idx ? { ...item, quantity: e.target.value } : item)))} />
            <AppInput label="Unit" value={line.unit_name} onChange={(e) => setLines((cur) => cur.map((item, i) => (i === idx ? { ...item, unit_name: e.target.value } : item)))} />
            <AppInput label="Unit cost" isRequired value={line.expected_unit_cost} onChange={(e) => setLines((cur) => cur.map((item, i) => (i === idx ? { ...item, expected_unit_cost: e.target.value } : item)))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <AppInput label="Line discount" value={line.discount} onChange={(e) => setLines((cur) => cur.map((item, i) => (i === idx ? { ...item, discount: e.target.value } : item)))} />
            <AppInput label="Line tax" value={line.tax_amount} onChange={(e) => setLines((cur) => cur.map((item, i) => (i === idx ? { ...item, tax_amount: e.target.value } : item)))} />
          </div>
        </div>
      ))}
    </FormDrawer>
  );
}

export function PurchaseOrderEditorDrawer(props: {
  workspaceId: number;
  currency: string;
  isOpen: boolean;
  mode: "create" | "edit" | "revise";
  order?: PurchaseOrder | null;
  suppliers: Contact[];
  products: CatalogueItem[];
  outlets: InventoryOutlet[];
  onClose: () => void;
}) {
  const orderDetailQuery = useQuery({
    queryKey: [...moneyKeys.workspace(props.workspaceId), "purchase-order", props.order?.id, "editor"],
    queryFn: () => financeApi.getPurchaseOrder(props.workspaceId, props.order!.id),
    enabled: props.isOpen && Boolean(props.order) && props.mode !== "create",
  });
  if (!props.isOpen) return null;
  const loaded = props.mode === "create" ? null : orderDetailQuery.data;
  return (
    <PurchaseOrderEditorInner
      key={`${props.mode}-${props.order?.id ?? "new"}-${loaded ? "loaded" : "init"}`}
      {...props}
      initialOrder={loaded}
    />
  );
}

type ExtendedReceiptLineForm = {
  purchase_order_line_id?: number;
  product_id: string;
  description: string;
  remaining_quantity?: string;
  accepted_quantity: string;
  rejected_quantity: string;
  actual_unit_cost: string;
  batch_number: string;
  expiry_date: string;
  serial_numbers_text: string;
  notes: string;
};

function ExtendedGoodsReceiptInner({
  workspaceId,
  currency,
  isOpen,
  order,
  unplanned,
  options,
  suppliers,
  products,
  outlets,
  onClose,
}: {
  workspaceId: number;
  currency: string;
  isOpen: boolean;
  order: PurchaseOrder | null;
  unplanned: boolean;
  options: ReceiptOptionLine[] | undefined;
  suppliers: Contact[];
  products: CatalogueItem[];
  outlets: InventoryOutlet[];
  onClose: () => void;
}) {
  const defaultLoc = outlets.find((o) => o.is_default)?.id ?? outlets[0]?.id;
  const [supplierId, setSupplierId] = useState("");
  const [locationId, setLocationId] = useState(() => (defaultLoc ? String(defaultLoc) : ""));
  const [reason, setReason] = useState("");
  const [receivedOn, setReceivedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [receiptRef, setReceiptRef] = useState("");
  const [deliveryRef, setDeliveryRef] = useState("");
  const [serviceAccepted, setServiceAccepted] = useState(false);
  const [landedCost, setLandedCost] = useState("0");
  const [lines, setLines] = useState<ExtendedReceiptLineForm[]>(() =>
    unplanned
      ? [{ product_id: "", description: "", accepted_quantity: "1", rejected_quantity: "0", actual_unit_cost: "", batch_number: "", expiry_date: "", serial_numbers_text: "", notes: "" }]
      : (options ?? []).map((opt) => ({
          purchase_order_line_id: opt.purchase_order_line_id,
          product_id: "",
          description: opt.description,
          remaining_quantity: opt.remaining_quantity,
          accepted_quantity: opt.remaining_quantity,
          rejected_quantity: "0",
          actual_unit_cost: "",
          batch_number: "",
          expiry_date: "",
          serial_numbers_text: "",
          notes: "",
        })),
  );

  const submitReceipt = useFinanceAction(
    workspaceId,
    (body: unknown, key: string) => financeApi.createGoodsReceipt(workspaceId, body, key),
    { success: "Goods receipt posted", onDone: onClose },
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const mappedLines = lines
      .filter((l) => Number(l.accepted_quantity || "0") > 0 || Number(l.rejected_quantity || "0") > 0)
      .map((l) => ({
        purchase_order_line_id: l.purchase_order_line_id,
        product_id: l.product_id ? Number(l.product_id) : undefined,
        description: l.description,
        accepted_quantity: l.accepted_quantity || "0",
        rejected_quantity: l.rejected_quantity || "0",
        actual_unit_cost: l.actual_unit_cost || undefined,
        batch_number: l.batch_number || undefined,
        expiry_date: l.expiry_date || undefined,
        serial_numbers: l.serial_numbers_text
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        notes: l.notes || undefined,
      }));
    if (mappedLines.length === 0) return;

    submitReceipt.mutate({
      purchase_order_id: unplanned ? 0 : order?.id,
      supplier_id: unplanned ? Number(supplierId) : undefined,
      reason: unplanned ? reason : undefined,
      currency: unplanned ? currency : undefined,
      location_id: locationId ? Number(locationId) : undefined,
      received_on: receivedOn,
      receipt_reference: receiptRef || undefined,
      delivery_reference: deliveryRef || undefined,
      service_accepted: serviceAccepted,
      landed_cost: landedCost || "0",
      lines: mappedLines,
    });
  };

  return (
    <FormDrawer
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title={unplanned ? "Unplanned goods receipt" : `Receive ${order?.order_number || `PO #${order?.id}`}`}
      description="Posting records accepted stock/service value, rejected quantities (excluded from stock), landed cost allocation, and GRNI."
      submitLabel="Post receipt"
      isSubmitting={submitReceipt.isPending}
      onSubmit={handleSubmit}
    >
      {unplanned ? (
        <>
          <AppSelect label="Supplier" isRequired selectedKey={supplierId} onSelectionChange={setSupplierId} placeholder="Choose supplier" options={suppliers.map((s) => ({ key: String(s.id), label: s.name }))} />
          <AppInput label="Unplanned receipt reason" isRequired value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Urgent walk-in delivery without prior PO" />
        </>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <AppSelect label="Receiving location / outlet" isRequired selectedKey={locationId} onSelectionChange={setLocationId} placeholder="Choose location" options={outlets.map((o) => ({ key: String(o.id), label: o.name }))} />
        <AppInput label="Received on" type="date" isRequired value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <AppInput label="Receipt ref" value={receiptRef} onChange={(e) => setReceiptRef(e.target.value)} placeholder="GRN-001" />
        <AppInput label="Delivery note ref" value={deliveryRef} onChange={(e) => setDeliveryRef(e.target.value)} placeholder="DN-889" />
        <AppInput label="Landed cost" value={landedCost} onChange={(e) => setLandedCost(e.target.value)} placeholder="0" />
      </div>
      <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
        <input type="checkbox" checked={serviceAccepted} onChange={(e) => setServiceAccepted(e.target.checked)} className="rounded border-default" />
        Service delivery accepted
      </label>

      <div className="flex items-center justify-between pt-2">
        <p className="text-[13px] font-semibold text-foreground">Receipt lines</p>
        {unplanned ? (
          <AppButton
            size="sm"
            variant="tertiary"
            startContent={<Plus weight="bold" />}
            label="Add line"
            onPress={() => setLines((cur) => [...cur, { product_id: "", description: "", accepted_quantity: "1", rejected_quantity: "0", actual_unit_cost: "", batch_number: "", expiry_date: "", serial_numbers_text: "", notes: "" }])}
          />
        ) : null}
      </div>
      {lines.map((line, idx) => (
        <div key={idx} className="space-y-2.5 rounded-2xl bg-default p-3.5">
          {unplanned ? (
            <>
              <AppSelect
                label="Product"
                selectedKey={line.product_id}
                onSelectionChange={(k) => {
                  const p = products.find((item) => String(item.id) === k);
                  setLines((cur) => cur.map((item, i) => (i === idx ? { ...item, product_id: k, description: item.description || p?.name || "" } : item)));
                }}
                placeholder="Catalogue product (optional)"
                options={products.map((p) => ({ key: String(p.id), label: p.name }))}
              />
              <AppInput label="Description" isRequired value={line.description} onChange={(e) => setLines((cur) => cur.map((item, i) => (i === idx ? { ...item, description: e.target.value } : item)))} />
            </>
          ) : (
            <p className="text-xs font-semibold text-foreground">
              {line.description} · open {line.remaining_quantity}
            </p>
          )}
          <div className="grid grid-cols-3 gap-2">
            <AppInput label="Accepted qty" value={line.accepted_quantity} onChange={(e) => setLines((cur) => cur.map((item, i) => (i === idx ? { ...item, accepted_quantity: e.target.value } : item)))} />
            <AppInput label="Rejected qty" value={line.rejected_quantity} onChange={(e) => setLines((cur) => cur.map((item, i) => (i === idx ? { ...item, rejected_quantity: e.target.value } : item)))} />
            <AppInput label="Actual unit cost" isRequired={unplanned} placeholder={unplanned ? "Unit cost" : "PO cost"} value={line.actual_unit_cost} onChange={(e) => setLines((cur) => cur.map((item, i) => (i === idx ? { ...item, actual_unit_cost: e.target.value } : item)))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <AppInput label="Batch / lot #" value={line.batch_number} onChange={(e) => setLines((cur) => cur.map((item, i) => (i === idx ? { ...item, batch_number: e.target.value } : item)))} />
            <AppInput label="Expiry date" type="date" value={line.expiry_date} onChange={(e) => setLines((cur) => cur.map((item, i) => (i === idx ? { ...item, expiry_date: e.target.value } : item)))} />
          </div>
          <AppInput label="Serial numbers (comma-separated)" value={line.serial_numbers_text} onChange={(e) => setLines((cur) => cur.map((item, i) => (i === idx ? { ...item, serial_numbers_text: e.target.value } : item)))} placeholder="SN-001, SN-002" />
          <AppInput label="Line notes" value={line.notes} onChange={(e) => setLines((cur) => cur.map((item, i) => (i === idx ? { ...item, notes: e.target.value } : item)))} />
        </div>
      ))}
    </FormDrawer>
  );
}

export function ExtendedGoodsReceiptDrawer(props: {
  workspaceId: number;
  currency: string;
  isOpen: boolean;
  order: PurchaseOrder | null;
  unplanned: boolean;
  suppliers: Contact[];
  products: CatalogueItem[];
  outlets: InventoryOutlet[];
  onClose: () => void;
}) {
  const receiptOptions = useQuery({
    queryKey: [...moneyKeys.workspace(props.workspaceId), "receipt-options", props.order?.id],
    queryFn: () => financeApi.receiptOptions(props.workspaceId, props.order!.id),
    enabled: props.isOpen && !props.unplanned && Boolean(props.order),
  });
  if (!props.isOpen) return null;
  const loadedKey = props.unplanned ? "unplanned" : `po-${props.order?.id}-${receiptOptions.data ? receiptOptions.data.length : "loading"}`;
  return <ExtendedGoodsReceiptInner key={loadedKey} {...props} options={receiptOptions.data} />;
}

export function GoodsReceiptDetailDrawer({
  workspaceId,
  currency,
  receiptId,
  onClose,
}: {
  workspaceId: number;
  currency: string;
  receiptId: number | null;
  onClose: () => void;
}) {
  const detail = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "goods-receipt-detail", receiptId],
    queryFn: () => financeApi.getGoodsReceipt(workspaceId, receiptId!),
    enabled: Boolean(receiptId),
  });
  const attachments = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "procurement-attachments", "grn", receiptId],
    queryFn: () => financeApi.listProcurementAttachments(workspaceId, { goods_receipt_id: receiptId! }),
    enabled: Boolean(receiptId),
  });

  const [fileName, setFileName] = useState("");
  const addAttachment = useFinanceAction(
    workspaceId,
    (name: string) =>
      financeApi.addProcurementAttachment(workspaceId, {
        goods_receipt_id: receiptId,
        storage_key: `manual/${Date.now()}-${name}`,
        file_name: name,
        mime_type: "application/pdf",
        file_size_bytes: 1024,
      }),
    { success: "Attachment reference recorded", onDone: () => setFileName("") },
  );

  return (
    <FormDrawer
      isOpen={Boolean(receiptId)}
      onOpenChange={(open) => !open && onClose()}
      title={receiptId ? `Goods receipt #${receiptId}` : "Goods receipt"}
      description="Immutable receipt evidence, landed cost allocation, batch/serial tracking, and attachments."
      submitLabel="Close"
      isSubmitting={false}
      onSubmit={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {detail.isPending ? (
        <p className="text-sm text-muted">Loading receipt detail…</p>
      ) : detail.data ? (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-default p-3">
            <div>
              <p className="text-xs text-muted">Source</p>
              <p className="font-semibold">{detail.data.source_type === "unplanned" ? "Unplanned receipt" : `PO #${detail.data.purchase_order_id}`}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Landed cost</p>
              <p className="font-semibold tabular">{formatMinorAmount(detail.data.landed_cost_minor ?? "0", detail.data.currency || currency, detail.data.currency_exponent ?? 2)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Delivery ref</p>
              <p className="font-semibold">{detail.data.delivery_reference || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Received on</p>
              <p className="font-semibold">{formatDate(detail.data.received_on)}</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Accepted & rejected lines</p>
            <div className="space-y-2">
              {(detail.data.lines ?? []).map((line) => (
                <div key={line.id} className="rounded-xl border border-default p-3 text-xs space-y-1">
                  <div className="flex justify-between font-semibold text-foreground">
                    <span>{line.description}</span>
                    <span className="tabular">{formatMinorAmount(line.line_total_minor, detail.data.currency || currency, detail.data.currency_exponent ?? 2)}</span>
                  </div>
                  <p className="text-muted">
                    Accepted: {line.accepted_quantity} · Rejected: {line.rejected_quantity ?? "0"} · Effective unit cost:{" "}
                    {formatMinorAmount(line.effective_unit_cost_minor ?? line.unit_cost_minor, detail.data.currency || currency, detail.data.currency_exponent ?? 2)}
                  </p>
                  {line.batch_number || line.expiry_date || (line.serial_numbers && line.serial_numbers.length > 0) ? (
                    <p className="text-muted">
                      {line.batch_number ? `Batch: ${line.batch_number} ` : ""}
                      {line.expiry_date ? `Exp: ${line.expiry_date} ` : ""}
                      {line.serial_numbers?.length ? `Serials: ${line.serial_numbers.join(", ")}` : ""}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2 pt-2 border-t border-default">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Attachments</p>
            {(attachments.data ?? []).map((att) => (
              <p key={att.id} className="text-xs text-foreground">
                {att.file_name} ({att.mime_type})
              </p>
            ))}
            <div className="flex gap-2">
              <AppInput placeholder="Delivery note filename (e.g. dn-001.pdf)" value={fileName} onChange={(e) => setFileName(e.target.value)} />
              <AppButton size="sm" variant="secondary" label="Attach" isDisabled={!fileName.trim()} onPress={() => addAttachment.mutate(fileName.trim())} />
            </div>
          </div>
        </div>
      ) : null}
    </FormDrawer>
  );
}

function ReceiptBillDrawerInner({
  workspaceId,
  receipt,
  receiptDetail,
  currency,
  onClose,
}: {
  workspaceId: number;
  receipt: GoodsReceipt;
  receiptDetail?: GoodsReceipt;
  currency: string;
  onClose: () => void;
}) {
  const exp = receiptDetail?.currency_exponent ?? 2;
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [lineDrafts, setLineDrafts] = useState<{ goods_receipt_line_id: number; description: string; quantity: string; unit_cost: string; discount: string; tax_amount: string }[]>(() =>
    (receiptDetail?.lines ?? [])
      .filter((l) => Number(l.accepted_quantity) > 0)
      .map((l) => ({
        goods_receipt_line_id: l.id,
        description: l.description,
        quantity: l.accepted_quantity,
        unit_cost: minorToMajorInput(l.actual_unit_cost_minor ?? l.unit_cost_minor, exp),
        discount: "0",
        tax_amount: "0",
      })),
  );

  const createBill = useFinanceAction(
    workspaceId,
    (body: unknown, key: string) => financeApi.createSupplierBill(workspaceId, body, key),
    { success: "Supplier bill saved", onDone: onClose },
  );

  return (
    <FormDrawer
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title="New supplier bill"
      description={`Bill receipt #${receipt.id}. Adjust line quantities, prices, discounts, or tax (${currency}) to support partial billing or variance review.`}
      submitLabel="Save bill"
      isSubmitting={createBill.isPending}
      onSubmit={(e) => {
        e.preventDefault();
        if (!invoiceNumber.trim()) return;
        createBill.mutate({
          goods_receipt_id: receipt.id,
          supplier_invoice_number: invoiceNumber.trim(),
          bill_date: billDate,
          due_date: dueDate || undefined,
          lines: lineDrafts.length > 0 ? lineDrafts.filter((l) => Number(l.quantity) > 0) : undefined,
        });
      }}
    >
      <AppInput label="Supplier invoice number" isRequired value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-2026-001" />
      <div className="grid grid-cols-2 gap-3">
        <AppInput label="Bill date" type="date" isRequired value={billDate} onChange={(e) => setBillDate(e.target.value)} />
        <AppInput label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
      <div className="space-y-2.5 pt-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Invoice lines</p>
        {lineDrafts.map((line, idx) => (
          <div key={line.goods_receipt_line_id} className="rounded-xl bg-default p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground">{line.description}</p>
            <div className="grid grid-cols-4 gap-2">
              <AppInput label="Qty" value={line.quantity} onChange={(e) => setLineDrafts((cur) => cur.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))} />
              <AppInput label="Unit cost" value={line.unit_cost} onChange={(e) => setLineDrafts((cur) => cur.map((x, i) => (i === idx ? { ...x, unit_cost: e.target.value } : x)))} />
              <AppInput label="Discount" value={line.discount} onChange={(e) => setLineDrafts((cur) => cur.map((x, i) => (i === idx ? { ...x, discount: e.target.value } : x)))} />
              <AppInput label="Tax" value={line.tax_amount} onChange={(e) => setLineDrafts((cur) => cur.map((x, i) => (i === idx ? { ...x, tax_amount: e.target.value } : x)))} />
            </div>
          </div>
        ))}
      </div>
    </FormDrawer>
  );
}

export function ReceiptBillDrawer({
  workspaceId,
  receipt,
  currency,
  onClose,
}: {
  workspaceId: number;
  receipt: GoodsReceipt | null;
  currency: string;
  onClose: () => void;
}) {
  const detail = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "goods-receipt-detail", receipt?.id],
    queryFn: () => financeApi.getGoodsReceipt(workspaceId, receipt!.id),
    enabled: Boolean(receipt),
  });
  if (!receipt) return null;
  return (
    <ReceiptBillDrawerInner
      key={`bill-grn-${receipt.id}-${detail.data ? detail.data.lines?.length ?? 0 : "loading"}`}
      workspaceId={workspaceId}
      receipt={receipt}
      receiptDetail={detail.data}
      currency={currency}
      onClose={onClose}
    />
  );
}

function BillActionDrawerInner({
  workspaceId,
  currency,
  target,
  credits,
  onClose,
}: {
  workspaceId: number;
  currency: string;
  target: { bill: SupplierBill; mode: "reject" | "dispute" | "reverse" | "apply_credit" };
  credits: SupplierCredit[];
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [creditId, setCreditId] = useState("");
  const [amount, setAmount] = useState("");

  const transition = useFinanceAction(
    workspaceId,
    (body: { reason: string }, key: string) =>
      financeApi.transitionSupplierBill(workspaceId, target.bill.id, target.mode as "reject" | "dispute" | "reverse", target.bill.version, body.reason, key),
    { success: "Supplier bill updated", onDone: onClose },
  );

  const applyCredit = useFinanceAction(
    workspaceId,
    (body: { supplier_credit_id: number; amount: string }, key: string) =>
      financeApi.applyCreditToSupplierBill(
        workspaceId,
        target.bill.id,
        { supplier_credit_id: body.supplier_credit_id, amount: body.amount, expected_bill_version: target.bill.version },
        key,
      ),
    { success: "Supplier credit applied to bill", onDone: onClose },
  );

  const eligibleCredits = credits.filter((c) => Number(c.outstanding_minor) > 0 && (!target.bill.supplier_id || c.supplier_id === target.bill.supplier_id));

  return (
    <FormDrawer
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={
        target.mode === "apply_credit"
          ? `Apply supplier credit to Bill #${target.bill.id}`
          : target.mode === "reverse"
            ? `Reverse approved Bill #${target.bill.id}`
            : target.mode === "dispute"
              ? `Dispute Bill #${target.bill.id}`
              : `Reject Bill #${target.bill.id}`
      }
      description={
        target.mode === "apply_credit"
          ? "Reduces bill payable balance against an unapplied supplier credit without cash movement."
          : target.mode === "reverse"
            ? "Posts a balanced reversal ledger entry restoring GRNI/AP when no payments or credits have been applied."
            : "Provide an auditable reason for rejecting or disputing this supplier bill."
      }
      submitLabel={target.mode === "apply_credit" ? "Apply credit" : "Confirm"}
      isSubmitting={transition.isPending || applyCredit.isPending}
      onSubmit={(e) => {
        e.preventDefault();
        if (target.mode === "apply_credit") {
          applyCredit.mutate({ supplier_credit_id: Number(creditId), amount });
        } else {
          transition.mutate({ reason });
        }
      }}
    >
      {target.mode === "apply_credit" ? (
        <>
          <AppSelect
            label="Supplier credit"
            isRequired
            selectedKey={creditId}
            onSelectionChange={setCreditId}
            placeholder="Select unapplied credit"
            options={eligibleCredits.map((c) => ({
              key: String(c.id),
              label: `Credit #${c.id} · ${formatMinorAmount(c.outstanding_minor, c.currency || currency, 2)} available`,
            }))}
          />
          <AppInput label="Amount to apply" isRequired value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100" />
        </>
      ) : (
        <AppInput label="Reason" isRequired value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain variance or error" />
      )}
    </FormDrawer>
  );
}

export function BillActionDrawer({
  workspaceId,
  currency,
  target,
  credits,
  onClose,
}: {
  workspaceId: number;
  currency: string;
  target: { bill: SupplierBill; mode: "reject" | "dispute" | "reverse" | "apply_credit" } | null;
  credits: SupplierCredit[];
  onClose: () => void;
}) {
  if (!target) return null;
  return <BillActionDrawerInner key={`${target.mode}-${target.bill.id}-${target.bill.version}`} workspaceId={workspaceId} currency={currency} target={target} credits={credits} onClose={onClose} />;
}

function ApprovalPolicyInner({
  workspaceId,
  initialPolicy,
  onClose,
}: {
  workspaceId: number;
  initialPolicy?: ProcurementApprovalPolicy;
  onClose: () => void;
}) {
  const [threshold, setThreshold] = useState(() => (initialPolicy ? minorToMajorInput(initialPolicy.approval_threshold_minor, 2) : "0"));
  const [allowSelf, setAllowSelf] = useState(() => initialPolicy?.allow_self_approval ?? true);
  const [priceBps, setPriceBps] = useState(() => String(initialPolicy?.price_variance_tolerance_bps ?? 0));
  const [qtyBps, setQtyBps] = useState(() => String(initialPolicy?.qty_variance_tolerance_bps ?? 0));
  const [allowUnplanned, setAllowUnplanned] = useState(() => initialPolicy?.allow_unplanned_receipt ?? true);
  const [allowOverReceipt, setAllowOverReceipt] = useState(() => initialPolicy?.allow_over_receipt ?? false);

  const savePolicy = useFinanceAction(
    workspaceId,
    (body: unknown) => financeApi.updateProcurementApprovalPolicy(workspaceId, body),
    { success: "Procurement controls policy saved", onDone: onClose },
  );

  return (
    <FormDrawer
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title="Procurement & receiving policy"
      description="Configure request approval thresholds, three-way match tolerance (bps), unplanned receipts, and over-receipt controls."
      submitLabel="Save policy"
      isSubmitting={savePolicy.isPending}
      onSubmit={(e) => {
        e.preventDefault();
        savePolicy.mutate({
          approval_threshold: threshold || "0",
          allow_self_approval: allowSelf,
          price_variance_tolerance_bps: Number(priceBps || "0"),
          qty_variance_tolerance_bps: Number(qtyBps || "0"),
          allow_unplanned_receipt: allowUnplanned,
          allow_over_receipt: allowOverReceipt,
        });
      }}
    >
      <AppInput label="Approval threshold (major)" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <AppInput label="Price variance tolerance (bps)" value={priceBps} onChange={(e) => setPriceBps(e.target.value)} description="100 bps = 1%" />
        <AppInput label="Qty variance tolerance (bps)" value={qtyBps} onChange={(e) => setQtyBps(e.target.value)} />
      </div>
      <div className="space-y-2.5 pt-2 text-xs">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={allowSelf} onChange={(e) => setAllowSelf(e.target.checked)} />
          Allow creator self-approval below threshold
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={allowUnplanned} onChange={(e) => setAllowUnplanned(e.target.checked)} />
          Allow unplanned receipts without a PO
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={allowOverReceipt} onChange={(e) => setAllowOverReceipt(e.target.checked)} />
          Allow receiving above PO ordered quantity
        </label>
      </div>
    </FormDrawer>
  );
}

export function ApprovalPolicyDrawer({
  workspaceId,
  isOpen,
  onClose,
}: {
  workspaceId: number;
  isOpen: boolean;
  onClose: () => void;
}) {
  const policyQuery = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "procurement-approval-policy"],
    queryFn: () => financeApi.getProcurementApprovalPolicy(workspaceId),
    enabled: isOpen,
  });
  if (!isOpen) return null;
  return <ApprovalPolicyInner key={policyQuery.data ? "loaded" : "init"} workspaceId={workspaceId} initialPolicy={policyQuery.data} onClose={onClose} />;
}

export function ProcurementReportsPanel({ report, currency }: { report?: ProcurementReport; currency: string }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["Open purchase orders", report ? `${report.open_purchase_order_count} · ${formatMinorAmount(report.open_purchase_order_minor, currency, 2)}` : "Loading…"],
          ["Ordered / received", report ? `${formatMinorAmount(report.ordered_minor, currency, 2)} · ${formatMinorAmount(report.received_minor, currency, 2)}` : "Loading…"],
          ["Unbilled receipts / GRNI", report ? `${report.unbilled_receipt_count} · ${formatMinorAmount(report.grni_minor, currency, 2)}` : "Loading…"],
          ["AP outstanding / overdue", report ? `${formatMinorAmount(report.ap_outstanding_minor, currency, 2)} · ${formatMinorAmount(report.ap_overdue_minor, currency, 2)}` : "Loading…"],
          ["Unapplied supplier advances", report ? `${report.unapplied_advance_count} · ${formatMinorAmount(report.unapplied_advance_minor, currency, 2)}` : "Loading…"],
          ["Unapplied supplier credits", report ? `${report.unapplied_credit_count ?? 0} · ${formatMinorAmount(report.unapplied_credit_minor ?? "0", currency, 2)}` : "Loading…"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-default bg-surface p-4">
            <p className="text-[12px] text-muted">{label}</p>
            <p className="mt-2 text-[18px] font-semibold tabular text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {report?.ap_aging ? (
        <div className="rounded-2xl border border-default bg-surface p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">Accounts Payable Aging</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {[
              ["Current", report.ap_aging.current_minor],
              ["1–30 days overdue", report.ap_aging.days_1_30_minor],
              ["31–60 days overdue", report.ap_aging.days_31_60_minor],
              ["61+ days overdue", report.ap_aging.days_61_plus_minor],
            ].map(([bucket, amt]) => (
              <div key={bucket} className="rounded-xl bg-default p-3">
                <p className="text-muted">{bucket}</p>
                <p className="mt-1 font-semibold tabular text-foreground">{formatMinorAmount(amt, currency, 2)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {(report?.aged_grni?.length ?? 0) > 0 ? (
        <div className="rounded-2xl border border-default bg-surface p-4 space-y-2">
          <p className="text-sm font-semibold text-foreground">Unbilled GRNI Aging</p>
          <div className="space-y-1.5 text-xs">
            {report!.aged_grni!.map((item) => (
              <div key={item.receipt_id} className="flex items-center justify-between border-b border-default py-1.5 last:border-0">
                <span>
                  Receipt #{item.receipt_id} {item.receipt_reference ? `(${item.receipt_reference})` : ""} · {item.age_days} days old
                </span>
                <span className="font-semibold tabular">{formatMinorAmount(item.grni_minor, currency, 2)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {(report?.variance_bills?.length ?? 0) > 0 ? (
        <div className="rounded-2xl border border-default bg-surface p-4 space-y-2">
          <p className="text-sm font-semibold text-foreground">Price / Quantity Variance Bills</p>
          <div className="space-y-1.5 text-xs">
            {report!.variance_bills!.map((b) => (
              <div key={b.id} className="flex items-center justify-between border-b border-default py-1.5 last:border-0">
                <span>
                  Bill #{b.id} ({b.supplier_invoice_number}) · Match: {b.match_status} · Status: {b.status}
                </span>
                <span className="font-semibold tabular">Variance: {formatMinorAmount(b.variance_minor, currency, 2)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {(report?.pending_returns?.length ?? 0) > 0 ? (
        <div className="rounded-2xl border border-default bg-surface p-4 space-y-2">
          <p className="text-sm font-semibold text-foreground">Supplier Returns Awaiting Credit</p>
          <div className="space-y-1.5 text-xs">
            {report!.pending_returns!.map((r) => (
              <div key={r.id} className="flex items-center justify-between border-b border-default py-1.5 last:border-0">
                <span>
                  Return #{r.id} (Receipt #{r.goods_receipt_id}) · {r.reason}
                </span>
                <span className="font-semibold tabular">{formatMinorAmount(r.total_minor, currency, 2)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
