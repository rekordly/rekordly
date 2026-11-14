"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  ArrowsClockwise,
  ArrowUUpLeft,
  ChatCircleDots,
  CheckCircle,
  ClockCounterClockwise,
  Copy,
  CreditCard,
  Envelope,
  FilePlus,
  FileText,
  HandCoins,
  PaperPlaneTilt,
  Plus,
  Prohibit,
  ShareNetwork,
  Trash,
  Wallet,
  WhatsappLogo,
  XCircle,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";

import { AppButton } from "@/components/ui/app-button";
import { AppRowActions } from "@/components/ui/app-row-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader, StatusPill } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { toast } from "@heroui/react";
import { formatDate } from "@/lib/format";
import { financeApi, formatMinorAmount } from "@/lib/money";
import {
  estimateSchema,
  invoiceSchema,
  salesReturnSchema,
  walletPaymentSchema,
  type EstimateValues,
  type InvoiceValues,
  type SalesReturnValues,
  type WalletPaymentValues,
} from "@/lib/schemas/finance.schemas";
import type { DebitNote, DocumentVersion, Estimate, ExternalMessage, ExternalPaymentEvidence, Invoice, InvoiceLineItem, SalesReturn } from "@/types/finance";

import { MoneyField, NotesField, TextInputField } from "./fields";
import { PaymentDrawer, type PaymentPreset } from "./payment-drawer";
import { money, StatusBadge, today, daysFromToday, useContacts, useFinanceAction, useRecords, WorkspaceGate, type WorkspaceInfo } from "./shared";
import { DocumentReview } from "./document-review";
import { ContactField, LineItemsField } from "@/components/pickers";
import { PageStats } from "./page-stats";

type PendingAction =
  | { kind: "finalize"; invoice: Invoice }
  | { kind: "void"; invoice: Invoice }
  | { kind: "wallet"; invoice: Invoice }
  | { kind: "apply_credit"; invoice: Invoice; availableMinor: number }
  | { kind: "convert_proforma"; invoice: Invoice }
  | { kind: "convert_estimate"; estimate: Estimate };


function computePreviewTax(
  taxLines: Array<{ name: string; rate_percent: string; is_compound: boolean }> | undefined,
  flatTax: number,
  taxableBase: number,
): number {
  if (!taxLines || taxLines.length === 0) return flatTax;
  const base = Math.max(0, taxableBase);
  let nonCompound = 0;
  for (const tl of taxLines) {
    if (!tl.is_compound) {
      const pct = parseFloat(tl.rate_percent || "0") || 0;
      nonCompound += (base * pct) / 100;
    }
  }
  let compBase = base + nonCompound;
  let total = nonCompound;
  for (const tl of taxLines) {
    if (tl.is_compound) {
      const pct = parseFloat(tl.rate_percent || "0") || 0;
      const amt = (compBase * pct) / 100;
      compBase += amt;
      total += amt;
    }
  }
  return total;
}

const INVOICE_STEPS = [
  { step: 1, title: "Items & Pricing", description: "What are you billing for?" },
  { step: 2, title: "Customer & Terms", description: "Who is this invoice for?" },
  { step: 3, title: "Review & Draft", description: "Review totals and save draft" },
] as const;

const ESTIMATE_STEPS = [
  { step: 1, title: "Quote Items", description: "Products and services in this quotation" },
  { step: 2, title: "Customer & Expiry", description: "Who is this quote for and when does it expire?" },
  { step: 3, title: "Review & Save", description: "Review quotation totals and save draft" },
] as const;

