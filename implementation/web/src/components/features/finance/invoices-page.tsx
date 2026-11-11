"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ArrowRight,
  ArrowsClockwise,
  ArrowUUpLeft,
  CheckCircle,
  Copy,
  Envelope,
  FileText,
  HandCoins,
  PaperPlaneTilt,
  Plus,
  Prohibit,
  ShareNetwork,
  Trash,
  UserPlus,
  Wallet,
  WhatsappLogo,
  XCircle,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { AppComboBox, type AppComboBoxOption } from "@/components/ui/app-combo-box";
import { AppRowActions } from "@/components/ui/app-row-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { toast } from "@heroui/react";
import { formatDate } from "@/lib/format";
import { financeApi } from "@/lib/money";
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
import type { Estimate, Invoice } from "@/types/finance";

import { MoneyField, NotesField, TextInputField } from "./fields";
import { PaymentDrawer, type PaymentPreset } from "./payment-drawer";
import { money, StatusBadge, today, useContacts, useFinanceAction, useRecords, WorkspaceGate, type WorkspaceInfo } from "./shared";

type PendingAction =
  | { kind: "finalize"; invoice: Invoice }
  | { kind: "void"; invoice: Invoice }
  | { kind: "wallet"; invoice: Invoice }
  | { kind: "convert_estimate"; estimate: Estimate };

