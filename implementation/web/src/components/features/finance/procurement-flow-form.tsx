"use client";

import {
  ArrowLeft,
  ArrowRight,
  CalendarBlank,
  CheckCircle,
  Clock,
  Fire,
  Flag,
  HandCoins,
  Package,
  Plus,
  Receipt,
  Truck,
  X,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppSelect } from "@/components/ui/app-select";
import { AppTextarea } from "@/components/ui/app-textarea";
import { ChoiceCards, FormGrid, FormPage, FormSection, PickerDrawer, StepNav, SummaryPanel, type PickerItem } from "@/components/ui/form-kit";
import { MoneyInput } from "@/components/ui/money-input";
import {
  AccountPicker,
  CategoryPicker,
  ContactPicker,
  LineItemsField,
  lineTotal,
  toMinor,
  useOutlets,
  type ContactValue,
  type LineItem,
} from "@/components/pickers";
import { formatDate } from "@/lib/format";
import { financeApi, formatMinorAmount, moneyKeys } from "@/lib/money";
import { createIdempotencyKey } from "@/lib/utils";

import { today, useContacts, useFinanceAction, WorkspaceGate, type WorkspaceInfo } from "./shared";

export type ProcurementFlowMode = "purchase" | "receipt" | "order" | "request" | "bill";

type PaymentStatus = "paid" | "part" | "unpaid" | "receipt_only";
type CostTreatment = "divide" | "operational";
type PriorityLevel = "low" | "normal" | "high" | "urgent";

export interface OtherCostItem {
  key: string;
  description: string;
  amount: string;
}

const EXPONENT = 2;

const COST_PRESETS: { id: string; label: string; description: string }[] = [
  { id: "cost-transport", label: "Transportation", description: "Waybill, bike, van or delivery fare" },
  { id: "cost-shipping", label: "Shipping & freight", description: "Courier, cargo or sea/air freight" },
  { id: "cost-loading", label: "Loading & offloading", description: "Warehouse or market handling fees" },
  { id: "cost-customs", label: "Clearing & customs", description: "Import duty, port or clearing charges" },
  { id: "cost-packaging", label: "Packaging", description: "Cartons, bags, wraps or crates" },
];

function minorToMajor(minor?: string | number | bigint | null, exponent = EXPONENT): string {
  if (minor === undefined || minor === null || minor === "" || minor === "0" || minor === 0) return "";
  const value = BigInt(minor);
  if (value <= BigInt(0)) return "";
  const base = BigInt(10 ** exponent);
  const fraction = (value % base).toString().padStart(exponent, "0");
  return `${value / base}.${fraction}`.replace(/\.00$/, "");
}

