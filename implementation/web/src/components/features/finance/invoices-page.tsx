"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  FileText,
  HandCoins,
  Plus,
  Prohibit,
  Trash,
  UserPlus,
  Wallet,
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
import { formatDate } from "@/lib/format";
import { financeApi } from "@/lib/money";
import { invoiceSchema, walletPaymentSchema, type InvoiceValues, type WalletPaymentValues } from "@/lib/schemas/finance.schemas";
import type { Invoice } from "@/types/finance";

import { MoneyField, NotesField, TextInputField } from "./fields";
import { PaymentDrawer, type PaymentPreset } from "./payment-drawer";
import { money, StatusBadge, today, useContacts, useFinanceAction, useRecords, WorkspaceGate, type WorkspaceInfo } from "./shared";

type PendingAction = { kind: "finalize" | "void" | "wallet"; invoice: Invoice };

const BLANK_ITEM = { description: "", quantity: "1", unit_price: "" };

const STEPS = [
  { step: 1, title: "Items & Pricing", description: "What are you billing for?" },
  { step: 2, title: "Customer & Terms", description: "Who is this invoice for?" },
  { step: 3, title: "Review & Draft", description: "Review totals and save draft" },
] as const;

function InvoicesContent({ workspaceId, currency, startOpen }: WorkspaceInfo & { startOpen: boolean }) {
  const [isOpen, setIsOpen] = useState(startOpen);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [payment, setPayment] = useState<PaymentPreset | undefined>();
  const invoices = useRecords<Invoice>("invoices", workspaceId);
  const customers = useContacts(workspaceId, "customers");

  // New inline customer creation states
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [isCreatingCustomerInline, setIsCreatingCustomerInline] = useState(false);

  const form = useForm<InvoiceValues>({
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

  const items = useFieldArray({ control: form.control, name: "items" });
  const walletForm = useForm<WalletPaymentValues>({ resolver: zodResolver(walletPaymentSchema), defaultValues: { amount: "" } });

  const watchedItems = form.watch("items");
  const watchedTax = form.watch("tax_amount");
  const watchedCustomerId = form.watch("customer_id");
  const watchedIssueDate = form.watch("issue_date");
  const watchedDueDate = form.watch("due_date");
  const watchedNotes = form.watch("notes");
  const watchedTerms = form.watch("terms");

  // Calculate live totals
  const subtotal = useMemo(() => {
    return (watchedItems ?? []).reduce((acc, it) => {
      const q = parseFloat(it.quantity || "0");
      const p = parseFloat(it.unit_price || "0");
      return acc + (isNaN(q) || isNaN(p) ? 0 : q * p);
    }, 0);
  }, [watchedItems]);

  const tax = parseFloat(watchedTax || "0") || 0;
  const total = subtotal + tax;

  const close = () => {
    setIsOpen(false);
    setCurrentStep(1);
    setNewCustomerName("");
    setNewCustomerPhone("");
    setNewCustomerEmail("");
    setIsCreatingCustomerInline(false);
    form.reset();
  };

  const closePending = () => {
    setPending(null);
    walletForm.reset();
  };

  const create = useFinanceAction(
    workspaceId,
    async (values: InvoiceValues, key: string) => {
      let resolvedCustomerId = values.customer_id;
      let resolvedCustomerName: string | undefined;

      // Handle on-the-fly created customer
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
          // If customer creation fails, still attempt invoice creation with custom name if API supports it
          resolvedCustomerName = newCustomerName.trim();
        }
      } else {
        const found = customers.data?.find((item) => String(item.id) === values.customer_id);
        if (found) {
          resolvedCustomerName = found.name;
        } else if (values.customer_id && isNaN(Number(values.customer_id))) {
          // It's a typed custom name
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
    { success: "Invoice saved as draft", onDone: close },
  );

  const finalize = useFinanceAction(workspaceId, (invoice: Invoice, key: string) => financeApi.finalizeInvoice(workspaceId, invoice.id, key), {
    success: "Invoice finalized",
    onDone: closePending,
  });

  const voidInvoice = useFinanceAction(
    workspaceId,
    (invoice: Invoice, key: string) => financeApi.voidInvoice(workspaceId, invoice.id, "Voided from invoice list", key),
    { success: "Invoice voided", onDone: closePending },
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

  // Selected customer display
  const selectedCustomer = useMemo(() => {
    if (isCreatingCustomerInline && newCustomerName) {
      return { id: 0, name: newCustomerName, email: newCustomerEmail, phone: newCustomerPhone };
    }
    return customers.data?.find((c) => String(c.id) === watchedCustomerId);
  }, [customers.data, watchedCustomerId, isCreatingCustomerInline, newCustomerName, newCustomerEmail, newCustomerPhone]);

  // Step Validation
  const validateStep1 = async () => {
    const valid = await form.trigger(["items"]);
    return valid;
  };

  const validateStep2 = async () => {
    if (isCreatingCustomerInline) {
      if (!newCustomerName.trim()) {
        form.setError("customer_id", { message: "Customer name is required" });
        return false;
      }
    } else {
      const valid = await form.trigger(["customer_id", "issue_date", "due_date"]);
      if (!valid) return false;
    }
    return true;
  };

  const handleNext = async () => {
    if (currentStep === 1) {
      const ok = await validateStep1();
      if (ok) setCurrentStep(2);
    } else if (currentStep === 2) {
      const ok = await validateStep2();
      if (ok) setCurrentStep(3);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as 1 | 2);
    }
  };

  const actions = (row: Invoice) => (
    <AppRowActions
      ariaLabel="Invoice actions"
      items={[
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

  return (
    <Page>
      <PageHeader
        title="Invoices"
        description="Bills you send to customers, from draft to paid."
        actions={<AppButton startContent={<Plus weight="bold" />} label="New invoice" onPress={() => setIsOpen(true)} />}
      />

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
            action={<AppButton startContent={<Plus weight="bold" />} label="New invoice" onPress={() => setIsOpen(true)} />}
          />
        }
        columns={[
          { key: "number", label: "Invoice", render: (row) => <span className="font-medium text-foreground">{row.invoice_number}</span> },
          { key: "customer", label: "Customer", render: (row) => row.customer_name },
          { key: "due", label: "Due", render: (row) => formatDate(row.due_date) },
          { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
          { key: "paid", label: "Paid", align: "right", render: (row) => <span className="tabular">{money(row.paid_amount_minor, row)}</span> },
          { key: "total", label: "Total", align: "right", render: (row) => <span className="tabular font-semibold">{money(row.total_amount_minor, row)}</span> },
          { key: "actions", label: "", align: "right", render: actions },
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
            actions={actions(row)}
          />
        )}
      />

      {/* Multi-Step Invoice Creation Drawer */}
      <FormDrawer
        isOpen={isOpen}
        onOpenChange={(open) => !open && close()}
        title={`New Invoice — Step ${currentStep} of 3`}
        description={STEPS[currentStep - 1].description}
      >
        <div className="flex flex-col gap-6">
          {/* Step Progress Indicators */}
          <div className="flex items-center justify-between border-b border-border/40 pb-4">
            {STEPS.map((s) => {
              const isActive = currentStep === s.step;
              const isPassed = currentStep > s.step;
              return (
                <div key={s.step} className="flex items-center gap-2">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : isPassed
                          ? "bg-primary/20 text-primary font-bold"
                          : "bg-surface-secondary text-muted"
                    }`}
                  >
                    {isPassed ? "✓" : s.step}
                  </div>
                  <span
                    className={`text-xs font-medium hidden sm:inline ${
                      isActive ? "text-foreground font-semibold" : "text-muted"
                    }`}
                  >
                    {s.title}
                  </span>
                </div>
              );
            })}
          </div>

          {/* STEP 1: Items & Pricing */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[14px] font-semibold text-foreground">Line Items</p>
                <span className="text-xs text-muted">Currency: {currency}</span>
              </div>

              {items.fields.map((field, index) => (
                <div key={field.id} className="space-y-3 rounded-2xl bg-surface-secondary/70 p-4 border border-border/40">
                  <TextInputField
                    control={form.control}
                    name={`items.${index}.description`}
                    label={`Item ${index + 1} Description`}
                    placeholder="e.g. Website design or Consult"
                    isRequired
                  />
                  <div className="grid grid-cols-[1fr_2fr_auto] items-start gap-3">
                    <TextInputField
                      control={form.control}
                      name={`items.${index}.quantity`}
                      label="Qty"
                      isRequired
                    />
                    <MoneyField
                      control={form.control}
                      name={`items.${index}.unit_price`}
                      label="Unit price"
                      currency={currency}
                      isRequired
                    />
                    <div className="pt-6">
                      <AppButton
                        isIconOnly
                        variant="ghost"
                        aria-label="Remove item"
                        isDisabled={items.fields.length === 1}
                        onPress={() => items.remove(index)}
                      >
                        <Trash size={18} className="text-danger" />
                      </AppButton>
                    </div>
                  </div>
                </div>
              ))}

              <AppButton
                variant="tertiary"
                size="sm"
                startContent={<Plus weight="bold" />}
                label="Add another item"
                onPress={() => items.append(BLANK_ITEM)}
              />

              <div className="mt-4 rounded-xl bg-surface-secondary p-3 text-right">
                <span className="text-xs text-muted">Subtotal: </span>
                <span className="text-sm font-semibold text-foreground tabular">
                  {currency} {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}

          {/* STEP 2: Customer & Terms */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <AppComboBox
                  label="Customer"
                  placeholder="Search existing customer or type new..."
                  options={customerOptions}
                  selectedKey={isCreatingCustomerInline ? null : watchedCustomerId || null}
                  inputValue={isCreatingCustomerInline ? newCustomerName : undefined}
                  onSelectionChange={(key) => {
                    if (key) {
                      setIsCreatingCustomerInline(false);
                      setNewCustomerName("");
                      form.setValue("customer_id", key, { shouldValidate: true });
                    }
                  }}
                  onCustomValueSubmit={(name) => {
                    setIsCreatingCustomerInline(true);
                    setNewCustomerName(name);
                    form.setValue("customer_id", name, { shouldValidate: true });
                  }}
                  onInputChange={(val) => {
                    if (isCreatingCustomerInline) {
                      setNewCustomerName(val);
                      form.setValue("customer_id", val);
                    }
                  }}
                  allowsCustomValue={true}
                  isRequired
                />

                {isCreatingCustomerInline ? (
                  <div className="mt-3 rounded-2xl bg-primary-soft/30 p-4 border border-primary/20 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                      <UserPlus size={16} weight="bold" />
                      <span>Adding &ldquo;{newCustomerName}&rdquo; as new customer</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted block mb-1">Phone (for WhatsApp/SMS)</label>
                        <input
                          type="tel"
                          placeholder="+234..."
                          value={newCustomerPhone}
                          onChange={(e) => setNewCustomerPhone(e.target.value)}
                          className="w-full h-9 rounded-xl bg-surface-primary border border-border px-3 text-xs text-foreground focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted block mb-1">Email address</label>
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
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <TextInputField control={form.control} name="issue_date" label="Issue date" type="date" isRequired />
                <TextInputField control={form.control} name="due_date" label="Due date" type="date" isRequired />
              </div>

              <MoneyField control={form.control} name="tax_amount" label="Tax / VAT amount" currency={currency} />
              <NotesField control={form.control} name="terms" label="Payment terms" />
              <NotesField control={form.control} name="notes" label="Customer notes (optional)" />
            </div>
          )}

          {/* STEP 3: Review & Summary */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/60 bg-surface-secondary/40 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">Customer</span>
                  <span className="text-xs font-medium text-foreground">
                    {selectedCustomer?.name || watchedCustomerId || "Walk-in"}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">Issue / Due Date</span>
                  <span className="text-xs text-foreground">
                    {watchedIssueDate} → {watchedDueDate}
                  </span>
                </div>
                <div className="space-y-1.5 pt-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted block">Items</span>
                  {watchedItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-xs text-foreground">
                      <span>
                        {item.quantity}x {item.description || "Item"}
                      </span>
                      <span className="tabular font-medium">
                        {currency}{" "}
                        {(
                          (parseFloat(item.quantity || "0") || 0) * (parseFloat(item.unit_price || "0") || 0)
                        ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-border pt-2 space-y-1">
                  <div className="flex justify-between text-xs text-muted">
                    <span>Subtotal</span>
                    <span className="tabular">
                      {currency} {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  {tax > 0 && (
                    <div className="flex justify-between text-xs text-muted">
                      <span>Tax / VAT</span>
                      <span className="tabular">
                        {currency} {tax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold text-foreground pt-1 border-t border-border/40">
                    <span>Total Amount</span>
                    <span className="tabular text-primary font-bold">
                      {currency} {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {watchedTerms ? (
                <div className="rounded-xl bg-surface-secondary/70 p-3 text-xs text-muted">
                  <span className="font-semibold text-foreground block mb-0.5">Terms:</span>
                  {watchedTerms}
                </div>
              ) : null}

              <Alert
                status="info"
                description="This invoice will be saved as a draft. You can review and finalize it whenever you are ready to issue."
              />
            </div>
          )}

          {/* Wizard Footer Navigation Controls */}
          <div className="flex items-center justify-between border-t border-border/40 pt-4 mt-2">
            <div>
              {currentStep > 1 ? (
                <AppButton
                  variant="ghost"
                  startContent={<ArrowLeft size={16} />}
                  label="Back"
                  onPress={handleBack}
                />
              ) : (
                <AppButton variant="ghost" label="Cancel" onPress={close} />
              )}
            </div>

            <div className="flex items-center gap-2">
              {currentStep < 3 ? (
                <AppButton
                  variant="primary"
                  endContent={<ArrowRight size={16} />}
                  label="Next"
                  onPress={handleNext}
                />
              ) : (
                <AppButton
                  variant="primary"
                  label="Save draft invoice"
                  isLoading={create.isPending}
                  onPress={() => {
                    form.handleSubmit((values) => create.mutate(values))();
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </FormDrawer>

      <ConfirmDialog
        isOpen={pending?.kind === "finalize"}
        onOpenChange={(open) => !open && closePending()}
        title="Finalize this invoice?"
        description="It will post to your books and can no longer be edited. To correct it later you would void it."
        confirmLabel="Finalize"
        isDanger={false}
        isLoading={finalize.isPending}
        onConfirm={() => pending && finalize.mutate(pending.invoice)}
      />
      <ConfirmDialog
        isOpen={pending?.kind === "void"}
        onOpenChange={(open) => !open && closePending()}
        title="Void this invoice?"
        description="It stays in your history marked as voided, and its entries are reversed. This cannot be undone."
        confirmLabel="Void invoice"
        isLoading={voidInvoice.isPending}
        onConfirm={() => pending && voidInvoice.mutate(pending.invoice)}
      />
      <FormDrawer
        isOpen={pending?.kind === "wallet"}
        onOpenChange={(open) => !open && closePending()}
        title="Pay from customer wallet"
        description={
          pending
            ? `${pending.invoice.invoice_number}: ${money(pending.invoice.paid_amount_minor, pending.invoice)} paid of ${money(pending.invoice.total_amount_minor, pending.invoice)}.`
            : undefined
        }
        submitLabel="Confirm payment"
        isSubmitting={payFromWallet.isPending}
        onSubmit={walletForm.handleSubmit((values) => pending && payFromWallet.mutate({ invoice: pending.invoice, amount: values.amount }))}
      >
        <MoneyField
          control={walletForm.control}
          name="amount"
          label="Amount"
          currency={pending?.invoice.currency ?? currency}
          isRequired
          description="Check the wallet balance on the Wallets page first."
        />
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