const BLANK_ITEM = { description: "", quantity: "1", unit_price: "" };

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
  const [activeTab, setActiveTab] = useState<"invoices" | "estimates">("invoices");

  // Invoices state
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(startOpen);
  const [invoiceStep, setInvoiceStep] = useState<1 | 2 | 3>(1);
  const invoices = useRecords<Invoice>("invoices", workspaceId);

  // Estimates state
  const [isEstimateOpen, setIsEstimateOpen] = useState(false);
  const [estimateStep, setEstimateStep] = useState<1 | 2 | 3>(1);
  const estimates = useRecords<Estimate>("estimates", workspaceId);

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [payment, setPayment] = useState<PaymentPreset | undefined>();
  const customers = useContacts(workspaceId, "customers");

  // Invoice share state
  const [shareInvoice, setShareInvoice] = useState<Invoice | null>(null);
  const [shareData, setShareData] = useState<{ share_url: string; token: string; expires_at: string } | null>(null);
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  // Sales Return / Credit Note state
  const [returnInvoice, setReturnInvoice] = useState<Invoice | null>(null);
  const [isReturnOpen, setIsReturnOpen] = useState(false);

  const handleOpenShare = async (inv: Invoice) => {
    try {
      const res = await financeApi.createInvoiceShare(workspaceId, inv.id);
      setShareData(res);
      setShareInvoice(inv);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create share link";
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
      issue_date: today(),
      due_date: today(),
      tax_amount: "",
      notes: "",
      terms: "Payment is due within 14 days of invoice date.",
      items: [BLANK_ITEM],
    },
    mode: "onChange",
  });
  const invoiceItems = useFieldArray({ control: invoiceForm.control, name: "items" });

  // Estimate Form
  const estimateForm = useForm<EstimateValues>({
    resolver: zodResolver(estimateSchema),
    defaultValues: {
      customer_id: "",
      issue_date: today(),
      expiry_date: today(),
      tax_amount: "",
      notes: "This quotation is valid for 14 days from issue date.",
      terms: "Standard commercial delivery terms apply.",
      items: [BLANK_ITEM],
    },
    mode: "onChange",
  });
  const estimateItems = useFieldArray({ control: estimateForm.control, name: "items" });

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
  const watchedInvTax = invoiceForm.watch("tax_amount");
  const watchedInvCustomerId = invoiceForm.watch("customer_id");
  const watchedInvIssueDate = invoiceForm.watch("issue_date");
  const watchedInvDueDate = invoiceForm.watch("due_date");
  const watchedInvTerms = invoiceForm.watch("terms");

  const invSubtotal = useMemo(() => {
    return (watchedInvItems ?? []).reduce((acc, it) => {
      const q = parseFloat(it.quantity || "0");
      const p = parseFloat(it.unit_price || "0");
      return acc + (isNaN(q) || isNaN(p) ? 0 : q * p);
    }, 0);
  }, [watchedInvItems]);
  const invTax = parseFloat(watchedInvTax || "0") || 0;
  const invTotal = invSubtotal + invTax;

  // Watched estimate values
  const watchedEstItems = estimateForm.watch("items");
  const watchedEstTax = estimateForm.watch("tax_amount");
  const watchedEstCustomerId = estimateForm.watch("customer_id");
  const watchedEstIssueDate = estimateForm.watch("issue_date");
  const watchedEstExpiryDate = estimateForm.watch("expiry_date");
  const watchedEstTerms = estimateForm.watch("terms");

  const estSubtotal = useMemo(() => {
    return (watchedEstItems ?? []).reduce((acc, it) => {
      const q = parseFloat(it.quantity || "0");
      const p = parseFloat(it.unit_price || "0");
      return acc + (isNaN(q) || isNaN(p) ? 0 : q * p);
    }, 0);
  }, [watchedEstItems]);
  const estTax = parseFloat(watchedEstTax || "0") || 0;
  const estTotal = estSubtotal + estTax;

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
      returnForm.reset({
        return_date: today(),
        reason: "Customer return / dispute",
        action_taken: "customer_credit",
        tax_amount: "0",
        items: (full.items || []).map((it: { description: string; quantity: string; unit_price_minor: number; currency_exponent: number }) => ({
          description: it.description,
          quantity: it.quantity || "1",
          unit_price: (Number(it.unit_price_minor) / Math.pow(10, it.currency_exponent || 2)).toFixed(2),
          restock_inventory: false,
        })),
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
          issue_date: values.issue_date,
          due_date: values.due_date,
          currency,
          status: "draft",
          tax_amount: values.tax_amount || undefined,
          notes: values.notes || undefined,
          terms: values.terms || undefined,
          items: values.items.map((item) => ({
            description: item.description,
            quantity: Number(item.quantity),
            unit_price: item.unit_price,
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
          notes: values.notes || undefined,
          terms: values.terms || undefined,
          items: values.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
          })),
        },
        key,
      );
    },
    { success: "Quotation saved as draft", onDone: closeEstimateDrawer },
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
      },
    },
  );

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

  // Customer options for ComboBox
  const customerOptions: AppComboBoxOption[] = useMemo(() => {
    return (customers.data ?? []).map((c) => ({
      key: String(c.id),
      label: c.name,
      description: c.phone || c.email || undefined,
    }));
  }, [customers.data]);

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
          disabled: row.status !== "finalized" && row.status !== "partially_paid",
          onClick: () => openDirectPayment(row),
        },
        {
          key: "wallet",
          label: "Pay from wallet",
          icon: <Wallet size={16} aria-hidden="true" />,
          disabled: row.status !== "finalized" && row.status !== "partially_paid",
          onClick: () => setPending({ kind: "wallet", invoice: row }),
        },
        {
          key: "credit_note",
          label: "Issue Credit Note / Return",
          icon: <ArrowUUpLeft size={16} aria-hidden="true" />,
          disabled: row.status === "draft" || row.status === "voided",
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
            {activeTab === "invoices" ? (
              <AppButton startContent={<Plus weight="bold" />} label="New invoice" onPress={() => setIsInvoiceOpen(true)} />
            ) : (
              <AppButton startContent={<Plus weight="bold" />} label="New quotation" onPress={() => setIsEstimateOpen(true)} />
            )}
          </div>
        }
      />

      {/* View Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-border/40 pb-3 mb-2">
        <button
          type="button"
          onClick={() => setActiveTab("invoices")}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all ${
            activeTab === "invoices"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted hover:text-foreground hover:bg-surface-secondary"
          }`}
        >
          Invoices
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
            { key: "number", label: "Invoice", render: (row) => <span className="font-medium text-foreground">{row.invoice_number}</span> },
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

      {/* MULTI-STEP INVOICE DRAWER */}
      <FormDrawer
        isOpen={isInvoiceOpen}
        onOpenChange={(open) => !open && closeInvoiceDrawer()}
        title={`New Invoice — Step ${invoiceStep} of 3`}
        description={INVOICE_STEPS[invoiceStep - 1].description}
      >
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-border/40 pb-4">
            {INVOICE_STEPS.map((s) => (
              <div key={s.step} className="flex items-center gap-2">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                    invoiceStep === s.step
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : invoiceStep > s.step
                        ? "bg-primary/20 text-primary font-bold"
                        : "bg-surface-secondary text-muted"
                  }`}
                >
                  {invoiceStep > s.step ? "✓" : s.step}
                </div>
                <span className={`text-xs font-medium hidden sm:inline ${invoiceStep === s.step ? "text-foreground font-semibold" : "text-muted"}`}>
                  {s.title}
                </span>
              </div>
            ))}
          </div>

          {/* STEP 1: Items */}
          {invoiceStep === 1 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[14px] font-semibold text-foreground">Line Items</p>
                <span className="text-xs text-muted">Currency: {currency}</span>
              </div>
              {invoiceItems.fields.map((field, index) => (
                <div key={field.id} className="space-y-3 rounded-2xl bg-surface-secondary/70 p-4 border border-border/40">
                  <TextInputField control={invoiceForm.control} name={`items.${index}.description`} label={`Item ${index + 1}`} isRequired />
                  <div className="grid grid-cols-[1fr_2fr_auto] items-start gap-3">
                    <TextInputField control={invoiceForm.control} name={`items.${index}.quantity`} label="Qty" isRequired />
                    <MoneyField control={invoiceForm.control} name={`items.${index}.unit_price`} label="Unit price" currency={currency} isRequired />
                    <div className="pt-6">
                      <AppButton isIconOnly variant="ghost" aria-label="Remove item" isDisabled={invoiceItems.fields.length === 1} onPress={() => invoiceItems.remove(index)}>
                        <Trash size={18} className="text-danger" />
                      </AppButton>
                    </div>
                  </div>
                </div>
              ))}
              <AppButton variant="tertiary" size="sm" startContent={<Plus weight="bold" />} label="Add another item" onPress={() => invoiceItems.append(BLANK_ITEM)} />
              <div className="mt-4 rounded-xl bg-surface-secondary p-3 text-right">
                <span className="text-xs text-muted">Subtotal: </span>
                <span className="text-sm font-semibold text-foreground tabular">
                  {currency} {invSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}

          {/* STEP 2: Customer */}
          {invoiceStep === 2 && (
            <div className="space-y-4">
              <AppComboBox
                label="Customer"
                placeholder="Search existing customer or type new..."
                options={customerOptions}
                selectedKey={isCreatingCustomerInline ? null : watchedInvCustomerId || null}
                inputValue={isCreatingCustomerInline ? newCustomerName : undefined}
                onSelectionChange={(key) => {
                  if (key) {
                    setIsCreatingCustomerInline(false);
                    setNewCustomerName("");
                    invoiceForm.setValue("customer_id", key, { shouldValidate: true });
                  }
                }}
                onCustomValueSubmit={(name) => {
                  setIsCreatingCustomerInline(true);
                  setNewCustomerName(name);
                  invoiceForm.setValue("customer_id", name, { shouldValidate: true });
                }}
                onInputChange={(val) => {
                  if (isCreatingCustomerInline) {
                    setNewCustomerName(val);
                    invoiceForm.setValue("customer_id", val);
                  }
                }}
                allowsCustomValue={true}
                isRequired
              />

              {isCreatingCustomerInline && (
                <div className="rounded-2xl bg-primary-soft/30 p-4 border border-primary/20 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                    <UserPlus size={16} weight="bold" />
                    <span>Adding &ldquo;{newCustomerName}&rdquo; as new customer</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted block mb-1">Phone</label>
                      <input
                        type="tel"
                        placeholder="+234..."
                        value={newCustomerPhone}
                        onChange={(e) => setNewCustomerPhone(e.target.value)}
                        className="w-full h-9 rounded-xl bg-surface-primary border border-border px-3 text-xs text-foreground focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted block mb-1">Email</label>
                      <input
                        type="email"
                        placeholder="client@example.com"
                        value={newCustomerEmail}
                        onChange={(e) => setNewCustomerEmail(e.target.value)}
                        className="w-full h-9 rounded-xl bg-surface-primary border border-border px-3 text-xs text-foreground focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <TextInputField control={invoiceForm.control} name="issue_date" label="Issue date" type="date" isRequired />
                <TextInputField control={invoiceForm.control} name="due_date" label="Due date" type="date" isRequired />
              </div>

              <MoneyField control={invoiceForm.control} name="tax_amount" label="Tax / VAT" currency={currency} />
              <NotesField control={invoiceForm.control} name="terms" label="Payment terms" />
              <NotesField control={invoiceForm.control} name="notes" label="Customer notes (optional)" />
            </div>
          )}

          {/* STEP 3: Review */}
          {invoiceStep === 3 && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/60 bg-surface-secondary/40 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">Customer</span>
                  <span className="text-xs font-medium text-foreground">{selectedInvoiceCustomer?.name || watchedInvCustomerId || "Walk-in"}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">Dates</span>
                  <span className="text-xs text-foreground">{watchedInvIssueDate} → {watchedInvDueDate}</span>
                </div>
                <div className="space-y-1.5 pt-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted block">Items</span>
                  {watchedInvItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-xs text-foreground">
                      <span>{item.quantity}x {item.description || "Item"}</span>
                      <span className="tabular font-medium">
                        {currency} {((parseFloat(item.quantity || "0") || 0) * (parseFloat(item.unit_price || "0") || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border pt-2 space-y-1">
                  <div className="flex justify-between text-xs text-muted">
                    <span>Subtotal</span>
                    <span className="tabular">{currency} {invSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  {invTax > 0 && (
                    <div className="flex justify-between text-xs text-muted">
                      <span>Tax</span>
                      <span className="tabular">{currency} {invTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold text-foreground pt-1 border-t border-border/40">
                    <span>Total Amount</span>
                    <span className="tabular text-primary font-bold">{currency} {invTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
              {watchedInvTerms && (
                <div className="rounded-xl bg-surface-secondary/70 p-3 text-xs text-muted">
                  <span className="font-semibold text-foreground block mb-0.5">Terms:</span>
                  {watchedInvTerms}
                </div>
              )}
            </div>
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
        title={`New Quotation — Step ${estimateStep} of 3`}
        description={ESTIMATE_STEPS[estimateStep - 1].description}
      >
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-border/40 pb-4">
            {ESTIMATE_STEPS.map((s) => (
              <div key={s.step} className="flex items-center gap-2">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                    estimateStep === s.step
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : estimateStep > s.step
                        ? "bg-primary/20 text-primary font-bold"
                        : "bg-surface-secondary text-muted"
                  }`}
                >
                  {estimateStep > s.step ? "✓" : s.step}
                </div>
                <span className={`text-xs font-medium hidden sm:inline ${estimateStep === s.step ? "text-foreground font-semibold" : "text-muted"}`}>
                  {s.title}
                </span>
              </div>
            ))}
          </div>

          {/* ESTIMATE STEP 1: Items */}
          {estimateStep === 1 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[14px] font-semibold text-foreground">Quotation Items</p>
                <span className="text-xs text-muted">Currency: {currency}</span>
              </div>
              {estimateItems.fields.map((field, index) => (
                <div key={field.id} className="space-y-3 rounded-2xl bg-surface-secondary/70 p-4 border border-border/40">
                  <TextInputField control={estimateForm.control} name={`items.${index}.description`} label={`Line ${index + 1}`} isRequired />
                  <div className="grid grid-cols-[1fr_2fr_auto] items-start gap-3">
                    <TextInputField control={estimateForm.control} name={`items.${index}.quantity`} label="Qty" isRequired />
                    <MoneyField control={estimateForm.control} name={`items.${index}.unit_price`} label="Unit price" currency={currency} isRequired />
                    <div className="pt-6">
                      <AppButton isIconOnly variant="ghost" aria-label="Remove item" isDisabled={estimateItems.fields.length === 1} onPress={() => estimateItems.remove(index)}>
                        <Trash size={18} className="text-danger" />
                      </AppButton>
                    </div>
                  </div>
                </div>
              ))}
              <AppButton variant="tertiary" size="sm" startContent={<Plus weight="bold" />} label="Add item" onPress={() => estimateItems.append(BLANK_ITEM)} />
              <div className="mt-4 rounded-xl bg-surface-secondary p-3 text-right">
                <span className="text-xs text-muted">Subtotal: </span>
                <span className="text-sm font-semibold text-foreground tabular">
                  {currency} {estSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}

          {/* ESTIMATE STEP 2: Customer & Expiry */}
          {estimateStep === 2 && (
            <div className="space-y-4">
              <AppComboBox
                label="Customer / Prospect"
                placeholder="Search or type prospective client..."
                options={customerOptions}
                selectedKey={isCreatingCustomerInline ? null : watchedEstCustomerId || null}
                inputValue={isCreatingCustomerInline ? newCustomerName : undefined}
                onSelectionChange={(key) => {
                  if (key) {
                    setIsCreatingCustomerInline(false);
                    setNewCustomerName("");
                    estimateForm.setValue("customer_id", key, { shouldValidate: true });
                  }
                }}
                onCustomValueSubmit={(name) => {
                  setIsCreatingCustomerInline(true);
                  setNewCustomerName(name);
                  estimateForm.setValue("customer_id", name, { shouldValidate: true });
                }}
                onInputChange={(val) => {
                  if (isCreatingCustomerInline) {
                    setNewCustomerName(val);
                    estimateForm.setValue("customer_id", val);
                  }
                }}
                allowsCustomValue={true}
                isRequired
              />

              {isCreatingCustomerInline && (
                <div className="rounded-2xl bg-primary-soft/30 p-4 border border-primary/20 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                    <UserPlus size={16} weight="bold" />
                    <span>Adding &ldquo;{newCustomerName}&rdquo; as new contact</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted block mb-1">Phone</label>
                      <input
                        type="tel"
                        placeholder="+234..."
                        value={newCustomerPhone}
                        onChange={(e) => setNewCustomerPhone(e.target.value)}
                        className="w-full h-9 rounded-xl bg-surface-primary border border-border px-3 text-xs text-foreground focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted block mb-1">Email</label>
                      <input
                        type="email"
                        placeholder="client@example.com"
                        value={newCustomerEmail}
                        onChange={(e) => setNewCustomerEmail(e.target.value)}
                        className="w-full h-9 rounded-xl bg-surface-primary border border-border px-3 text-xs text-foreground focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <TextInputField control={estimateForm.control} name="issue_date" label="Issue date" type="date" isRequired />
                <TextInputField control={estimateForm.control} name="expiry_date" label="Expiry date" type="date" isRequired />
              </div>

              <MoneyField control={estimateForm.control} name="tax_amount" label="Tax / VAT estimate" currency={currency} />
              <NotesField control={estimateForm.control} name="terms" label="Commercial terms" />
              <NotesField control={estimateForm.control} name="notes" label="Quotation notes" />
            </div>
          )}

          {/* ESTIMATE STEP 3: Review */}
          {estimateStep === 3 && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/60 bg-surface-secondary/40 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">Customer</span>
                  <span className="text-xs font-medium text-foreground">{selectedEstimateCustomer?.name || watchedEstCustomerId || "Prospective Client"}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">Validity</span>
                  <span className="text-xs text-foreground">{watchedEstIssueDate} → {watchedEstExpiryDate}</span>
                </div>
                <div className="space-y-1.5 pt-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted block">Items</span>
                  {watchedEstItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-xs text-foreground">
                      <span>{item.quantity}x {item.description || "Item"}</span>
                      <span className="tabular font-medium">
                        {currency} {((parseFloat(item.quantity || "0") || 0) * (parseFloat(item.unit_price || "0") || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border pt-2 space-y-1">
                  <div className="flex justify-between text-xs text-muted">
                    <span>Subtotal</span>
                    <span className="tabular">{currency} {estSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  {estTax > 0 && (
                    <div className="flex justify-between text-xs text-muted">
                      <span>Tax</span>
                      <span className="tabular">{currency} {estTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold text-foreground pt-1 border-t border-border/40">
                    <span>Total Estimate</span>
                    <span className="tabular text-primary font-bold">{currency} {estTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
              {watchedEstTerms && (
                <div className="rounded-xl bg-surface-secondary/70 p-3 text-xs text-muted">
                  <span className="font-semibold text-foreground block mb-0.5">Terms:</span>
                  {watchedEstTerms}
                </div>
              )}
            </div>
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
      {/* SHARE INVOICE DRAWER */}
      <FormDrawer
        isOpen={shareInvoice !== null}
        onOpenChange={(open) => !open && setShareInvoice(null)}
        title="Share Invoice"
        description={shareInvoice ? `Share ${shareInvoice.invoice_number} with ${shareInvoice.customer_name}` : undefined}
      >
        {shareData && shareInvoice && (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider block">Public Invoice Link</label>
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
                Anyone with this link can view and print the invoice without signing in. Valid for 30 days.
              </p>
            </div>

            <div className="space-y-3 pt-2 border-t border-border/40">
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider block">Direct Messaging</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `Hello ${shareInvoice.customer_name}, here is your invoice ${shareInvoice.invoice_number} for ${money(
                      shareInvoice.total_amount_minor,
                      shareInvoice,
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
                  href={`mailto:?subject=${encodeURIComponent(`Invoice ${shareInvoice.invoice_number}`)}&body=${encodeURIComponent(
                    `Hello ${shareInvoice.customer_name},\n\nPlease find your invoice ${shareInvoice.invoice_number} for ${money(
                      shareInvoice.total_amount_minor,
                      shareInvoice,
                    )}.\n\nView and print your invoice here:\n${typeof window !== "undefined" ? window.location.origin : ""}${
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
        title="Issue Credit Note / Sales Return"
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