function initialsOf(name: string) {
  return (
    name
      .split(/[\s/]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "EC"
  );
}

/** Allocates total extra cost (in minor units) across lines proportionally to each line's total. */
export function allocateCostsAcrossLines(items: LineItem[], extraCostMinor: bigint): { lineAllocatedMinor: bigint; effectiveUnitMinor: bigint }[] {
  if (!items.length) return [];
  const lineTotals = items.map((line) => lineTotal(line));
  const baseSum = lineTotals.reduce((sum, val) => sum + val, BigInt(0));

  if (extraCostMinor <= BigInt(0) || baseSum <= BigInt(0)) {
    return items.map((line) => ({
      lineAllocatedMinor: BigInt(0),
      effectiveUnitMinor: toMinor(line.unit_price),
    }));
  }

  let assigned = BigInt(0);
  let largestIndex = 0;
  for (let i = 0; i < lineTotals.length; i++) {
    if (lineTotals[i] > lineTotals[largestIndex]) largestIndex = i;
  }

  const shares = lineTotals.map((lt) => {
    const share = (extraCostMinor * lt) / baseSum;
    assigned += share;
    return share;
  });
  shares[largestIndex] += extraCostMinor - assigned;

  return items.map((line, index) => {
    const qty = BigInt(/^\d+$/.test(line.quantity) && Number(line.quantity) > 0 ? line.quantity : "1");
    const newLineTotal = lineTotals[index] + shares[index];
    return {
      lineAllocatedMinor: shares[index],
      effectiveUnitMinor: newLineTotal / qty,
    };
  });
}

function OtherCostsEditor({
  currency,
  costs,
  onChange,
  treatment,
  onTreatmentChange,
  items,
  showTreatmentChoice,
}: {
  currency: string;
  costs: OtherCostItem[];
  onChange: (next: OtherCostItem[]) => void;
  treatment: CostTreatment;
  onTreatmentChange: (next: CostTreatment) => void;
  items: LineItem[];
  showTreatmentChoice: boolean;
}) {
  const [drawer, setDrawer] = useState<{ key: number; editIndex?: number } | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const show = (minor: bigint) => formatMinorAmount(minor.toString(), currency, EXPONENT);

  const open = (editIndex?: number) => {
    const nextKey = openCount + 1;
    setOpenCount(nextKey);
    setDrawer({ key: nextKey, editIndex });
  };

  const editing = drawer?.editIndex !== undefined ? costs[drawer.editIndex] : undefined;
  const totalExtraMinor = costs.reduce((sum, cost) => sum + toMinor(cost.amount), BigInt(0));
  const allocations = useMemo(() => allocateCostsAcrossLines(items, totalExtraMinor), [items, totalExtraMinor]);

  const usedNames = new Set(costs.map((c) => c.description.trim().toLowerCase()));
  const presetItems: PickerItem[] = COST_PRESETS.filter((p) => !usedNames.has(p.label.toLowerCase())).map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
  }));

  return (
    <div className="space-y-4">
      {costs.length > 0 ? (
        <ul className="divide-y divide-separator overflow-hidden rounded-xl border border-border bg-surface">
          {costs.map((cost, index) => (
            <li key={cost.key} className="animate-fade-up flex items-center gap-3 px-3.5 py-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-[13px] font-bold text-primary-soft-foreground">
                {initialsOf(cost.description)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{cost.description}</span>
                <span className="block text-[12px] text-muted">
                  {treatment === "divide" && items.length > 0 ? "Divided across items" : "Operational cost"}
                </span>
              </span>
              <span className="shrink-0 text-[14px] font-bold tabular">{show(toMinor(cost.amount))}</span>
              <button
                type="button"
                onClick={() => open(index)}
                className="h-8 cursor-pointer rounded-lg px-3 text-[13px] font-semibold text-primary transition-colors hover:bg-primary-soft"
              >
                Change
              </button>
              <button
                type="button"
                aria-label={`Remove ${cost.description}`}
                onClick={() => onChange(costs.filter((_, i) => i !== index))}
                className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={() => open()}
        className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary-soft/40 px-3 py-2.5 text-left text-[14px] font-semibold text-primary-soft-foreground transition-colors hover:bg-primary-soft"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-white">
          <Plus size={16} weight="bold" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate">{costs.length === 0 ? "Add extra cost" : "Add another cost"}</span>
        </span>
      </button>

      {costs.length > 0 && showTreatmentChoice && items.length > 0 ? (
        <div className="animate-fade-up space-y-3 pt-1">
          <ChoiceCards<CostTreatment>
            label="Treat extra costs as"
            value={treatment}
            onChange={onTreatmentChange}
            options={[
              {
                key: "divide",
                label: "Landed cost",
                description: "Split across items",
                icon: Package,
              },
              {
                key: "operational",
                label: "Operational cost",
                description: "Record as expense",
                icon: Truck,
              },
            ]}
          />

          {treatment === "divide" ? (
            <div className="rounded-xl border border-border bg-surface-secondary p-3.5 space-y-2">
              <p className="text-[12px] font-semibold text-foreground">New unit costs</p>
              <div className="space-y-1.5 text-[12px]">
                {items.map((item, idx) => {
                  const alloc = allocations[idx];
                  if (!alloc) return null;
                  return (
                    <div key={`${item.description}-${idx}`} className="flex items-center justify-between gap-2">
                      <span className="truncate text-muted">
                        {item.description} ({item.quantity} × {show(toMinor(item.unit_price))})
                      </span>
                      <span className="shrink-0 font-semibold tabular">
                        +{show(alloc.lineAllocatedMinor)} → {show(alloc.effectiveUnitMinor)} / unit
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {drawer ? (
        <PickerDrawer
          key={drawer.key}
          isOpen
          onOpenChange={(isOpen) => !isOpen && setDrawer(null)}
          title="Add extra cost"
          items={presetItems}
          onSelect={() => undefined}
          searchPlaceholder="Search costs"
          emptyText="Add a custom cost above."
          createLabel="New extra cost"
          editOnSelect
          formTitle={editing ? `Edit ${editing.description}` : "Extra cost"}
          startInForm={editing ? { item: { id: editing.key, label: editing.description } } : undefined}
          renderCreate={({ initialName, item, done, cancel }) => {
            const preset = item?.id.startsWith("cost-") ? COST_PRESETS.find((p) => p.id === item.id) : undefined;
            return (
              <ExtraCostForm
                currency={currency}
                initialDescription={editing ? editing.description : preset ? preset.label : initialName}
                initialAmount={editing ? editing.amount : ""}
                isEditing={Boolean(editing)}
                onCancel={editing ? () => setDrawer(null) : cancel}
                onSave={(desc, amt) => {
                  if (editing && drawer.editIndex !== undefined) {
                    onChange(costs.map((c, i) => (i === drawer.editIndex ? { ...c, description: desc, amount: amt } : c)));
                  } else {
                    onChange([...costs, { key: crypto.randomUUID(), description: desc, amount: amt }]);
                  }
                  done({ id: "saved", label: desc });
                }}
              />
            );
          }}
        />
      ) : null}
    </div>
  );
}

function ExtraCostForm({
  currency,
  initialDescription,
  initialAmount,
  isEditing,
  onSave,
  onCancel,
}: {
  currency: string;
  initialDescription: string;
  initialAmount: string;
  isEditing: boolean;
  onSave: (description: string, amount: string) => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState(initialDescription);
  const [amount, setAmount] = useState(initialAmount);
  const [errors, setErrors] = useState<{ description?: string; amount?: string }>({});

  const submit = () => {
    const next: typeof errors = {};
    if (!description.trim()) next.description = "Name this cost (e.g. Transportation)";
    if (toMinor(amount) <= BigInt(0)) next.amount = "Enter an amount";
    setErrors(next);
    if (Object.keys(next).length) return;
    onSave(description.trim(), amount);
  };

  return (
    <div className="space-y-4">
      <AppInput
        label="Cost description"
        isRequired
        autoFocus={!initialDescription}
        placeholder="e.g. Transportation, Waybill, Offloading"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        errorMessage={errors.description}
      />
      <MoneyInput
        label="Amount"
        isRequired
        currency={currency}
        exponent={EXPONENT}
        placeholder="0.00"
        value={amount}
        onValueChange={setAmount}
        errorMessage={errors.amount}
      />
      <div className="flex gap-2 pt-2">
        <AppButton variant="ghost" label="Back" className="flex-1" onPress={onCancel} />
        <AppButton label={isEditing ? "Update cost" : "Add cost"} className="flex-[2]" onPress={submit} />
      </div>
    </div>
  );
}

const MODE_CONFIG: Record<
  ProcurementFlowMode,
  {
    title: string;
    description?: string;
    back: { href: string; label: string };
    steps: { label: string; description?: string }[];
    submitLabel: string;
  }
> = {
  purchase: {
    title: "Record a purchase",
    description: "Record what you bought and paid.",
    back: { href: "/purchases", label: "Purchases" },
    steps: [
      { label: "Supplier & items" },
      { label: "Costs & payment" },
    ],
    submitLabel: "Save purchase",
  },
  receipt: {
    title: "Procure goods",
    description: "Receive goods and update your stock.",
    back: { href: "/procurement", label: "Procurement" },
    steps: [
      { label: "Goods & supplier" },
      { label: "Costs & payment" },
    ],
    submitLabel: "Save receipt",
  },
  order: {
    title: "New purchase order",
    description: "Send an order to your supplier.",
    back: { href: "/purchase-orders", label: "Purchase orders" },
    steps: [
      { label: "Supplier & items" },
      { label: "Delivery & terms" },
    ],
    submitLabel: "Create purchase order",
  },
  request: {
    title: "New purchase request",
    description: "Ask for items to be bought.",
    back: { href: "/purchase-requests", label: "Requests" },
    steps: [
      { label: "Items & supplier" },
      { label: "Priority & reason" },
    ],
    submitLabel: "Save request",
  },
  bill: {
    title: "Record supplier bill",
    description: "Record an invoice from your supplier.",
    back: { href: "/bills", label: "Supplier bills" },
    steps: [
      { label: "Supplier & bill items" },
      { label: "Costs & payment" },
    ],
    submitLabel: "Save supplier bill",
  },
};

function ProcurementFlowInner({ workspaceId, currency, mode }: WorkspaceInfo & { mode: ProcurementFlowMode }) {
  const config = MODE_CONFIG[mode];
  const router = useRouter();
  const searchParams = useSearchParams();

  const sourceRequestId = Number(searchParams.get("requestId") || "0");
  const sourcePoId = Number(searchParams.get("poId") || "0");
  const sourceReceiptId = Number(searchParams.get("receiptId") || "0");
  const sourceBillId = Number(searchParams.get("billId") || "0");
  const savedReceiptRef = useRef<{ id: number } | null>(null);
  const savedBillRef = useRef<{ id: number; version: number; total_minor: string; status: string } | null>(null);

  const [step, setStep] = useState(1);
  const [party, setParty] = useState<ContactValue | null>(null);
  const [date, setDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [neededBy, setNeededBy] = useState("");
  const [priority, setPriority] = useState<PriorityLevel>("normal");
  const [reason, setReason] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [issueImmediately, setIssueImmediately] = useState(true);
  const [categoryId, setCategoryId] = useState("");
  const [outletId, setOutletId] = useState("");
  const [reference, setReference] = useState("");
  const [deliveryReference, setDeliveryReference] = useState("");
  const [notes, setNotes] = useState("");
  const [amount, setAmount] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [poLineMap, setPoLineMap] = useState<Record<number, number>>({});
  const [receiptLineMap, setReceiptLineMap] = useState<Record<number, number>>({});
  const [otherCosts, setOtherCosts] = useState<OtherCostItem[]>([]);
  const [costTreatment, setCostTreatment] = useState<CostTreatment>("divide");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(mode === "bill" ? "unpaid" : "paid");
  const [accountId, setAccountId] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  const outlets = useOutlets(workspaceId);
  const suppliers = useContacts(workspaceId, "suppliers");
  const activeOutlets = (outlets.data ?? []).filter((o) => o.is_active !== false);
  const defaultOutletId = activeOutlets.find((o) => o.is_default)?.id ?? activeOutlets[0]?.id;

  const sourceRequest = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "purchase-request", sourceRequestId],
    queryFn: () => financeApi.getPurchaseRequest(workspaceId, sourceRequestId),
    enabled: sourceRequestId > 0,
  });

  const sourcePo = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "purchase-order", sourcePoId],
    queryFn: () => financeApi.getPurchaseOrder(workspaceId, sourcePoId),
    enabled: sourcePoId > 0,
  });

  const sourceReceipt = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "goods-receipt", sourceReceiptId],
    queryFn: () => financeApi.getGoodsReceipt(workspaceId, sourceReceiptId),
    enabled: sourceReceiptId > 0,
  });

  const sourceBill = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "supplier-bill", sourceBillId],
    queryFn: () => financeApi.getSupplierBill(workspaceId, sourceBillId),
    enabled: sourceBillId > 0,
  });

  // Pre-fill form when converting from Request -> PO / Receipt, PO -> Receipt / Bill, or Receipt -> Bill
  useEffect(() => {
    if (prefilled) return;

    if (sourceRequestId > 0 && sourceRequest.data) {
      const req = sourceRequest.data;
      if (req.supplier_id && suppliers.data) {
        const sup = suppliers.data.find((s) => s.id === req.supplier_id);
        if (sup) setParty({ id: String(sup.id), name: sup.name, description: sup.phone || sup.email || undefined });
      }
      if (req.reason && !notes) setNotes(req.reason);
      if (req.reference && !reference) setReference(req.reference);
      if (req.needed_by && !expectedDate) setExpectedDate(req.needed_by);
      if (req.lines?.length) {
        setItems(
          req.lines.map((l) => ({
            description: l.description,
            quantity: String(Math.max(1, Math.round(Number(l.quantity)))),
            unit_price: minorToMajor(l.estimated_unit_price_minor, req.currency_exponent) || "0",
            product_id: l.product_id ?? undefined,
            tracks_stock: Boolean(l.product_id),
          })),
        );
      }
      setPrefilled(true);
    } else if (sourcePoId > 0 && sourcePo.data) {
      const po = sourcePo.data;
      if (po.supplier_id && suppliers.data) {
        const sup = suppliers.data.find((s) => s.id === po.supplier_id);
        if (sup) setParty({ id: String(sup.id), name: sup.name, description: sup.phone || sup.email || undefined });
      }
      if (po.outlet_id) setOutletId(String(po.outlet_id));
      if (po.order_number && !reference) setReference(po.order_number);
      if (po.notes && !notes) setNotes(po.notes);
      if (po.lines?.length) {
        const lineIds: Record<number, number> = {};
        setItems(
          po.lines.map((l, idx) => {
            lineIds[idx] = l.id;
            return {
              description: l.description,
              quantity: String(Math.max(1, Math.round(Number(l.quantity)))),
              unit_price: minorToMajor(l.expected_unit_cost_minor, po.currency_exponent) || "0",
              product_id: l.product_id ?? undefined,
              tracks_stock: Boolean(l.product_id),
            };
          }),
        );
        setPoLineMap(lineIds);
      }
      setPrefilled(true);
    } else if (sourceReceiptId > 0 && sourceReceipt.data) {
      const rec = sourceReceipt.data;
      if (rec.supplier_id && suppliers.data) {
        const sup = suppliers.data.find((s) => s.id === rec.supplier_id);
        if (sup) setParty({ id: String(sup.id), name: sup.name, description: sup.phone || sup.email || undefined });
      }
      if (rec.location_id) setOutletId(String(rec.location_id));
      if (rec.receipt_reference && !reference) setReference(rec.receipt_reference);
      if (rec.lines?.length) {
        const lineIds: Record<number, number> = {};
        setItems(
          rec.lines.map((l, idx) => {
            lineIds[idx] = l.id;
            return {
              description: l.description,
              quantity: String(Math.max(1, Math.round(Number(l.accepted_quantity)))),
              unit_price: minorToMajor(l.effective_unit_cost_minor || l.actual_unit_cost_minor || l.unit_cost_minor, rec.currency_exponent ?? 2) || "0",
              product_id: l.product_id ?? undefined,
              tracks_stock: Boolean(l.product_id),
            };
          }),
        );
        setReceiptLineMap(lineIds);
      }
      setPrefilled(true);
    } else if (sourceBillId > 0 && sourceBill.data) {
      const bill = sourceBill.data;
      if (bill.supplier_id && suppliers.data) {
        const sup = suppliers.data.find((s) => s.id === bill.supplier_id);
        if (sup) setParty({ id: String(sup.id), name: sup.name, description: sup.phone || sup.email || undefined });
      }
      if (bill.outlet_id) setOutletId(String(bill.outlet_id));
      if (bill.supplier_invoice_number && !reference) setReference(bill.supplier_invoice_number);
      if (bill.lines?.length) {
        setItems(
          bill.lines.map((l) => ({
            description: l.description,
            quantity: String(Math.max(1, Math.round(Number(l.quantity)))),
            unit_price: minorToMajor(l.unit_cost_minor, bill.currency_exponent ?? 2) || "0",
            tracks_stock: false,
          })),
        );
      }
      // Since the bill already exists, default receipt to "receipt_only" so we don't create a duplicate bill
      if (mode === "receipt") {
        setPaymentStatus("receipt_only");
      }
      setPrefilled(true);
    }
  }, [
    prefilled,
    sourceRequestId,
    sourceRequest.data,
    sourcePoId,
    sourcePo.data,
    sourceReceiptId,
    sourceReceipt.data,
    sourceBillId,
    sourceBill.data,
    mode,
    suppliers.data,
    notes,
    reference,
    expectedDate,
  ]);

  const show = (minor: bigint) => formatMinorAmount(minor.toString(), currency, EXPONENT);
  const itemsSubtotalMinor = items.length ? items.reduce((sum, line) => sum + lineTotal(line), BigInt(0)) : toMinor(amount);
  const extraCostsMinor = otherCosts.reduce((sum, cost) => sum + toMinor(cost.amount), BigInt(0));
  const totalMinor = itemsSubtotalMinor + extraCostsMinor;
  const paidNowMinor =
    paymentStatus === "paid"
      ? totalMinor
      : paymentStatus === "part"
        ? toMinor(paidAmount)
        : BigInt(0);
  const balanceMinor = totalMinor - paidNowMinor > BigInt(0) ? totalMinor - paidNowMinor : BigInt(0);

  const validateStep = (which: number): Record<string, string> => {
    const next: Record<string, string> = {};
    if (which === 1) {
      if ((mode === "order" || mode === "bill") && !party) {
        next.party = "Choose or add a supplier";
      }
      if (mode === "purchase" || mode === "bill") {
        if (itemsSubtotalMinor <= BigInt(0)) {
          next.items = items.length ? "Give your items a price" : "Add items, or enter an amount greater than zero";
        }
      } else {
        if (items.length === 0) next.items = "Add at least one item";
        else if (itemsSubtotalMinor <= BigInt(0)) next.items = "Give each item a unit price";
      }
      if ((mode === "purchase" || mode === "receipt" || mode === "bill") && !date) {
        next.date = "Choose a date";
      }
    }
    if (which === 2) {
      if (mode === "request" && !reason.trim()) {
        next.reason = "Tell us why this is needed";
      }
      if (mode === "purchase" || mode === "receipt" || mode === "bill") {
        if ((paymentStatus === "paid" || paymentStatus === "part") && !accountId) {
          next.account = "Choose the account the money was paid from";
        }
        if (paymentStatus === "part") {
          const part = toMinor(paidAmount);
          if (part <= BigInt(0)) next.paid = "Enter how much was paid";
          else if (part >= totalMinor) next.paid = "For the full amount, choose “Paid in full”";
        }
        if (mode === "receipt" && paymentStatus !== "receipt_only" && !party) {
          next.party = "Choose a supplier in Step 1 to record a bill or payment, or select “Receipt only”";
        }
      }
    }
    return next;
  };

  const goTo = (target: number) => {
    if (target > step) {
      const found = validateStep(1);
      if (Object.keys(found).length) {
        setErrors(found);
        setStep(1);
        return;
      }
    }
    setErrors({});
    setStep(target);
    if (typeof window !== "undefined") document.querySelector("main")?.parentElement?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveAction = useFinanceAction(
    workspaceId,
    async (_: void, key: string) => {
      const chosenOutletId = outletId ? Number(outletId) : defaultOutletId;
      const supplierId = party ? Number(party.id) : undefined;
      const allocations = allocateCostsAcrossLines(items, costTreatment === "divide" ? extraCostsMinor : BigInt(0));
      const extraCostSummary = otherCosts.length
        ? `Extra costs: ${otherCosts.map((c) => `${c.description} (${show(toMinor(c.amount))})`).join(", ")}`
        : "";
      const combinedNotes = [notes.trim(), extraCostSummary].filter(Boolean).join(" · ");

      if (mode === "request") {
        const res = await financeApi.createPurchaseRequest(
          workspaceId,
          {
            supplier_id: supplierId,
            needed_by: neededBy || undefined,
            reason: reason.trim(),
            reference: reference.trim() || undefined,
            priority,
            currency,
            lines: items.map((line) => ({
              product_id: line.product_id,
              description: line.description,
              quantity: line.quantity,
              unit_name: "each",
              estimated_unit_price: line.unit_price.replace(/,/g, ""),
            })),
          },
          key,
        );
        return { redirect: `/purchase-requests/${res.request.id}` };
      }

      if (mode === "order") {
        const created = await financeApi.createDirectPurchaseOrder(
          workspaceId,
          {
            supplier_id: supplierId!,
            outlet_id: chosenOutletId,
            expected_date: expectedDate || undefined,
            payment_terms: paymentTerms.trim() || undefined,
            notes: combinedNotes || undefined,
            currency,
            lines: items.map((line, index) => ({
              product_id: line.product_id,
              description: line.description,
              quantity: line.quantity,
              unit_name: "each",
              expected_unit_cost:
                costTreatment === "divide" && allocations[index]
                  ? minorToMajor(allocations[index].effectiveUnitMinor, EXPONENT) || line.unit_price.replace(/,/g, "")
                  : line.unit_price.replace(/,/g, ""),
              discount: line.discount_amount?.replace(/,/g, "") || "0",
              tax_amount: "0",
            })),
          },
          key,
        );
        let order = created.order;
        if (issueImmediately && order.status === "draft") {
          try {
            const sub = await financeApi.advancePurchaseOrder(workspaceId, order.id, order.version, "submitted", `${key}:sub`);
            const app = await financeApi.advancePurchaseOrder(workspaceId, order.id, sub.order.version, "approved", `${key}:app`);
            const iss = await financeApi.advancePurchaseOrder(workspaceId, order.id, app.order.version, "issued", `${key}:iss`);
            order = iss.order;
          } catch {
            // If user lacks approve/issue permission, leave in highest reached state
          }
        }
        return { redirect: `/purchase-orders/${order.id}` };
      }

      if (mode === "receipt") {
        const runKey = createIdempotencyKey("receipt-flow");
        // If linked to a draft/approved PO that isn't issued yet, advance it first so it can be received
        if (sourcePoId > 0 && sourcePo.data && ["draft", "submitted", "approved"].includes(sourcePo.data.status)) {
          let cur = sourcePo.data;
          if (cur.status === "draft") {
            cur = (await financeApi.advancePurchaseOrder(workspaceId, cur.id, cur.version, "submitted", `${runKey}:po-sub`)).order;
          }
          if (cur.status === "submitted") {
            cur = (await financeApi.advancePurchaseOrder(workspaceId, cur.id, cur.version, "approved", `${runKey}:po-app`)).order;
          }
          if (cur.status === "approved") {
            await financeApi.advancePurchaseOrder(workspaceId, cur.id, cur.version, "issued", `${runKey}:po-iss`);
          }
        }

        const landedMajor = costTreatment === "divide" && extraCostsMinor > BigInt(0) ? minorToMajor(extraCostsMinor, EXPONENT) : "0";
        let createdReceipt = savedReceiptRef.current;
        if (!createdReceipt) {
          const receiptRes = await financeApi.createGoodsReceipt(
            workspaceId,
            {
              purchase_order_id: sourcePoId > 0 ? sourcePoId : undefined,
              supplier_id: supplierId,
              location_id: chosenOutletId,
              reason: combinedNotes || "Goods procurement receipt",
              currency,
              received_on: date,
              receipt_reference: reference.trim() || undefined,
              delivery_reference: deliveryReference.trim() || undefined,
              landed_cost: landedMajor || "0",
              lines: items.map((line, idx) => ({
                purchase_order_line_id: poLineMap[idx] || undefined,
                product_id: line.product_id,
                description: line.description,
                accepted_quantity: line.quantity,
                rejected_quantity: "0",
                actual_unit_cost: line.unit_price.replace(/,/g, ""),
              })),
            },
            runKey,
          );
          createdReceipt = { id: receiptRes.receipt.id };
          savedReceiptRef.current = createdReceipt;

          // If operational cost was selected and there are extra costs + supplier, record operational expense bill
          if (costTreatment === "operational" && extraCostsMinor > BigInt(0) && supplierId) {
            await financeApi.createSupplierBill(
              workspaceId,
              {
                supplier_id: supplierId,
                outlet_id: chosenOutletId,
                supplier_invoice_number: `EXP-${createdReceipt.id}-${Date.now().toString().slice(-4)}`,
                bill_date: date,
                amount: minorToMajor(extraCostsMinor, EXPONENT),
                currency,
                bill_type: "direct_expense",
                description: extraCostSummary || "Procurement operational costs",
              },
              `${runKey}:op-cost`,
            );
          }
        }

        // If user also chose to create bill / pay now
        if (paymentStatus !== "receipt_only" && supplierId) {
          let bill = savedBillRef.current;
          if (!bill) {
            const billRes = await financeApi.createSupplierBill(
              workspaceId,
              {
                goods_receipt_id: createdReceipt.id,
                supplier_id: supplierId,
                outlet_id: chosenOutletId,
                supplier_invoice_number: reference.trim() || `INV-GR-${createdReceipt.id}`,
                bill_date: date,
                due_date: dueDate || undefined,
                currency,
                description: combinedNotes || "Goods receipt supplier bill",
              },
              `${runKey}:bill`,
            );
            bill = billRes.bill;
            savedBillRef.current = bill;
          }

          if (bill.status === "draft" || bill.status === "disputed") {
            const approvedBill = await financeApi.approveSupplierBill(
              workspaceId,
              bill.id,
              bill.version,
              `${runKey}:bill-approve`,
              true,
            );
            bill = approvedBill.bill;
            savedBillRef.current = bill;
          }

          if ((paymentStatus === "paid" || paymentStatus === "part") && accountId) {
            const payMajor =
              paymentStatus === "paid"
                ? minorToMajor(bill.total_minor, EXPONENT)
                : paidAmount.replace(/,/g, "");
            if (payMajor && toMinor(payMajor) > BigInt(0)) {
              await financeApi.createPayment(
                workspaceId,
                {
                  direction: "outgoing",
                  counterparty_id: supplierId,
                  counterparty_name: party?.name,
                  payment_date: date,
                  amount: payMajor,
                  currency,
                  linked_record_type: "supplier_bill",
                  linked_record_id: bill.id,
                  reference: reference.trim() || undefined,
                  notes: combinedNotes || undefined,
                  payment_legs: [{ money_account_id: Number(accountId), amount: payMajor }],
                },
                `${runKey}:pay`,
              );
            }
          }
        }

        return { redirect: `/procurement/${createdReceipt.id}` };
      }

      if (mode === "bill") {
        const runKey = createIdempotencyKey("bill-flow");
        let bill = savedBillRef.current;
        if (!bill) {
          const billRes = await financeApi.createSupplierBill(
            workspaceId,
            sourceReceiptId > 0
              ? {
                  goods_receipt_id: sourceReceiptId,
                  supplier_id: supplierId!,
                  outlet_id: chosenOutletId,
                  supplier_invoice_number: reference.trim() || `INV-${Date.now().toString().slice(-6)}`,
                  bill_date: date,
                  due_date: dueDate || undefined,
                  currency,
                  description: combinedNotes || "Supplier bill",
                }
              : {
                  supplier_id: supplierId!,
                  outlet_id: chosenOutletId,
                  supplier_invoice_number: reference.trim() || `BILL-${Date.now().toString().slice(-6)}`,
                  bill_date: date,
                  due_date: dueDate || undefined,
                  amount: minorToMajor(totalMinor, EXPONENT),
                  currency,
                  bill_type: "direct_expense",
                  description: combinedNotes || items.map((i) => i.description).join(", ") || "Supplier bill",
                  lines:
                    items.length > 0
                      ? items.map((line, idx) => ({
                          description: line.description,
                          quantity: line.quantity,
                          unit_cost:
                            costTreatment === "divide" && allocations[idx]
                              ? minorToMajor(allocations[idx].effectiveUnitMinor, EXPONENT) || line.unit_price.replace(/,/g, "")
                              : line.unit_price.replace(/,/g, ""),
                          discount: line.discount_amount?.replace(/,/g, "") || "0",
                          tax_amount: "0",
                        }))
                      : undefined,
                },
            runKey,
          );
          bill = billRes.bill;
          savedBillRef.current = bill;
        }

        if (paymentStatus === "paid" || paymentStatus === "part") {
          if (bill.status === "draft" || bill.status === "disputed") {
            const app = await financeApi.approveSupplierBill(workspaceId, bill.id, bill.version, `${runKey}:approve`, true);
            bill = app.bill;
            savedBillRef.current = bill;
          }
          const payMajor = paymentStatus === "paid" ? minorToMajor(bill.total_minor, EXPONENT) : paidAmount.replace(/,/g, "");
          if (payMajor && toMinor(payMajor) > BigInt(0) && accountId) {
            await financeApi.createPayment(
              workspaceId,
              {
                direction: "outgoing",
                counterparty_id: supplierId,
                counterparty_name: party?.name,
                payment_date: date,
                amount: payMajor,
                currency,
                linked_record_type: "supplier_bill",
                linked_record_id: bill.id,
                reference: reference.trim() || undefined,
                payment_legs: [{ money_account_id: Number(accountId), amount: payMajor }],
              },
              `${runKey}:pay`,
            );
          }
        }
        return { redirect: `/bills/${bill.id}` };
      }

      // Default: mode === "purchase"
      const purchaseLines = items.map((line, index) => ({
        description: line.description,
        quantity: line.quantity,
        unit_price:
          costTreatment === "divide" && allocations[index]
            ? minorToMajor(allocations[index].effectiveUnitMinor, EXPONENT) || line.unit_price.replace(/,/g, "")
            : line.unit_price.replace(/,/g, ""),
        product_id: line.product_id,
        variant_id: line.variant_id,
      }));
      if (costTreatment === "operational" && otherCosts.length > 0 && items.length > 0) {
        for (const cost of otherCosts) {
          purchaseLines.push({
            description: `${cost.description} (Operational cost)`,
            quantity: "1",
            unit_price: cost.amount.replace(/,/g, ""),
            product_id: undefined,
            variant_id: undefined,
          });
        }
      }
      const legs =
        paymentStatus === "unpaid"
          ? undefined
          : [
              {
                money_account_id: Number(accountId),
                ...(paymentStatus === "part" ? { amount: paidAmount.replace(/,/g, "") } : {}),
              },
            ];

      const createdPurchase = await financeApi.createPurchase(
        workspaceId,
        {
          currency,
          supplier_id: supplierId,
          supplier_name: party?.name || "Unnamed supplier",
          purchase_date: date,
          category_id: categoryId ? Number(categoryId) : undefined,
          outlet_id: chosenOutletId,
          amount: purchaseLines.length ? undefined : minorToMajor(totalMinor, EXPONENT),
          items: purchaseLines.length ? purchaseLines : undefined,
          reference: reference.trim() || undefined,
          notes: combinedNotes || undefined,
          payment_legs: legs,
        },
        key || createIdempotencyKey("purchase"),
      );
      return { redirect: `/purchases/${createdPurchase.purchase.id}` };
    },
    {
      success:
        mode === "request"
          ? "Purchase request saved"
          : mode === "order"
            ? "Purchase order saved"
            : mode === "receipt"
              ? "Goods receipt recorded"
              : mode === "bill"
                ? "Supplier bill saved"
                : "Purchase recorded",
      onDone: (res) => {
        const target = (res as { redirect?: string })?.redirect ?? config.back.href;
        router.push(target);
      },
    },
  );

  const submit = () => {
    for (const s of [1, 2]) {
      const found = validateStep(s);
      if (Object.keys(found).length) {
        setErrors(found);
        setStep(s);
        return;
      }
    }
    saveAction.mutate();
  };

  return (
    <FormPage
      title={config.title}
      description={config.description}
      back={config.back}
      aside={
        <SummaryPanel
          rows={[
            { label: "Supplier", value: party?.name ?? "Not selected", tone: party ? "strong" : "muted" },
            ...(mode === "request"
              ? [
                  { label: "Priority", value: priority.toUpperCase(), tone: priority === "urgent" ? ("negative" as const) : ("strong" as const) },
                  { label: "Needed by", value: neededBy ? formatDate(neededBy) : "Flexible" },
                ]
              : [{ label: "Date", value: date ? formatDate(date) : "—" }]),
            { label: "Items subtotal", value: show(itemsSubtotalMinor) },
            ...(extraCostsMinor > BigInt(0)
              ? [
                  {
                    label: `Extra costs (${costTreatment === "divide" ? "Landed" : "Operational"})`,
                    value: show(extraCostsMinor),
                  },
                ]
              : []),
            ...(mode === "purchase" || mode === "receipt" || mode === "bill"
              ? [
                  { label: "Paid now", value: show(paidNowMinor), tone: paidNowMinor > BigInt(0) ? ("positive" as const) : ("muted" as const) },
                  { label: "Still to pay", value: show(balanceMinor), tone: balanceMinor > BigInt(0) ? ("negative" as const) : ("muted" as const) },
                ]
              : []),
          ]}
          total={{ label: mode === "request" ? "Estimated total" : "Total", value: show(totalMinor) }}
          note={
            sourceRequestId > 0
              ? `Converted from Request #${sourceRequestId}`
              : sourcePoId > 0
                ? `Converted from Purchase Order #${sourcePoId}`
                : sourceReceiptId > 0
                  ? `Converted from Receipt #${sourceReceiptId}`
                  : sourceBillId > 0
                    ? `Converted from Bill #${sourceBillId}`
                    : undefined
          }
        />
      }
      actions={
        <>
          {step > 1 ? (
            <AppButton variant="ghost" startContent={<ArrowLeft size={16} />} label="Back" onPress={() => goTo(step - 1)} className="mr-auto" />
          ) : (
            <Link
              href={config.back.href}
              className="mr-auto inline-flex h-10 items-center rounded-full px-5 text-[14px] font-medium text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
            >
              Cancel
            </Link>
          )}
          {step < 2 ? (
            <AppButton endContent={<ArrowRight size={16} />} label="Next" onPress={() => goTo(2)} className="min-w-28" />
          ) : (
            <AppButton label={config.submitLabel} isLoading={saveAction.isPending} onPress={submit} className="min-w-36" />
          )}
        </>
      }
    >
      <StepNav steps={config.steps} current={step} onStep={goTo} />

      {step === 1 ? (
        <div className="animate-fade-up space-y-4">
          <FormSection
            title={mode === "request" ? "Suggested supplier" : "Supplier & details"}
            description={mode === "request" ? "Optional supplier for these items." : "Choose who supplied these items."}
          >
            <ContactPicker
              workspaceId={workspaceId}
              kind="suppliers"
              value={party}
              onChange={(val) => {
                setParty(val);
                if (errors.party) setErrors({ ...errors, party: undefined });
              }}
              error={errors.party}
            />

            {mode !== "request" ? (
              <FormGrid>
                {mode === "order" ? (
                  <AppInput
                    label="Expected delivery date"
                    type="date"
                    value={expectedDate}
                    startContent={<CalendarBlank />}
                    onChange={(e) => setExpectedDate(e.target.value)}
                  />
                ) : (
                  <AppInput
                    label={mode === "receipt" ? "Date received" : mode === "bill" ? "Bill date" : "Purchase date"}
                    type="date"
                    isRequired
                    value={date}
                    startContent={<CalendarBlank />}
                    onChange={(e) => {
                      setDate(e.target.value);
                      if (errors.date) setErrors({ ...errors, date: undefined });
                    }}
                    errorMessage={errors.date}
                  />
                )}

                {mode === "purchase" ? (
                  <CategoryPicker workspaceId={workspaceId} direction="money_out" value={categoryId} onChange={setCategoryId} />
                ) : mode === "bill" ? (
                  <AppInput
                    label="Due date"
                    type="date"
                    value={dueDate}
                    startContent={<CalendarBlank />}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                ) : activeOutlets.length > 0 ? (
                  <AppSelect
                    label={mode === "receipt" ? "Received at (Outlet)" : "Deliver to (Outlet)"}
                    placeholder="Main outlet"
                    options={activeOutlets.map((o) => ({ key: String(o.id), label: o.is_default ? `${o.name} (main)` : o.name }))}
                    selectedKey={outletId || String(defaultOutletId ?? "")}
                    onSelectionChange={setOutletId}
                  />
                ) : null}
              </FormGrid>
            ) : null}

            {mode === "receipt" || mode === "bill" ? (
              <FormGrid>
                <AppInput
                  label={mode === "bill" ? "Supplier invoice number" : "Receipt / Invoice reference"}
                  placeholder={mode === "bill" ? "e.g. INV-2041" : "Optional receipt number"}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
                {mode === "receipt" ? (
                  <AppInput
                    label="Waybill / Delivery note"
                    placeholder="Optional delivery reference"
                    value={deliveryReference}
                    onChange={(e) => setDeliveryReference(e.target.value)}
                  />
                ) : null}
              </FormGrid>
            ) : null}
          </FormSection>

          <FormSection
            title={
              mode === "request"
                ? "Items needed"
                : mode === "order"
                  ? "Order items"
                  : mode === "receipt"
                    ? "Goods received"
                    : "Items bought"
            }
            description="Pick products or add custom items."
          >
            <LineItemsField
              workspaceId={workspaceId}
              currency={currency}
              context="purchase"
              items={items}
              onAdd={(line) => {
                setItems([...items, line]);
                if (errors.items) setErrors({ ...errors, items: undefined });
              }}
              onUpdate={(index, line) => setItems(items.map((cur, at) => (at === index ? line : cur)))}
              onRemove={(index) => setItems(items.filter((_, at) => at !== index))}
              error={errors.items}
            />

            {(mode === "purchase" || mode === "bill") && items.length === 0 ? (
              <MoneyInput
                label="Or enter the total amount directly"
                size="lg"
                currency={currency}
                exponent={EXPONENT}
                placeholder="0.00"
                value={amount}
                onValueChange={(value) => {
                  setAmount(value);
                  if (errors.items) setErrors({ ...errors, items: undefined });
                }}
                errorMessage={errors.items}
              />
            ) : null}
          </FormSection>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="animate-fade-up space-y-4">
          {mode === "request" ? (
            <FormSection
              title="Priority & reason"
              description="Urgency, date needed and reason."
            >
              <ChoiceCards<PriorityLevel>
                label="Priority"
                value={priority}
                onChange={setPriority}
                options={[
                  { key: "normal", label: "Normal", description: "Standard restock", icon: Flag },
                  { key: "high", label: "High", description: "Needed soon", icon: Clock },
                  { key: "urgent", label: "Urgent", description: "Blocking work", icon: Fire },
                ]}
              />
              <FormGrid>
                <AppInput
                  label="Needed by"
                  type="date"
                  value={neededBy}
                  startContent={<CalendarBlank />}
                  onChange={(e) => setNeededBy(e.target.value)}
                />
                <AppInput
                  label="Reference"
                  placeholder="Optional project or department ref"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </FormGrid>
              <AppTextarea
                label="Why is this needed?"
                isRequired
                placeholder="e.g. Restock popular sizes before weekend orders"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (errors.reason) setErrors({ ...errors, reason: undefined });
                }}
                errorMessage={errors.reason}
              />
            </FormSection>
          ) : null}

          {mode !== "request" ? (
            <FormSection
              title="Extra costs"
              description="Transport, shipping or handling fees."
            >
              <OtherCostsEditor
                currency={currency}
                costs={otherCosts}
                onChange={setOtherCosts}
                treatment={costTreatment}
                onTreatmentChange={setCostTreatment}
                items={items}
                showTreatmentChoice={mode === "purchase" || mode === "receipt" || mode === "order"}
              />
            </FormSection>
          ) : null}

          {mode === "order" ? (
            <FormSection title="Delivery & terms" description="Delivery date and order terms.">
              <FormGrid>
                <AppInput
                  label="Payment terms"
                  placeholder="e.g. Pay on delivery, Net 30"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                />
                <AppInput
                  label="Expected delivery date"
                  type="date"
                  value={expectedDate}
                  startContent={<CalendarBlank />}
                  onChange={(e) => setExpectedDate(e.target.value)}
                />
              </FormGrid>
              <ChoiceCards<"issue" | "draft">
                label="Order status"
                value={issueImmediately ? "issue" : "draft"}
                onChange={(v) => setIssueImmediately(v === "issue")}
                options={[
                  {
                    key: "issue",
                    label: "Issue now",
                    description: "Ready to receive",
                    icon: CheckCircle,
                  },
                  {
                    key: "draft",
                    label: "Save as draft",
                    description: "Edit later",
                    icon: Clock,
                  },
                ]}
              />
              <AppTextarea
                label="Notes for supplier"
                placeholder="Delivery instructions or order notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </FormSection>
          ) : null}

          {mode === "purchase" || mode === "receipt" || mode === "bill" ? (
            <FormSection title="Payment" description="How and when you paid.">
              <ChoiceCards<PaymentStatus>
                label="Payment status"
                value={paymentStatus}
                onChange={(val) => {
                  setPaymentStatus(val);
                  setErrors({ ...errors, account: undefined, paid: undefined, party: undefined });
                }}
                options={[
                  { key: "paid", label: "Paid in full", description: "Settled today", icon: CheckCircle },
                  { key: "part", label: "Part paid", description: "Some now, the rest later", icon: HandCoins },
                  {
                    key: "unpaid",
                    label: mode === "receipt" ? "Pay later" : "Not paid yet",
                    description: "Owe in full",
                    icon: Clock,
                  },
                  ...(mode === "receipt"
                    ? [
                        {
                          key: "receipt_only" as const,
                          label: "Receipt only",
                          description: "Bill later",
                          icon: Receipt,
                        },
                      ]
                    : []),
                ]}
              />

              {errors.party ? <p className="animate-fade-up text-[12px] font-medium text-danger">{errors.party}</p> : null}

              {paymentStatus === "paid" || paymentStatus === "part" ? (
                <div className="animate-fade-up">
                  <FormGrid>
                    <AccountPicker
                      workspaceId={workspaceId}
                      label="Paid from"
                      currency={currency}
                      value={accountId}
                      onChange={(id) => {
                        setAccountId(id);
                        if (errors.account) setErrors({ ...errors, account: undefined });
                      }}
                      error={errors.account}
                      isRequired
                    />
                    {paymentStatus === "part" ? (
                      <MoneyInput
                        label="Amount paid now"
                        isRequired
                        currency={currency}
                        exponent={EXPONENT}
                        placeholder="0.00"
                        value={paidAmount}
                        onValueChange={(value) => {
                          setPaidAmount(value);
                          if (errors.paid) setErrors({ ...errors, paid: undefined });
                        }}
                        errorMessage={errors.paid}
                      />
                    ) : null}
                  </FormGrid>
                </div>
              ) : null}

              <FormGrid>
                <AppInput
                  label="Reference"
                  placeholder="Receipt or invoice number"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
                <AppInput
                  label="Notes"
                  placeholder="Anything worth remembering"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </FormGrid>
            </FormSection>
          ) : null}
        </div>
      ) : null}
    </FormPage>
  );
}

export function ProcurementFlowForm({ mode }: { mode: ProcurementFlowMode }) {
  return <WorkspaceGate businessOnly>{(workspace) => <ProcurementFlowInner {...workspace} mode={mode} />}</WorkspaceGate>;
}