function InvoicesContent({ workspaceId, currency, startOpen }: WorkspaceInfo & { startOpen: boolean }) {
  const [activeTab, setActiveTab] = useState<"invoices" | "estimates" | "returns" | "debit-notes">("invoices");

  // Invoices state
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(startOpen);
  const [invoiceStep, setInvoiceStep] = useState<1 | 2 | 3>(1);
  const invoices = useRecords<Invoice>("invoices", workspaceId);

  // Estimates state
  const [isEstimateOpen, setIsEstimateOpen] = useState(false);
  const [estimateStep, setEstimateStep] = useState<1 | 2 | 3>(1);
  const estimates = useRecords<Estimate>("estimates", workspaceId);

  // Sales Returns / Credit Notes list
  const salesReturns = useQuery({
    queryKey: ["money", workspaceId, "sales-returns"],
    queryFn: () => financeApi.listSalesReturns(workspaceId),
  });

  // Debit Notes state
  const debitNotesQuery = useQuery({
    queryKey: ["money", workspaceId, "debit-notes"],
    queryFn: () => financeApi.listDebitNotes(workspaceId),
  });
  const [isDebitNoteOpen, setIsDebitNoteOpen] = useState(false);
  const [dnCustomerId, setDnCustomerId] = useState("");
  const [dnInvoiceId, setDnInvoiceId] = useState("");
  const [dnDate, setDnDate] = useState(today());
  const [dnReason, setDnReason] = useState("");
  const [dnDesc, setDnDesc] = useState("");
  const [dnAmount, setDnAmount] = useState("");
  const [dnSaving, setDnSaving] = useState(false);

  // Version history + Portal Evidence & Messages drawer
  const [inspectTarget, setInspectTarget] = useState<{ kind: "invoice" | "estimate"; id: number; number: string; currency: string; exp: number } | null>(null);
  const [inspectVersions, setInspectVersions] = useState<DocumentVersion[]>([]);
  const [inspectEvidences, setInspectEvidences] = useState<ExternalPaymentEvidence[]>([]);
  const [inspectMessages, setInspectMessages] = useState<ExternalMessage[]>([]);
  const [teamReply, setTeamReply] = useState("");
  const [replySending, setReplySending] = useState(false);

  const openInspector = async (kind: "invoice" | "estimate", row: Invoice | Estimate) => {
    const number = "invoice_number" in row ? row.invoice_number : row.estimate_number;
    const docType = "invoice_number" in row ? (row.document_kind || "invoice") : "estimate";
    setInspectTarget({ kind, id: row.id, number, currency: row.currency, exp: row.currency_exponent ?? 2 });
    const [vers, evs, msgs] = await Promise.all([
      financeApi.listDocumentVersions(workspaceId, docType, row.id).catch(() => []),
      kind === "invoice" ? financeApi.listDocumentEvidences(workspaceId, "invoice", row.id).catch(() => []) : Promise.resolve([]),
      financeApi.listTeamDocumentMessages(workspaceId, kind, row.id).catch(() => []),
    ]);
    setInspectVersions(vers);
    setInspectEvidences(evs);
    setInspectMessages(msgs);
  };

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [payment, setPayment] = useState<PaymentPreset | undefined>();
  const customers = useContacts(workspaceId, "customers");

  // Share state (Invoice or Estimate)
  const [shareTarget, setShareTarget] = useState<{
    kind: "invoice" | "estimate";
    number: string;
    customerName: string;
    totalMinor: number | string;
    currency: string;
    currencyExponent: number;
  } | null>(null);
  const [shareData, setShareData] = useState<{ share_url: string; token: string; expires_at: string } | null>(null);
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  // Sales Return / Credit Note state
  const [returnInvoice, setReturnInvoice] = useState<Invoice | null>(null);
  const [isReturnOpen, setIsReturnOpen] = useState(false);

  const handleOpenShare = async (inv: Invoice) => {
    try {
      const res = await financeApi.createInvoiceShare(workspaceId, inv.id);
      setShareData(res);
      setShareTarget({
        kind: "invoice",
        number: inv.invoice_number,
        customerName: inv.customer_name,
        totalMinor: inv.total_amount_minor,
        currency: inv.currency,
        currencyExponent: inv.currency_exponent ?? 2,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create share link";
      toast.danger(msg);
    }
  };

  const handleOpenEstimateShare = async (est: Estimate) => {
    try {
      const res = await financeApi.createEstimateShare(workspaceId, est.id, 30, true);
      setShareData(res);
      setShareTarget({
        kind: "estimate",
        number: est.estimate_number,
        customerName: est.customer_name,
        totalMinor: est.total_amount_minor,
        currency: est.currency,
        currencyExponent: est.currency_exponent ?? 2,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create quotation share link";
      toast.danger(msg);
    }
  };

  const handleCopyShareLink = () => {
    if (!shareData) return;
    const fullUrl = `${window.location.origin}${shareData.share_url}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedShareLink(true);
    setTimeout(() => setCopiedShareLink(false), 2000);
  };

  // Inline custom customer creation states
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [isCreatingCustomerInline, setIsCreatingCustomerInline] = useState(false);

  // Invoice Form
  const invoiceForm = useForm<InvoiceValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      customer_id: "",
      document_kind: "invoice",
      issue_date: today(),
      // Matches the default terms: payment is due within 14 days.
      due_date: daysFromToday(14),
      tax_amount: "",
      discount_amount: "",
      delivery_fee_amount: "",
      notes: "",
      terms: "Payment is due within 14 days of invoice date.",
      tax_lines: [],
      items: [],
    },
    mode: "onChange",
  });
  const invoiceItems = useFieldArray({ control: invoiceForm.control, name: "items" });
  const invoiceTaxLines = useFieldArray({ control: invoiceForm.control, name: "tax_lines" });

  // Estimate Form
  const estimateForm = useForm<EstimateValues>({
    resolver: zodResolver(estimateSchema),
    defaultValues: {
      customer_id: "",
      issue_date: today(),
      expiry_date: today(),
      tax_amount: "",
      discount_amount: "",
      delivery_fee_amount: "",
      notes: "This quotation is valid for 14 days from issue date.",
      terms: "Standard commercial delivery terms apply.",
      tax_lines: [],
      items: [],
    },
    mode: "onChange",
  });
  const estimateItems = useFieldArray({ control: estimateForm.control, name: "items" });
  const estimateTaxLines = useFieldArray({ control: estimateForm.control, name: "tax_lines" });

  // Sales Return Form
  const returnForm = useForm<SalesReturnValues>({
    resolver: zodResolver(salesReturnSchema),
    defaultValues: {
      return_date: today(),
      reason: "",
      action_taken: "customer_credit",
      tax_amount: "",
      items: [],
    },
    mode: "onChange",
  });
  const returnItems = useFieldArray({ control: returnForm.control, name: "items" });

  const walletForm = useForm<WalletPaymentValues>({ resolver: zodResolver(walletPaymentSchema), defaultValues: { amount: "" } });

  // Watched invoice values
  const watchedInvItems = invoiceForm.watch("items");
  const watchedInvTaxLines = invoiceForm.watch("tax_lines");
  const watchedInvTax = invoiceForm.watch("tax_amount");
  const watchedInvDiscount = invoiceForm.watch("discount_amount");
  const watchedInvDelivery = invoiceForm.watch("delivery_fee_amount");
  const watchedInvCustomerId = invoiceForm.watch("customer_id");
  const watchedInvIssueDate = invoiceForm.watch("issue_date");
  const watchedInvDueDate = invoiceForm.watch("due_date");
  const watchedInvTerms = invoiceForm.watch("terms");
  const watchedInvKind = invoiceForm.watch("document_kind") ?? "invoice";

  const invSubtotal = useMemo(() => {
    return (watchedInvItems ?? []).reduce((acc, it) => {
      const q = parseFloat(it.quantity || "0");
      const p = parseFloat(it.unit_price || "0");
      const d = parseFloat(it.discount_amount || "0") || 0;
      return acc + (isNaN(q) || isNaN(p) ? 0 : Math.max(0, q * p - d));
    }, 0);
  }, [watchedInvItems]);
  const invDiscount = parseFloat(watchedInvDiscount || "0") || 0;
  const invTax = computePreviewTax(watchedInvTaxLines, parseFloat(watchedInvTax || "0") || 0, invSubtotal - invDiscount);
  const invDelivery = parseFloat(watchedInvDelivery || "0") || 0;
  const invTotal = Math.max(0, invSubtotal - invDiscount + invTax + invDelivery);

  // Watched estimate values
  const watchedEstItems = estimateForm.watch("items");
  const watchedEstTaxLines = estimateForm.watch("tax_lines");
  const watchedEstTax = estimateForm.watch("tax_amount");
  const watchedEstDiscount = estimateForm.watch("discount_amount");
  const watchedEstDelivery = estimateForm.watch("delivery_fee_amount");
  const watchedEstCustomerId = estimateForm.watch("customer_id");
  const watchedEstIssueDate = estimateForm.watch("issue_date");
  const watchedEstExpiryDate = estimateForm.watch("expiry_date");
  const watchedEstTerms = estimateForm.watch("terms");

  const estSubtotal = useMemo(() => {
    return (watchedEstItems ?? []).reduce((acc, it) => {
      const q = parseFloat(it.quantity || "0");
      const p = parseFloat(it.unit_price || "0");
      const d = parseFloat(it.discount_amount || "0") || 0;
      return acc + (isNaN(q) || isNaN(p) ? 0 : Math.max(0, q * p - d));
    }, 0);
  }, [watchedEstItems]);
  const estDiscount = parseFloat(watchedEstDiscount || "0") || 0;
  const estTax = computePreviewTax(watchedEstTaxLines, parseFloat(watchedEstTax || "0") || 0, estSubtotal - estDiscount);
  const estDelivery = parseFloat(watchedEstDelivery || "0") || 0;
  const estTotal = Math.max(0, estSubtotal - estDiscount + estTax + estDelivery);

  const closeInvoiceDrawer = () => {
    setIsInvoiceOpen(false);
    setInvoiceStep(1);
    resetInlineCustomer();
    invoiceForm.reset();
  };

  const closeEstimateDrawer = () => {
    setIsEstimateOpen(false);
    setEstimateStep(1);
    resetInlineCustomer();
    estimateForm.reset();
  };

  const closeReturnDrawer = () => {
    setIsReturnOpen(false);
    setReturnInvoice(null);
    returnForm.reset();
  };

  const openReturnForInvoice = async (inv: Invoice) => {
    setReturnInvoice(inv);
    try {
      const full = await financeApi.getInvoice(workspaceId, inv.id);
      const exponent = full.invoice?.currency_exponent ?? inv.currency_exponent ?? 2;
      const itemsList = (full.items || []) as InvoiceLineItem[];
      returnForm.reset({
        return_date: today(),
        reason: "Customer return / dispute",
        action_taken: "customer_credit",
        tax_amount: "0",
        items:
          itemsList.length > 0
            ? itemsList.map((it) => ({
                description: it.description,
                quantity: String(it.quantity ?? "1"),
                unit_price: (Number(it.unit_price_minor) / Math.pow(10, exponent)).toFixed(2),
                restock_inventory: false,
              }))
            : [{ description: `Return on ${inv.invoice_number}`, quantity: "1", unit_price: "0", restock_inventory: false }],
      });
    } catch {
      returnForm.reset({
        return_date: today(),
        reason: "Customer return / dispute",
        action_taken: "customer_credit",
        tax_amount: "0",
        items: [{ description: `Return on ${inv.invoice_number}`, quantity: "1", unit_price: "0", restock_inventory: false }],
      });
    }
    setIsReturnOpen(true);
  };

  const resetInlineCustomer = () => {
    setNewCustomerName("");
    setNewCustomerPhone("");
    setNewCustomerEmail("");
    setIsCreatingCustomerInline(false);
  };

  const closePending = () => {
    setPending(null);
    walletForm.reset();
  };

  // Actions
  const createInvoiceAction = useFinanceAction(
    workspaceId,
    async (values: InvoiceValues, key: string) => {
      let resolvedCustomerId = values.customer_id;
      let resolvedCustomerName: string | undefined;

      if (isCreatingCustomerInline && newCustomerName.trim()) {
        try {
          const created = await financeApi.createContact(workspaceId, "customers", {
            name: newCustomerName.trim(),
            phone: newCustomerPhone.trim() || undefined,
            email: newCustomerEmail.trim() || undefined,
          });
          if (created && typeof created === "object" && "id" in created) {
            resolvedCustomerId = String((created as { id: number }).id);
            resolvedCustomerName = newCustomerName.trim();
          }
        } catch {
          resolvedCustomerName = newCustomerName.trim();
        }
      } else {
        const found = customers.data?.find((item) => String(item.id) === values.customer_id);
        if (found) {
          resolvedCustomerName = found.name;
        } else if (values.customer_id && isNaN(Number(values.customer_id))) {
          resolvedCustomerName = values.customer_id;
        }
      }

      return financeApi.createInvoice(
        workspaceId,
        {
          customer_id: Number(resolvedCustomerId) || undefined,
          customer_name: resolvedCustomerName,
          document_kind: values.document_kind || "invoice",
          issue_date: values.issue_date,
          due_date: values.due_date,
          currency,
          status: "draft",
          tax_amount: values.tax_amount || undefined,
          tax_lines:
            values.tax_lines && values.tax_lines.length > 0
              ? values.tax_lines.map((tl) => ({
                  name: tl.name,
                  rate_bps: Math.round((parseFloat(tl.rate_percent || "0") || 0) * 100),
                  is_compound: tl.is_compound,
                }))
              : undefined,
          discount_amount: values.discount_amount || undefined,
          delivery_fee_amount: values.delivery_fee_amount || undefined,
          notes: values.notes || undefined,
          terms: values.terms || undefined,
          items: values.items.map((item) => ({
            description: item.description,
            quantity: Number(item.quantity),
            unit_price: item.unit_price,
            discount_amount: item.discount_amount || undefined,
          })),
        },
        key,
      );
    },
    { success: "Invoice saved as draft", onDone: closeInvoiceDrawer },
  );

  const createEstimateAction = useFinanceAction(
    workspaceId,
    async (values: EstimateValues, key: string) => {
      let resolvedCustomerId = values.customer_id;
      let resolvedCustomerName = values.customer_id;

      if (isCreatingCustomerInline && newCustomerName.trim()) {
        try {
          const created = await financeApi.createContact(workspaceId, "customers", {
            name: newCustomerName.trim(),
            phone: newCustomerPhone.trim() || undefined,
            email: newCustomerEmail.trim() || undefined,
          });
          if (created && typeof created === "object" && "id" in created) {
            resolvedCustomerId = String((created as { id: number }).id);
            resolvedCustomerName = newCustomerName.trim();
          }
        } catch {
          resolvedCustomerName = newCustomerName.trim();
        }
      } else {
        const found = customers.data?.find((item) => String(item.id) === values.customer_id);
        if (found) {
          resolvedCustomerName = found.name;
        }
      }

      return financeApi.createEstimate(
        workspaceId,
        {
          customer_id: Number(resolvedCustomerId) || undefined,
          customer_name: resolvedCustomerName || "Prospective Client",
          issue_date: values.issue_date,
          expiry_date: values.expiry_date,
          currency,
          status: "draft",
          tax_amount: values.tax_amount || undefined,
          tax_lines:
            values.tax_lines && values.tax_lines.length > 0
              ? values.tax_lines.map((tl) => ({
                  name: tl.name,
                  rate_bps: Math.round((parseFloat(tl.rate_percent || "0") || 0) * 100),
                  is_compound: tl.is_compound,
                }))
              : undefined,
          discount_amount: values.discount_amount || undefined,
          delivery_fee_amount: values.delivery_fee_amount || undefined,
          notes: values.notes || undefined,
          terms: values.terms || undefined,
          items: values.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            discount_amount: item.discount_amount || undefined,
          })),
        },
        key,
      );
    },
    { success: "Quotation saved as draft", onDone: closeEstimateDrawer },
  );

  const convertProformaAction = useFinanceAction(
    workspaceId,
    (invoice: Invoice, key: string) => financeApi.convertProformaToInvoice(workspaceId, invoice.id, false, key),
    {
      success: "Proforma converted to standard draft invoice",
      onDone: closePending,
    },
  );

  const convertEstimateAction = useFinanceAction(
    workspaceId,
    (estimate: Estimate, key: string) => financeApi.convertEstimateToInvoice(workspaceId, estimate.id, key),
    {
      success: "Quotation converted to draft invoice",
      onDone: () => {
        closePending();
        setActiveTab("invoices");
      },
    },
  );

  const updateEstimateStatusAction = useFinanceAction(
    workspaceId,
    ({ estimate, status }: { estimate: Estimate; status: string }) =>
      financeApi.updateEstimateStatus(workspaceId, estimate.id, status),
    {
      success: "Estimate status updated",
    },
  );

  const finalizeInvoiceAction = useFinanceAction(
    workspaceId,
    (invoice: Invoice, key: string) => financeApi.finalizeInvoice(workspaceId, invoice.id, key),
    { success: "Invoice finalized", onDone: closePending },
  );

  const voidInvoiceAction = useFinanceAction(
    workspaceId,
    (invoice: Invoice, key: string) => financeApi.voidInvoice(workspaceId, invoice.id, "Voided from invoice list", key),
    { success: "Invoice voided", onDone: closePending },
  );

  const createSalesReturnAction = useFinanceAction(
    workspaceId,
    (values: SalesReturnValues, key: string) => {
      if (!returnInvoice) throw new Error("No invoice selected for return");
      return financeApi.createSalesReturn(
        workspaceId,
        {
          invoice_id: returnInvoice.id,
          customer_id: returnInvoice.customer_id,
          return_date: values.return_date,
          reason: values.reason,
          action_taken: values.action_taken,
          tax_amount: values.tax_amount || "0",
          items: values.items.map((it) => ({
            description: it.description,
            quantity: it.quantity,
            unit_price: it.unit_price,
            restock_inventory: it.restock_inventory,
          })),
        },
        key,
      );
    },
    {
      success: "Credit note & sales return issued successfully",
      onDone: () => {
        closeReturnDrawer();
        invoices.refetch();
        salesReturns.refetch();
      },
    },
  );

  const applyCreditAction = useFinanceAction(
    workspaceId,
    ({ invoice, amountMinor }: { invoice: Invoice; amountMinor: number }) =>
      financeApi.applyCustomerCredit(workspaceId, invoice.customer_id, invoice.id, amountMinor),
    {
      success: "Customer credit applied to invoice",
      onDone: () => {
        closePending();
        invoices.refetch();
      },
    },
  );

  const handleCheckAndApplyCredit = async (invoice: Invoice) => {
    try {
      const creditData = await financeApi.getCustomerCredit(workspaceId, invoice.customer_id, invoice.currency);
      const balanceMinor = Number(creditData?.credit?.balance_minor ?? 0);
      const dueMinor = Math.max(0, Number(invoice.total_amount_minor) - Number(invoice.paid_amount_minor));
      const applyMinor = Math.min(balanceMinor, dueMinor);
      if (applyMinor <= 0) {
        toast.info("This customer has no available store credit balance to apply.");
        return;
      }
      setPending({ kind: "apply_credit", invoice, availableMinor: applyMinor });
    } catch (err: unknown) {
      toast.danger(err instanceof Error ? err.message : "Failed to inspect customer credit");
    }
  };

  const payFromWallet = useFinanceAction(
    workspaceId,
    ({ invoice, amount }: { invoice: Invoice; amount: string }, key: string) =>
      financeApi.payInvoiceFromWallet(workspaceId, invoice.id, amount, invoice.currency, key),
    { success: "Paid from customer wallet", onDone: closePending },
  );

  const openDirectPayment = (invoice: Invoice) =>
    setPayment({
      direction: "incoming",
      linkedType: "invoice",
      linkedId: invoice.id,
      partyName: invoice.customer_name,
      summary: `${invoice.invoice_number}: ${money(invoice.paid_amount_minor, invoice)} paid of ${money(invoice.total_amount_minor, invoice)}. This clears the invoice receivable; it does not create sales revenue again.`,
    });

  // Selected customer for review steps
  const selectedInvoiceCustomer = useMemo(() => {
    if (isCreatingCustomerInline && newCustomerName) {
      return { id: 0, name: newCustomerName, email: newCustomerEmail, phone: newCustomerPhone };
    }
    return customers.data?.find((c) => String(c.id) === watchedInvCustomerId);
  }, [customers.data, watchedInvCustomerId, isCreatingCustomerInline, newCustomerName, newCustomerEmail, newCustomerPhone]);

  const selectedEstimateCustomer = useMemo(() => {
    if (isCreatingCustomerInline && newCustomerName) {
      return { id: 0, name: newCustomerName, email: newCustomerEmail, phone: newCustomerPhone };
    }
    return customers.data?.find((c) => String(c.id) === watchedEstCustomerId);
  }, [customers.data, watchedEstCustomerId, isCreatingCustomerInline, newCustomerName, newCustomerEmail, newCustomerPhone]);

  // Step Validation
  const handleInvoiceNext = async () => {
    if (invoiceStep === 1) {
      const ok = await invoiceForm.trigger(["items"]);
      if (ok) setInvoiceStep(2);
    } else if (invoiceStep === 2) {
      if (isCreatingCustomerInline && !newCustomerName.trim()) {
        invoiceForm.setError("customer_id", { message: "Customer name is required" });
        return;
      }
      const ok = await invoiceForm.trigger(["customer_id", "issue_date", "due_date"]);
      if (ok) setInvoiceStep(3);
    }
  };

  const handleEstimateNext = async () => {
    if (estimateStep === 1) {
      const ok = await estimateForm.trigger(["items"]);
      if (ok) setEstimateStep(2);
    } else if (estimateStep === 2) {
      if (isCreatingCustomerInline && !newCustomerName.trim()) {
        estimateForm.setError("customer_id", { message: "Customer name is required" });
        return;
      }
      const ok = await estimateForm.trigger(["customer_id", "issue_date", "expiry_date"]);
      if (ok) setEstimateStep(3);
    }
  };

  // Row Actions for Invoices
  const invoiceRowActions = (row: Invoice) => (
    <AppRowActions
      ariaLabel="Invoice actions"
      items={[
        {
          key: "share",
          label: "Share / WhatsApp",
          icon: <ShareNetwork size={16} aria-hidden="true" />,
          onClick: () => handleOpenShare(row),
        },
        {
          key: "inspect",
          label: "History & Portal Inbox",
          icon: <ClockCounterClockwise size={16} aria-hidden="true" />,
          onClick: () => openInspector("invoice", row),
        },
        ...(row.document_kind === "proforma"
          ? [
              {
                key: "convert_proforma",
                label: "Convert to Final Invoice",
                icon: <ArrowsClockwise size={16} aria-hidden="true" />,
                disabled: row.status === "voided",
                onClick: () => setPending({ kind: "convert_proforma", invoice: row }),
              },
            ]
          : []),
        {
          key: "finalize",
          label: "Finalize",
          icon: <CheckCircle size={16} aria-hidden="true" />,
          disabled: row.status !== "draft",
          onClick: () => setPending({ kind: "finalize", invoice: row }),
        },
        {
          key: "payment",
          label: "Record payment",
          icon: <HandCoins size={16} aria-hidden="true" />,
          disabled: row.document_kind === "proforma" || (row.status !== "finalized" && row.status !== "partially_paid"),
          onClick: () => openDirectPayment(row),
        },
        {
          key: "wallet",
          label: "Pay from wallet",
          icon: <Wallet size={16} aria-hidden="true" />,
          disabled: row.document_kind === "proforma" || (row.status !== "finalized" && row.status !== "partially_paid"),
          onClick: () => setPending({ kind: "wallet", invoice: row }),
        },
        {
          key: "apply_credit",
          label: "Apply store credit",
          icon: <CreditCard size={16} aria-hidden="true" />,
          disabled: row.document_kind === "proforma" || (row.status !== "finalized" && row.status !== "partially_paid"),
          onClick: () => handleCheckAndApplyCredit(row),
        },
        {
          key: "credit_note",
          label: "Issue Credit Note / Return",
          icon: <ArrowUUpLeft size={16} aria-hidden="true" />,
          disabled: row.document_kind === "proforma" || row.status === "draft" || row.status === "voided",
          onClick: () => openReturnForInvoice(row),
        },
        {
          key: "void",
          label: "Void invoice",
          icon: <Prohibit size={16} aria-hidden="true" />,
          danger: true,
          disabled: row.status !== "draft" && row.status !== "finalized",
          onClick: () => setPending({ kind: "void", invoice: row }),
        },
      ]}
    />
  );

  // Row Actions for Estimates
  const estimateRowActions = (row: Estimate) => (
    <AppRowActions
      ariaLabel="Estimate actions"
      items={[
        {
          key: "share",
          label: "Share / WhatsApp",
          icon: <ShareNetwork size={16} aria-hidden="true" />,
          onClick: () => handleOpenEstimateShare(row),
        },
        {
          key: "inspect",
          label: "History & Messages",
          icon: <ClockCounterClockwise size={16} aria-hidden="true" />,
          onClick: () => openInspector("estimate", row),
        },
        {
          key: "convert",
          label: "Convert to Invoice",
          icon: <ArrowsClockwise size={16} aria-hidden="true" />,
          disabled: row.status === "converted" || row.status === "declined" || row.status === "expired",
          onClick: () => setPending({ kind: "convert_estimate", estimate: row }),
        },
        {
          key: "send",
          label: "Mark Sent",
          icon: <PaperPlaneTilt size={16} aria-hidden="true" />,
          disabled: row.status !== "draft",
          onClick: () => updateEstimateStatusAction.mutate({ estimate: row, status: "sent" }),
        },
        {
          key: "accept",
          label: "Mark Accepted",
          icon: <CheckCircle size={16} aria-hidden="true" />,
          disabled: row.status === "converted" || row.status === "accepted",
          onClick: () => updateEstimateStatusAction.mutate({ estimate: row, status: "accepted" }),
        },
        {
          key: "decline",
          label: "Mark Declined",
          icon: <XCircle size={16} aria-hidden="true" />,
          danger: true,
          disabled: row.status === "converted" || row.status === "declined",
          onClick: () => updateEstimateStatusAction.mutate({ estimate: row, status: "declined" }),
        },
      ]}
    />
  );

  return (
    <Page>
      <PageHeader
        title="Billing & Invoicing"
        description="Draft and issue invoices, send commercial quotations, and collect customer payments."
        actions={
          <div className="flex items-center gap-2">
            {activeTab === "estimates" ? (
              <AppButton startContent={<Plus weight="bold" />} label="New quotation" onPress={() => setIsEstimateOpen(true)} />
            ) : activeTab === "debit-notes" ? (
              <AppButton startContent={<FilePlus weight="bold" />} label="New debit note" onPress={() => setIsDebitNoteOpen(true)} />
            ) : (
              <AppButton startContent={<Plus weight="bold" />} label="New invoice" onPress={() => setIsInvoiceOpen(true)} />
            )}
          </div>
        }
      />
      <PageStats kind="invoices" workspaceId={workspaceId} currency={currency} />

      {/* View Switcher Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/40 pb-3 mb-2">
        <button
          type="button"
          onClick={() => setActiveTab("invoices")}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all ${
            activeTab === "invoices"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted hover:text-foreground hover:bg-surface-secondary"
          }`}
        >
          Invoices & Proformas
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("estimates")}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all ${
            activeTab === "estimates"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted hover:text-foreground hover:bg-surface-secondary"
          }`}
        >
          Estimates & Quotes
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("returns")}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all ${
            activeTab === "returns"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted hover:text-foreground hover:bg-surface-secondary"
          }`}
        >
          Credit Notes & Returns
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("debit-notes")}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all ${
            activeTab === "debit-notes"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted hover:text-foreground hover:bg-surface-secondary"
          }`}
        >
          Debit Notes
        </button>
      </div>

      {/* TAB 1: INVOICES */}
      {activeTab === "invoices" && (
        <DataView<Invoice>
          title="Invoices"
          rows={invoices.rows}
          rowKey={(row) => row.id}
          isLoading={invoices.isPending}
          isError={invoices.isError}
          server={invoices.controls}
          searchPlaceholder="Search number or customer"
          empty={
            <EmptyState
              icon={FileText}
              title="No invoices yet"
              description="Create an invoice to bill a customer."
              action={<AppButton startContent={<Plus weight="bold" />} label="New invoice" onPress={() => setIsInvoiceOpen(true)} />}
            />
          }
          columns={[
            {
              key: "number",
              label: "Invoice",
              render: (row) => (
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{row.invoice_number}</span>
                  {row.document_kind === "proforma" && <StatusPill tone="warning">Proforma</StatusPill>}
                </div>
              ),
            },
            { key: "customer", label: "Customer", render: (row) => row.customer_name },
            { key: "due", label: "Due", render: (row) => formatDate(row.due_date) },
            { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
            { key: "paid", label: "Paid", align: "right", render: (row) => <span className="tabular">{money(row.paid_amount_minor, row)}</span> },
            { key: "total", label: "Total", align: "right", render: (row) => <span className="tabular font-semibold">{money(row.total_amount_minor, row)}</span> },
            { key: "actions", label: "", align: "right", render: invoiceRowActions },
          ]}
          renderCard={(row) => (
            <RecordCard
              icon={<FileText size={18} aria-hidden="true" />}
              iconClassName="bg-primary-soft text-primary"
              reference={row.invoice_number}
              title={row.customer_name}
              amount={money(row.total_amount_minor, row)}
              status={<StatusBadge status={row.status} />}
              meta={[
                { label: "Paid", value: money(row.paid_amount_minor, row) },
                { label: "Due", value: formatDate(row.due_date) },
              ]}
              actions={invoiceRowActions(row)}
            />
          )}
        />
      )}

      {/* TAB 2: ESTIMATES & QUOTATIONS */}
      {activeTab === "estimates" && (
        <DataView<Estimate>
          title="Estimates & Quotations"
          rows={estimates.rows}
          rowKey={(row) => row.id}
          isLoading={estimates.isPending}
          isError={estimates.isError}
          server={estimates.controls}
          searchPlaceholder="Search estimate # or customer"
          empty={
            <EmptyState
              icon={FileText}
              title="No quotations yet"
              description="Send a price quote to prospective customers before issuing an invoice."
              action={<AppButton startContent={<Plus weight="bold" />} label="New quotation" onPress={() => setIsEstimateOpen(true)} />}
            />
          }
          columns={[
            { key: "number", label: "Estimate #", render: (row) => <span className="font-medium text-foreground">{row.estimate_number}</span> },
            { key: "customer", label: "Customer", render: (row) => row.customer_name },
            { key: "issue", label: "Issue Date", render: (row) => formatDate(row.issue_date) },
            { key: "expiry", label: "Expires", render: (row) => formatDate(row.expiry_date) },
            { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
            {
              key: "total",
              label: "Total",
              align: "right",
              render: (row) => <span className="tabular font-semibold">{money(row.total_amount_minor, row)}</span>,
            },
            { key: "actions", label: "", align: "right", render: estimateRowActions },
          ]}
          renderCard={(row) => (
            <RecordCard
              icon={<FileText size={18} aria-hidden="true" />}
              iconClassName="bg-accent-soft text-accent"
              reference={row.estimate_number}
              title={row.customer_name}
              amount={money(row.total_amount_minor, row)}
              status={<StatusBadge status={row.status} />}
              meta={[
                { label: "Issued", value: formatDate(row.issue_date) },
                { label: "Expires", value: formatDate(row.expiry_date) },
              ]}
              actions={estimateRowActions(row)}
            />
          )}
        />
      )}

      {/* TAB 3: CREDIT NOTES & SALES RETURNS */}
      {activeTab === "returns" && (
        <DataView<SalesReturn>
          title="Credit Notes & Sales Returns"
          rows={salesReturns.data ?? []}
          rowKey={(row) => row.id}
          isLoading={salesReturns.isPending}
          isError={salesReturns.isError}
          searchPlaceholder="Search return # or reason"
          getSearchText={(row) => `${row.return_number} ${row.reason} ${row.action_taken}`}
          empty={
            <EmptyState
              icon={ArrowUUpLeft}
              title="No credit notes yet"
              description="Open an issued invoice's action menu and choose Issue Credit Note / Return."
              action={<AppButton variant="secondary" label="Go to Invoices" onPress={() => setActiveTab("invoices")} />}
            />
          }
          columns={[
            { key: "number", label: "Credit Note #", render: (row) => <span className="font-medium text-foreground">{row.return_number}</span> },
            { key: "reason", label: "Reason", render: (row) => row.reason },
            { key: "action", label: "Resolution", render: (row) => <span className="capitalize">{row.action_taken.replace(/_/g, " ")}</span> },
            { key: "date", label: "Return Date", render: (row) => formatDate(row.return_date) },
            { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
            {
              key: "total",
              label: "Amount",
              align: "right",
              render: (row) => (
                <span className="tabular font-semibold">
                  {formatMinorAmount(row.total_amount_minor, row.currency, row.currency_exponent || 2)}
                </span>
              ),
            },
          ]}
          renderCard={(row) => (
            <RecordCard
              icon={<ArrowUUpLeft size={18} aria-hidden="true" />}
              iconClassName="bg-secondary-soft text-secondary"
              reference={row.return_number}
              title={row.reason}
              amount={formatMinorAmount(row.total_amount_minor, row.currency, row.currency_exponent || 2)}
              status={<StatusBadge status={row.status} />}
              meta={[
                { label: "Resolution", value: row.action_taken.replace(/_/g, " ") },
                { label: "Date", value: formatDate(row.return_date) },
              ]}
            />
          )}
        />
      )}

      {/* TAB 4: DEBIT NOTES */}
      {activeTab === "debit-notes" && (
        <DataView<DebitNote>
          title="Debit Notes & Adjustment Invoices"
          rows={debitNotesQuery.data ?? []}
          rowKey={(row) => row.id}
          isLoading={debitNotesQuery.isPending}
          isError={debitNotesQuery.isError}
          searchPlaceholder="Search debit note # or customer"
          getSearchText={(row) => `${row.debit_note_number} ${row.customer_name} ${row.reason ?? ""}`}
          empty={
            <EmptyState
              icon={FilePlus}
              title="No debit notes yet"
              description="Issue a debit note to add a post-invoice surcharge or adjustment."
              action={<AppButton startContent={<Plus weight="bold" />} label="New debit note" onPress={() => setIsDebitNoteOpen(true)} />}
            />
          }
          columns={[
            { key: "number", label: "Debit Note #", render: (row) => <span className="font-medium text-foreground">{row.debit_note_number}</span> },
            { key: "customer", label: "Customer", render: (row) => row.customer_name },
            { key: "reason", label: "Reason", render: (row) => row.reason || "Adjustment" },
            { key: "date", label: "Issue Date", render: (row) => formatDate(row.issue_date) },
            { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
            {
              key: "total",
              label: "Amount",
              align: "right",
              render: (row) => (
                <span className="tabular font-semibold">{formatMinorAmount(row.total_amount_minor, row.currency, row.currency_exponent || 2)}</span>
              ),
            },
            {
              key: "actions",
              label: "",
              align: "right",
              render: (row) => (
                <AppRowActions
                  ariaLabel="Debit note actions"
                  items={[
                    {
                      key: "void_dn",
                      label: "Void debit note",
                      icon: <Prohibit size={16} />,
                      danger: true,
                      disabled: row.status === "voided",
                      onClick: async () => {
                        try {
                          await financeApi.voidDebitNote(workspaceId, row.id, "Voided from UI");
                          toast.success("Debit note voided");
                          debitNotesQuery.refetch();
                        } catch (err: unknown) {
                          toast.danger(err instanceof Error ? err.message : "Failed to void debit note");
                        }
                      },
                    },
                  ]}
                />
              ),
            },
          ]}
          renderCard={(row) => (
            <RecordCard
              icon={<FilePlus size={18} aria-hidden="true" />}
              iconClassName="bg-amber-500/15 text-amber-500"
              reference={row.debit_note_number}
              title={row.customer_name}
              amount={formatMinorAmount(row.total_amount_minor, row.currency, row.currency_exponent || 2)}
              status={<StatusBadge status={row.status} />}
              meta={[
                { label: "Reason", value: row.reason || "Adjustment" },
                { label: "Date", value: formatDate(row.issue_date) },
              ]}
            />
          )}
        />
      )}

      {/* MULTI-STEP INVOICE DRAWER */}
      <FormDrawer
        isOpen={isInvoiceOpen}
        onOpenChange={(open) => !open && closeInvoiceDrawer()}
        title="New invoice"
        size="lg"
        step={{ current: invoiceStep, total: 3, labels: INVOICE_STEPS.map((s) => s.title) }}
        description={INVOICE_STEPS[invoiceStep - 1].description}
      >
        <div className="flex flex-col gap-6">

          {/* STEP 1: Items */}
          {invoiceStep === 1 && (
            <LineItemsField
              workspaceId={workspaceId}
              currency={currency}
              items={watchedInvItems ?? []}
              onAdd={(line) => {
                invoiceItems.append(line);
                invoiceForm.clearErrors("items");
              }}
              onUpdate={(index, line) => invoiceItems.update(index, line)}
              onRemove={(index) => invoiceItems.remove(index)}
              error={(invoiceForm.formState.errors.items as { message?: string; root?: { message?: string } } | undefined)?.message ?? (invoiceForm.formState.errors.items as { root?: { message?: string } } | undefined)?.root?.message}
            />
          )}

          {/* STEP 2: Customer */}
          {invoiceStep === 2 && (
            <div className="space-y-4">
              <ContactField control={invoiceForm.control} name="customer_id" workspaceId={workspaceId} kind="customers" clearable={false} />

              <div className="grid gap-4 sm:grid-cols-2">
                <TextInputField control={invoiceForm.control} name="issue_date" label="Issue date" type="date" isRequired />
                <TextInputField control={invoiceForm.control} name="due_date" label="Due date" type="date" isRequired />
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-foreground block">Document Type</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => invoiceForm.setValue("document_kind", "invoice")}
                    className={`h-10 rounded-xl border text-xs font-semibold transition-all ${
                      watchedInvKind === "invoice"
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-border bg-background text-muted"
                    }`}
                  >
                    Standard Invoice
                  </button>
                  <button
                    type="button"
                    onClick={() => invoiceForm.setValue("document_kind", "proforma")}
                    className={`h-10 rounded-xl border text-xs font-semibold transition-all ${
                      watchedInvKind === "proforma"
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-border bg-background text-muted"
                    }`}
                  >
                    Proforma Invoice
                  </button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <MoneyField control={invoiceForm.control} name="tax_amount" label="Flat Tax (or add lines below)" currency={currency} />
                <MoneyField control={invoiceForm.control} name="discount_amount" label="Doc Discount" currency={currency} />
                <MoneyField control={invoiceForm.control} name="delivery_fee_amount" label="Delivery fee" currency={currency} />
              </div>

              <div className="rounded-2xl border border-border/50 bg-surface-secondary/30 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Multi-Tax / Compound Tax Lines</span>
                  <AppButton
                    size="sm"
                    variant="tertiary"
                    startContent={<Plus size={14} />}
                    label="Add tax"
                    onPress={() => invoiceTaxLines.append({ name: "VAT", rate_percent: "7.5", is_compound: false })}
                  />
                </div>
                {invoiceTaxLines.fields.map((tf, tidx) => (
                  <div key={tf.id} className="grid grid-cols-[1.5fr_1fr_auto_auto] items-center gap-2 text-xs">
                    <TextInputField control={invoiceForm.control} name={`tax_lines.${tidx}.name`} label="Tax name" />
                    <TextInputField control={invoiceForm.control} name={`tax_lines.${tidx}.rate_percent`} label="Rate %" />
                    <label className="flex items-center gap-1.5 pt-5 text-[11px] text-muted cursor-pointer">
                      <input type="checkbox" {...invoiceForm.register(`tax_lines.${tidx}.is_compound`)} />
                      Compound
                    </label>
                    <div className="pt-5">
                      <AppButton isIconOnly size="sm" variant="ghost" aria-label="Remove tax line" onPress={() => invoiceTaxLines.remove(tidx)}>
                        <Trash size={15} className="text-danger" />
                      </AppButton>
                    </div>
                  </div>
                ))}
              </div>
              <NotesField control={invoiceForm.control} name="terms" label="Payment terms" />
              <NotesField control={invoiceForm.control} name="notes" label="Customer notes (optional)" />
            </div>
          )}

          {/* STEP 3: Review */}
          {invoiceStep === 3 && (
            <DocumentReview
              kind="invoice"
              currency={currency}
              party={selectedInvoiceCustomer?.name || watchedInvCustomerId || "Walk-in customer"}
              issueDate={watchedInvIssueDate}
              dueDate={watchedInvDueDate}
              items={watchedInvItems ?? []}
              amounts={{ subtotal: invSubtotal, discount: invDiscount, tax: invTax, delivery: invDelivery, total: invTotal }}
              terms={watchedInvTerms || undefined}
            />
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between border-t border-border/40 pt-4 mt-2">
            <div>
              {invoiceStep > 1 ? (
                <AppButton variant="ghost" startContent={<ArrowLeft size={16} />} label="Back" onPress={() => setInvoiceStep((prev) => (prev - 1) as 1 | 2)} />
              ) : (
                <AppButton variant="ghost" label="Cancel" onPress={closeInvoiceDrawer} />
              )}
            </div>
            <div>
              {invoiceStep < 3 ? (
                <AppButton variant="primary" endContent={<ArrowRight size={16} />} label="Next" onPress={handleInvoiceNext} />
              ) : (
                <AppButton
                  variant="primary"
                  label="Save draft invoice"
                  isLoading={createInvoiceAction.isPending}
                  onPress={() => invoiceForm.handleSubmit((values) => createInvoiceAction.mutate(values))()}
                />
              )}
            </div>
          </div>
        </div>
      </FormDrawer>

      {/* MULTI-STEP ESTIMATE DRAWER */}
      <FormDrawer
        isOpen={isEstimateOpen}
        onOpenChange={(open) => !open && closeEstimateDrawer()}
        title="New quotation"
        size="lg"
        step={{ current: estimateStep, total: 3, labels: ESTIMATE_STEPS.map((s) => s.title) }}
        description={ESTIMATE_STEPS[estimateStep - 1].description}
      >
        <div className="flex flex-col gap-6">

          {/* ESTIMATE STEP 1: Items */}
          {estimateStep === 1 && (
            <LineItemsField
              workspaceId={workspaceId}
              currency={currency}
              items={watchedEstItems ?? []}
              onAdd={(line) => {
                estimateItems.append(line);
                estimateForm.clearErrors("items");
              }}
              onUpdate={(index, line) => estimateItems.update(index, line)}
              onRemove={(index) => estimateItems.remove(index)}
              error={(estimateForm.formState.errors.items as { message?: string; root?: { message?: string } } | undefined)?.message ?? (estimateForm.formState.errors.items as { root?: { message?: string } } | undefined)?.root?.message}
            />
          )}

          {/* ESTIMATE STEP 2: Customer & Expiry */}
          {estimateStep === 2 && (
            <div className="space-y-4">
              <ContactField control={estimateForm.control} name="customer_id" workspaceId={workspaceId} kind="customers" label="Customer or prospect" clearable={false} />

              <div className="grid gap-4 sm:grid-cols-2">
                <TextInputField control={estimateForm.control} name="issue_date" label="Issue date" type="date" isRequired />
                <TextInputField control={estimateForm.control} name="expiry_date" label="Expiry date" type="date" isRequired />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <MoneyField control={estimateForm.control} name="tax_amount" label="Flat Tax (or lines below)" currency={currency} />
                <MoneyField control={estimateForm.control} name="discount_amount" label="Doc Discount" currency={currency} />
                <MoneyField control={estimateForm.control} name="delivery_fee_amount" label="Delivery fee" currency={currency} />
              </div>

              <div className="rounded-2xl border border-border/50 bg-surface-secondary/30 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Multi-Tax / Compound Tax Lines</span>
                  <AppButton
                    size="sm"
                    variant="tertiary"
                    startContent={<Plus size={14} />}
                    label="Add tax"
                    onPress={() => estimateTaxLines.append({ name: "VAT", rate_percent: "7.5", is_compound: false })}
                  />
                </div>
                {estimateTaxLines.fields.map((tf, tidx) => (
                  <div key={tf.id} className="grid grid-cols-[1.5fr_1fr_auto_auto] items-center gap-2 text-xs">
                    <TextInputField control={estimateForm.control} name={`tax_lines.${tidx}.name`} label="Tax name" />
                    <TextInputField control={estimateForm.control} name={`tax_lines.${tidx}.rate_percent`} label="Rate %" />
                    <label className="flex items-center gap-1.5 pt-5 text-[11px] text-muted cursor-pointer">
                      <input type="checkbox" {...estimateForm.register(`tax_lines.${tidx}.is_compound`)} />
                      Compound
                    </label>
                    <div className="pt-5">
                      <AppButton isIconOnly size="sm" variant="ghost" aria-label="Remove tax line" onPress={() => estimateTaxLines.remove(tidx)}>
                        <Trash size={15} className="text-danger" />
                      </AppButton>
                    </div>
                  </div>
                ))}
              </div>
              <NotesField control={estimateForm.control} name="terms" label="Commercial terms" />
              <NotesField control={estimateForm.control} name="notes" label="Quotation notes" />
            </div>
          )}

          {/* ESTIMATE STEP 3: Review */}
          {estimateStep === 3 && (
            <DocumentReview
              kind="quotation"
              currency={currency}
              party={selectedEstimateCustomer?.name || watchedEstCustomerId || "Prospective client"}
              issueDate={watchedEstIssueDate}
              dueDate={watchedEstExpiryDate}
              items={watchedEstItems ?? []}
              amounts={{ subtotal: estSubtotal, discount: estDiscount, tax: estTax, delivery: estDelivery, total: estTotal }}
              terms={watchedEstTerms || undefined}
            />
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between border-t border-border/40 pt-4 mt-2">
            <div>
              {estimateStep > 1 ? (
                <AppButton variant="ghost" startContent={<ArrowLeft size={16} />} label="Back" onPress={() => setEstimateStep((prev) => (prev - 1) as 1 | 2)} />
              ) : (
                <AppButton variant="ghost" label="Cancel" onPress={closeEstimateDrawer} />
              )}
            </div>
            <div>
              {estimateStep < 3 ? (
                <AppButton variant="primary" endContent={<ArrowRight size={16} />} label="Next" onPress={handleEstimateNext} />
              ) : (
                <AppButton
                  variant="primary"
                  label="Save quotation"
                  isLoading={createEstimateAction.isPending}
                  onPress={() => estimateForm.handleSubmit((values) => createEstimateAction.mutate(values))()}
                />
              )}
            </div>
          </div>
        </div>
      </FormDrawer>

      {/* CONFIRM DIALOGS */}
      <ConfirmDialog
        isOpen={pending?.kind === "convert_proforma"}
        onOpenChange={(open) => !open && closePending()}
        title="Convert proforma to final invoice?"
        description="Creates a standard invoice linked to this proforma without disturbing non-posting proforma history."
        confirmLabel="Convert proforma"
        isDanger={false}
        isLoading={convertProformaAction.isPending}
        onConfirm={() => pending?.kind === "convert_proforma" && convertProformaAction.mutate(pending.invoice)}
      />

      <ConfirmDialog
        isOpen={pending?.kind === "convert_estimate"}
        onOpenChange={(open) => !open && closePending()}
        title="Convert quotation to draft invoice?"
        description="A new draft invoice will be created with the items and pricing from this quote. You will be able to review and finalize it before issuing."
        confirmLabel="Convert to invoice"
        isDanger={false}
        isLoading={convertEstimateAction.isPending}
        onConfirm={() => pending?.kind === "convert_estimate" && convertEstimateAction.mutate(pending.estimate)}
      />

      <ConfirmDialog
        isOpen={pending?.kind === "finalize"}
        onOpenChange={(open) => !open && closePending()}
        title="Finalize this invoice?"
        description="It will post to your books and can no longer be edited. To correct it later you would void it."
        confirmLabel="Finalize"
        isDanger={false}
        isLoading={finalizeInvoiceAction.isPending}
        onConfirm={() => pending?.kind === "finalize" && finalizeInvoiceAction.mutate(pending.invoice)}
      />
      <ConfirmDialog
        isOpen={pending?.kind === "apply_credit"}
        onOpenChange={(open) => !open && closePending()}
        title="Apply customer store credit?"
        description={
          pending?.kind === "apply_credit"
            ? `Apply ${formatMinorAmount(pending.availableMinor, pending.invoice.currency, pending.invoice.currency_exponent || 2)} of available store credit toward ${pending.invoice.invoice_number}?`
            : ""
        }
        confirmLabel="Apply credit"
        isDanger={false}
        isLoading={applyCreditAction.isPending}
        onConfirm={() =>
          pending?.kind === "apply_credit" &&
          applyCreditAction.mutate({ invoice: pending.invoice, amountMinor: pending.availableMinor })
        }
      />

      <ConfirmDialog
        isOpen={pending?.kind === "void"}
        onOpenChange={(open) => !open && closePending()}
        title="Void this invoice?"
        description="It stays in your history marked as voided, and its entries are reversed. This cannot be undone."
        confirmLabel="Void invoice"
        isLoading={voidInvoiceAction.isPending}
        onConfirm={() => pending?.kind === "void" && voidInvoiceAction.mutate(pending.invoice)}
      />
      <FormDrawer
        isOpen={pending?.kind === "wallet"}
        onOpenChange={(open) => !open && closePending()}
        title="Pay from customer wallet"
        description={
          pending?.kind === "wallet"
            ? `${pending.invoice.invoice_number}: ${money(pending.invoice.paid_amount_minor, pending.invoice)} paid of ${money(pending.invoice.total_amount_minor, pending.invoice)}.`
            : undefined
        }
        submitLabel="Confirm payment"
        isSubmitting={payFromWallet.isPending}
        onSubmit={walletForm.handleSubmit((values) => pending?.kind === "wallet" && payFromWallet.mutate({ invoice: pending.invoice, amount: values.amount }))}
      >
        <MoneyField
          control={walletForm.control}
          name="amount"
          label="Amount"
          currency={pending?.kind === "wallet" ? pending.invoice.currency : currency}
          isRequired
          description="Check the wallet balance on the Wallets page first."
        />
      </FormDrawer>
      {/* SHARE INVOICE OR ESTIMATE DRAWER */}
      <FormDrawer
        isOpen={shareTarget !== null}
        onOpenChange={(open) => !open && setShareTarget(null)}
        title={shareTarget?.kind === "estimate" ? "Share Quotation" : "Share Invoice"}
        description={shareTarget ? `Share ${shareTarget.number} with ${shareTarget.customerName}` : undefined}
      >
        {shareData && shareTarget && (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider block">
                Public {shareTarget.kind === "estimate" ? "Quotation" : "Invoice"} Link
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={typeof window !== "undefined" ? `${window.location.origin}${shareData.share_url}` : shareData.share_url}
                  className="flex-1 h-10 rounded-xl bg-surface-secondary border border-border px-3 text-xs font-mono text-foreground focus:outline-none"
                />
                <AppButton
                  variant="primary"
                  size="sm"
                  startContent={<Copy size={15} />}
                  label={copiedShareLink ? "Copied!" : "Copy"}
                  onPress={handleCopyShareLink}
                />
              </div>
              <p className="text-[11px] text-muted">
                Anyone with this link can view{shareTarget.kind === "estimate" ? ", accept/decline," : ""} and print without signing in. Valid for 30 days.
              </p>
            </div>

            <div className="space-y-3 pt-2 border-t border-border/40">
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider block">Direct Messaging</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `Hello ${shareTarget.customerName}, here is your ${shareTarget.kind === "estimate" ? "quotation" : "invoice"} ${shareTarget.number} for ${formatMinorAmount(
                      shareTarget.totalMinor,
                      shareTarget.currency,
                      shareTarget.currencyExponent,
                    )}: ${typeof window !== "undefined" ? window.location.origin : ""}${shareData.share_url}`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 h-11 rounded-2xl bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 font-bold text-xs transition-colors border border-[#25D366]/20"
                >
                  <WhatsappLogo size={18} weight="fill" />
                  Send via WhatsApp
                </a>

                <a
                  href={`mailto:?subject=${encodeURIComponent(
                    `${shareTarget.kind === "estimate" ? "Quotation" : "Invoice"} ${shareTarget.number}`,
                  )}&body=${encodeURIComponent(
                    `Hello ${shareTarget.customerName},\n\nPlease find your ${shareTarget.kind === "estimate" ? "quotation" : "invoice"} ${shareTarget.number} for ${formatMinorAmount(
                      shareTarget.totalMinor,
                      shareTarget.currency,
                      shareTarget.currencyExponent,
                    )}.\n\nView and print here:\n${typeof window !== "undefined" ? window.location.origin : ""}${
                      shareData.share_url
                    }\n\nThank you!`,
                  )}`}
                  className="flex items-center justify-center gap-2 h-11 rounded-2xl bg-surface-secondary text-foreground hover:bg-surface-secondary/80 font-semibold text-xs transition-colors border border-border"
                >
                  <Envelope size={18} weight="bold" />
                  Send via Email
                </a>
              </div>
            </div>
          </div>
        )}
      </FormDrawer>

      {/* CREDIT NOTE / SALES RETURN DRAWER */}
      <FormDrawer
        isOpen={isReturnOpen}
        onOpenChange={(open) => !open && closeReturnDrawer()}
        title="Credit note or sales return"
        size="lg"
        description={returnInvoice ? `Return goods or issue credit against ${returnInvoice.invoice_number}` : undefined}
        onSubmit={returnForm.handleSubmit((values: SalesReturnValues) => createSalesReturnAction.mutate(values))}
        submitLabel="Issue Credit Note"
        isSubmitting={createSalesReturnAction.isPending}
      >
        {returnInvoice && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-surface-secondary/40 p-3 text-xs space-y-1">
              <div className="flex justify-between text-muted">
                <span>Original Invoice:</span>
                <span className="font-semibold text-foreground">{returnInvoice.invoice_number}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Customer:</span>
                <span className="font-semibold text-foreground">{returnInvoice.customer_name}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Invoice Total:</span>
                <span className="font-semibold text-foreground">{money(returnInvoice.total_amount_minor, returnInvoice)}</span>
              </div>
            </div>

            <TextInputField
              control={returnForm.control}
              name="reason"
              label="Return Reason"
              placeholder="e.g. Defective items, customer cancellation, incorrect size"
              isRequired
            />

            <TextInputField
              control={returnForm.control}
              name="return_date"
              label="Return Date"
              type="date"
              isRequired
            />

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Action Taken / Compensation</label>
              <select
                {...returnForm.register("action_taken")}
                className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="customer_credit">Credit to Customer Wallet / Balance</option>
                <option value="invoice_reduction">Direct Invoice Balance Reduction</option>
                <option value="refund">Direct Cash / Bank Refund</option>
              </select>
              <p className="text-[11px] text-muted">
                Customer credit holds credit in their account for future purchases.
              </p>
            </div>

            <div className="space-y-3 pt-2 border-t border-border/40">
              <label className="text-xs font-semibold text-foreground block">Returned Items</label>
              {returnItems.fields.map((field, index) => (
                <div key={field.id} className="p-3 rounded-2xl border border-border/60 bg-surface-secondary/20 space-y-2">
                  <TextInputField
                    control={returnForm.control}
                    name={`items.${index}.description`}
                    label="Item Description"
                    placeholder="Item name"
                    isRequired
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <TextInputField
                      control={returnForm.control}
                      name={`items.${index}.quantity`}
                      label="Qty Returned"
                      isRequired
                    />
                    <MoneyField
                      control={returnForm.control}
                      name={`items.${index}.unit_price`}
                      label="Unit Price"
                      currency={returnInvoice.currency}
                      isRequired
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      {...returnForm.register(`items.${index}.restock_inventory`)}
                      className="rounded border-border text-primary focus:ring-primary/20"
                    />
                    <span>Restock items back into inventory</span>
                  </label>
                </div>
              ))}
            </div>

            <MoneyField
              control={returnForm.control}
              name="tax_amount"
              label="Tax Adjustment (Optional)"
              currency={returnInvoice.currency}
              placeholder="0.00"
            />
          </div>
        )}
      </FormDrawer>

      <PaymentDrawer
        workspaceId={workspaceId}
        currency={currency}
        isOpen={payment !== undefined}
        onClose={() => setPayment(undefined)}
        preset={payment}
      />

      {/* CREATE DEBIT NOTE DRAWER */}
      <FormDrawer
        isOpen={isDebitNoteOpen}
        onOpenChange={(open) => !open && setIsDebitNoteOpen(false)}
        title="New debit note"
        size="lg"
        description="Issue a positive billing adjustment or post-invoice surcharge."
        submitLabel="Issue Debit Note"
        isSubmitting={dnSaving}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!dnCustomerId || !dnDesc.trim() || !dnAmount.trim()) return;
          setDnSaving(true);
          try {
            await financeApi.createDebitNote(
              workspaceId,
              {
                customer_id: Number(dnCustomerId),
                invoice_id: dnInvoiceId ? Number(dnInvoiceId) : undefined,
                issue_date: dnDate,
                currency,
                status: "issued",
                reason: dnReason.trim() || "Billing adjustment",
                items: [{ description: dnDesc.trim(), quantity: 1, unit_price: dnAmount.trim() }],
              },
              `dn-${Date.now()}`,
            );
            toast.success("Debit note issued");
            setIsDebitNoteOpen(false);
            setDnDesc("");
            setDnAmount("");
            setDnReason("");
            debitNotesQuery.refetch();
          } catch (err: unknown) {
            toast.danger(err instanceof Error ? err.message : "Failed to issue debit note");
          } finally {
            setDnSaving(false);
          }
        }}
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Customer</label>
            <select
              required
              value={dnCustomerId}
              onChange={(e) => setDnCustomerId(e.target.value)}
              className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground"
            >
              <option value="">Choose customer...</option>
              {(customers.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Related Invoice (Optional)</label>
            <select
              value={dnInvoiceId}
              onChange={(e) => setDnInvoiceId(e.target.value)}
              className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground"
            >
              <option value="">None (Standalone adjustment)</option>
              {invoices.rows.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_number} — {inv.customer_name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Issue Date</label>
              <input type="date" required value={dnDate} onChange={(e) => setDnDate(e.target.value)} className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Amount ({currency})</label>
              <input type="text" required placeholder="0.00" value={dnAmount} onChange={(e) => setDnAmount(e.target.value)} className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm font-mono text-foreground" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Adjustment Item</label>
            <input type="text" required placeholder="e.g. Late freight surcharge" value={dnDesc} onChange={(e) => setDnDesc(e.target.value)} className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Reason</label>
            <input type="text" placeholder="Optional explanation" value={dnReason} onChange={(e) => setDnReason(e.target.value)} className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground" />
          </div>
        </div>
      </FormDrawer>

      {/* HISTORY & PORTAL INBOX DRAWER */}
      <FormDrawer
        isOpen={inspectTarget !== null}
        onOpenChange={(open) => !open && setInspectTarget(null)}
        title={inspectTarget ? `${inspectTarget.number} — History & Portal` : "History & Portal"}
        description="Revision history, client proof of payment submissions, and portal messages."
      >
        {inspectTarget && (
          <div className="space-y-6 text-xs">
            {inspectTarget.kind === "invoice" && (
              <div className="space-y-2.5">
                <h3 className="font-bold text-foreground uppercase tracking-wider text-[11px]">Submitted Payment Evidence ({inspectEvidences.length})</h3>
                {inspectEvidences.length === 0 ? (
                  <p className="text-muted">No customer payment evidence uploaded yet.</p>
                ) : (
                  inspectEvidences.map((ev) => (
                    <div key={ev.id} className="rounded-2xl border border-border/60 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">{ev.payer_name} • {ev.payment_method}</span>
                        <StatusPill tone={ev.status === "approved" ? "success" : ev.status === "rejected" ? "danger" : "warning"}>{ev.status}</StatusPill>
                      </div>
                      <div className="font-mono text-foreground">{formatMinorAmount(ev.amount_minor, inspectTarget.currency, inspectTarget.exp)} on {formatDate(ev.payment_date)}</div>
                      {ev.reference && <div className="text-muted">Ref: {ev.reference}</div>}
                      {ev.status === "pending" && (
                        <div className="flex gap-2 pt-1">
                          <AppButton
                            size="sm"
                            label="Approve"
                            onPress={async () => {
                              await financeApi.reviewPaymentEvidence(workspaceId, ev.id, "approved", "Verified");
                              setInspectEvidences((prev) => prev.map((x) => (x.id === ev.id ? { ...x, status: "approved" } : x)));
                              toast.success("Payment evidence marked approved");
                            }}
                          />
                          <AppButton
                            size="sm"
                            variant="ghost"
                            label="Reject"
                            onPress={async () => {
                              await financeApi.reviewPaymentEvidence(workspaceId, ev.id, "rejected", "Not found in statement");
                              setInspectEvidences((prev) => prev.map((x) => (x.id === ev.id ? { ...x, status: "rejected" } : x)));
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            <div className="space-y-2.5 border-t border-border/40 pt-4">
              <h3 className="font-bold text-foreground uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <ChatCircleDots size={15} className="text-primary" /> Portal Messages ({inspectMessages.length})
              </h3>
              {inspectMessages.length === 0 ? (
                <p className="text-muted">No portal messages on this document.</p>
              ) : (
                <div className="space-y-2">
                  {inspectMessages.map((m) => (
                    <div key={m.id} className="rounded-xl bg-surface-secondary/50 p-2.5">
                      <div className="flex justify-between text-[11px] text-muted mb-0.5">
                        <span className="font-semibold text-foreground">{m.sender_name} ({m.sender_type})</span>
                        <span>{new Date(m.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-foreground">{m.message}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Reply to customer..."
                  value={teamReply}
                  onChange={(e) => setTeamReply(e.target.value)}
                  className="flex-1 h-9 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                />
                <AppButton
                  size="sm"
                  label="Reply"
                  isLoading={replySending}
                  onPress={async () => {
                    if (!teamReply.trim()) return;
                    setReplySending(true);
                    try {
                      const created = await financeApi.postTeamDocumentMessage(workspaceId, inspectTarget.kind, inspectTarget.id, teamReply.trim());
                      setInspectMessages((prev) => [...prev, created]);
                      setTeamReply("");
                    } finally {
                      setReplySending(false);
                    }
                  }}
                />
              </div>
            </div>

            <div className="space-y-2 border-t border-border/40 pt-4">
              <h3 className="font-bold text-foreground uppercase tracking-wider text-[11px]">Revision History ({inspectVersions.length})</h3>
              {inspectVersions.length === 0 ? (
                <p className="text-muted">No revisions logged yet.</p>
              ) : (
                <div className="divide-y divide-border/30">
                  {inspectVersions.map((v) => (
                    <div key={v.id} className="py-2 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-foreground">v{v.version_number}</span> — {v.change_summary}
                      </div>
                      <span className="text-[11px] text-muted">{new Date(v.created_at).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </FormDrawer>
    </Page>
  );
}

export function InvoicesPage({ startOpen = false }: { startOpen?: boolean }) {
  return (
    <WorkspaceGate businessOnly>
      {(workspace) => <InvoicesContent key={workspace.workspaceId} {...workspace} startOpen={startOpen} />}
    </WorkspaceGate>
  );
}
