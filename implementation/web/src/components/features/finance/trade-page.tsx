"use client";

// Sales and purchases screen with multi-step drawer and AppComboBox inline party creation.

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, HandCoins, Plus, Receipt, ShoppingCart, UserPlus } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { AppComboBox, type AppComboBoxOption } from "@/components/ui/app-combo-box";
import { AppRowActions } from "@/components/ui/app-row-actions";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { formatDate } from "@/lib/format";
import { financeApi } from "@/lib/money";
import { tradeSchema, type TradeValues } from "@/lib/schemas/finance.schemas";
import type { Purchase, Sale } from "@/types/finance";

import { MoneyField, NotesField, SelectField, TextInputField } from "./fields";
import { PaymentDrawer, type PaymentPreset } from "./payment-drawer";
import {
  money,
  StatusBadge,
  today,
  useAccountOptions,
  useCategoryOptions,
  useContacts,
  useFinanceAction,
  useRecords,
  WorkspaceGate,
  type WorkspaceInfo,
} from "./shared";

type Kind = "sale" | "purchase";

interface TradeRow {
  id: number;
  party: string;
  date: string;
  total: Sale["total_amount_minor"];
  paid: Sale["paid_amount_minor"];
  currency: string;
  currency_exponent: number;
  status: string;
  reference?: string | null;
}

function toRow(record: Sale | Purchase): TradeRow {
  const isSale = "sale_date" in record;
  return {
    id: record.id,
    party: isSale ? record.customer_name : record.supplier_name,
    date: isSale ? record.sale_date : record.purchase_date,
    total: record.total_amount_minor,
    paid: record.paid_amount_minor,
    currency: record.currency,
    currency_exponent: record.currency_exponent,
    status: record.status,
    reference: record.reference,
  };
}

const COPY = {
  sale: {
    title: "Sales",
    description: "What you have sold, and what has been paid.",
    add: "Record sale",
    party: "Customer",
    fallbackParty: "Walk-in customer",
    accountLabel: "Paid in full into",
    emptyTitle: "No sales yet",
    emptyBody: "Record a sale to start tracking what customers owe you.",
    saved: "Sale recorded",
  },
  purchase: {
    title: "Purchases",
    description: "What you have bought, and what you still owe.",
    add: "Record purchase",
    party: "Supplier",
    fallbackParty: "Unnamed supplier",
    accountLabel: "Paid in full from",
    emptyTitle: "No purchases yet",
    emptyBody: "Record a purchase to track what you owe suppliers.",
    saved: "Purchase recorded",
  },
} as const;

function TradeContent({ workspaceId, currency, kind, startOpen }: WorkspaceInfo & { kind: Kind; startOpen: boolean }) {
  const copy = COPY[kind];
  const [isOpen, setIsOpen] = useState(startOpen);
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [payment, setPayment] = useState<PaymentPreset | undefined>();
  const records = useRecords<Sale | Purchase>(kind === "sale" ? "sales" : "purchases", workspaceId);
  const accounts = useAccountOptions(workspaceId);
  const contacts = useContacts(workspaceId, kind === "sale" ? "customers" : "suppliers");
  const categories = useCategoryOptions(workspaceId, "money_out");

  // Inline custom party creation states
  const [newPartyName, setNewPartyName] = useState("");
  const [newPartyPhone, setNewPartyPhone] = useState("");
  const [newPartyEmail, setNewPartyEmail] = useState("");
  const [isCreatingPartyInline, setIsCreatingPartyInline] = useState(false);

  const form = useForm<TradeValues>({
    resolver: zodResolver(tradeSchema),
    defaultValues: {
      party_id: "",
      party_name: "",
      date: today(),
      amount: "",
      category_id: "",
      reference: "",
      notes: "",
      account_id: "",
    },
    mode: "onChange",
  });

  const watchedPartyId = form.watch("party_id");
  const watchedDate = form.watch("date");

  const close = () => {
    setIsOpen(false);
    setCurrentStep(1);
    setIsCreatingPartyInline(false);
    setNewPartyName("");
    setNewPartyPhone("");
    setNewPartyEmail("");
    form.reset();
  };

  const create = useFinanceAction(
    workspaceId,
    async (values: TradeValues, key: string) => {
      let resolvedPartyId = values.party_id;
      let resolvedPartyName = values.party_name;

      // Handle inline contact creation if needed
      if (isCreatingPartyInline && newPartyName.trim()) {
        try {
          const contactKind = kind === "sale" ? "customers" : "suppliers";
          const created = await financeApi.createContact(workspaceId, contactKind, {
            name: newPartyName.trim(),
            phone: newPartyPhone.trim() || undefined,
            email: newPartyEmail.trim() || undefined,
          });
          if (created && typeof created === "object" && "id" in created) {
            resolvedPartyId = String((created as { id: number }).id);
            resolvedPartyName = newPartyName.trim();
          }
        } catch {
          resolvedPartyName = newPartyName.trim();
        }
      } else {
        const found = contacts.data?.find((c) => String(c.id) === values.party_id);
        if (found) {
          resolvedPartyName = found.name;
        } else if (values.party_id && isNaN(Number(values.party_id))) {
          resolvedPartyName = values.party_id;
        }
      }

      if (kind === "sale") {
        return financeApi.createSale(
          workspaceId,
          {
            customer_id: resolvedPartyId ? Number(resolvedPartyId) : undefined,
            customer_name: resolvedPartyName || copy.fallbackParty,
            sale_date: values.date,
            currency,
            amount: values.amount,
            paid_into_account_id: values.account_id ? Number(values.account_id) : undefined,
            reference: values.reference || undefined,
            notes: values.notes || undefined,
          },
          key,
        );
      }
      return financeApi.createPurchase(
        workspaceId,
        {
          supplier_id: resolvedPartyId ? Number(resolvedPartyId) : undefined,
          supplier_name: resolvedPartyName || copy.fallbackParty,
          purchase_date: values.date,
          currency,
          amount: values.amount,
          category_id: values.category_id ? Number(values.category_id) : undefined,
          paid_from_account_id: values.account_id ? Number(values.account_id) : undefined,
          reference: values.reference || undefined,
          notes: values.notes || undefined,
        },
        key,
      );
    },
    { success: copy.saved, onDone: close },
  );

  const openPayment = (row: TradeRow) =>
    setPayment({
      direction: kind === "sale" ? "incoming" : "outgoing",
      linkedType: kind,
      linkedId: row.id,
      partyName: row.party,
      summary: `${row.party}: ${money(row.paid, row)} paid of ${money(row.total, row)}.`,
    });

  // ComboBox options
  const partyOptions: AppComboBoxOption[] = useMemo(() => {
    return (contacts.data ?? []).map((c) => ({
      key: String(c.id),
      label: c.name,
      description: c.phone || c.email || undefined,
    }));
  }, [contacts.data]);

  const selectedPartyLabel = useMemo(() => {
    if (isCreatingPartyInline && newPartyName) return newPartyName;
    const found = contacts.data?.find((c) => String(c.id) === watchedPartyId);
    return found?.name || watchedPartyId || copy.fallbackParty;
  }, [contacts.data, watchedPartyId, isCreatingPartyInline, newPartyName, copy.fallbackParty]);

  const validateStep1 = async () => {
    const valid = await form.trigger(["date"]);
    return valid;
  };

  const handleNext = async () => {
    if (currentStep === 1) {
      const ok = await validateStep1();
      if (ok) setCurrentStep(2);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(1);
    }
  };

  const actions = (row: TradeRow) => (
    <AppRowActions
      ariaLabel={`${copy.party} actions`}
      items={[
        {
          key: "payment",
          label: kind === "sale" ? "Record payment" : "Pay supplier",
          icon: <HandCoins size={16} aria-hidden="true" />,
          disabled: row.status === "paid" || row.status === "cancelled",
          onClick: () => openPayment(row),
        },
      ]}
    />
  );

  return (
    <Page>
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={<AppButton startContent={<Plus weight="bold" />} label={copy.add} onPress={() => setIsOpen(true)} />}
      />
      <DataView<TradeRow>
        title={copy.title}
        rows={records.rows.map(toRow)}
        rowKey={(row) => row.id}
        isLoading={records.isPending}
        isError={records.isError}
        server={records.controls}
        searchPlaceholder={`Search ${copy.party.toLowerCase()} or reference`}
        empty={
          <EmptyState
            icon={kind === "sale" ? ShoppingCart : Receipt}
            title={copy.emptyTitle}
            description={copy.emptyBody}
            action={<AppButton startContent={<Plus weight="bold" />} label={copy.add} onPress={() => setIsOpen(true)} />}
          />
        }
        columns={[
          { key: "date", label: "Date", render: (row) => formatDate(row.date) },
          { key: "party", label: copy.party, render: (row) => <span className="font-medium text-foreground">{row.party}</span> },
          { key: "ref", label: "Reference", render: (row) => row.reference ?? "—" },
          { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
          { key: "paid", label: "Paid", align: "right", render: (row) => <span className="tabular">{money(row.paid, row)}</span> },
          { key: "total", label: "Total", align: "right", render: (row) => <span className="tabular font-semibold">{money(row.total, row)}</span> },
          { key: "actions", label: "", align: "right", render: actions },
        ]}
        renderCard={(row) => (
          <RecordCard
            icon={kind === "sale" ? <ShoppingCart size={18} aria-hidden="true" /> : <Receipt size={18} aria-hidden="true" />}
            iconClassName={kind === "sale" ? "bg-primary-soft text-primary" : "bg-warning-soft text-warning"}
            reference={row.reference ?? undefined}
            title={row.party}
            amount={money(row.total, row)}
            status={<StatusBadge status={row.status} />}
            meta={[
              { label: "Date", value: formatDate(row.date) },
              { label: "Paid", value: money(row.paid, row) },
            ]}
            actions={actions(row)}
          />
        )}
      />

      {/* Multi-Step Record Drawer */}
      <FormDrawer
        isOpen={isOpen}
        onOpenChange={(open) => !open && close()}
        title={`${copy.add} — Step ${currentStep} of 2`}
        description={currentStep === 1 ? `Who is the ${copy.party.toLowerCase()}?` : "Amount, account and notes"}
      >
        <div className="flex flex-col gap-5">
          {/* Step Progress Indicators */}
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  currentStep === 1 ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary font-bold"
                }`}
              >
                {currentStep > 1 ? "✓" : "1"}
              </div>
              <span className={`text-xs font-medium ${currentStep === 1 ? "text-foreground font-semibold" : "text-muted"}`}>
                {copy.party} & Details
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  currentStep === 2 ? "bg-primary text-primary-foreground" : "bg-surface-secondary text-muted"
                }`}
              >
                2
              </div>
              <span className={`text-xs font-medium ${currentStep === 2 ? "text-foreground font-semibold" : "text-muted"}`}>
                Amount & Payment
              </span>
            </div>
          </div>

          {/* STEP 1: Party & Date */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <AppComboBox
                label={copy.party}
                placeholder={`Search or type ${copy.party.toLowerCase()} name...`}
                options={partyOptions}
                selectedKey={isCreatingPartyInline ? null : watchedPartyId || null}
                inputValue={isCreatingPartyInline ? newPartyName : undefined}
                onSelectionChange={(key) => {
                  if (key) {
                    setIsCreatingPartyInline(false);
                    setNewPartyName("");
                    form.setValue("party_id", key, { shouldValidate: true });
                  }
                }}
                onCustomValueSubmit={(name) => {
                  setIsCreatingPartyInline(true);
                  setNewPartyName(name);
                  form.setValue("party_id", name, { shouldValidate: true });
                }}
                onInputChange={(val) => {
                  if (isCreatingPartyInline) {
                    setNewPartyName(val);
                    form.setValue("party_id", val);
                  }
                }}
                allowsCustomValue={true}
              />

              {isCreatingPartyInline && (
                <div className="rounded-2xl bg-primary-soft/30 p-3.5 border border-primary/20 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                    <UserPlus size={16} weight="bold" />
                    <span>Adding &ldquo;{newPartyName}&rdquo; as new {copy.party.toLowerCase()}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-xs text-muted block mb-1">Phone</label>
                      <input
                        type="tel"
                        placeholder="+234..."
                        value={newPartyPhone}
                        onChange={(e) => setNewPartyPhone(e.target.value)}
                        className="w-full h-8 rounded-lg bg-surface-primary border border-border px-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted block mb-1">Email</label>
                      <input
                        type="email"
                        placeholder="contact@example.com"
                        value={newPartyEmail}
                        onChange={(e) => setNewPartyEmail(e.target.value)}
                        className="w-full h-8 rounded-lg bg-surface-primary border border-border px-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                </div>
              )}

              <TextInputField control={form.control} name="date" label="Date" type="date" isRequired />
              <TextInputField control={form.control} name="reference" label="Reference / Order #" placeholder="Optional receipt or invoice #" />

              {kind === "purchase" && (
                <SelectField
                  control={form.control}
                  name="category_id"
                  label="Expense category"
                  placeholder="Choose category"
                  options={categories}
                />
              )}
            </div>
          )}

          {/* STEP 2: Amount, Account & Settlement */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="rounded-xl bg-surface-secondary/60 p-3 border border-border/40 flex justify-between items-center text-xs">
                <div>
                  <span className="text-muted block">{copy.party}</span>
                  <span className="font-semibold text-foreground">{selectedPartyLabel}</span>
                </div>
                <div className="text-right">
                  <span className="text-muted block">Date</span>
                  <span className="font-medium text-foreground">{watchedDate}</span>
                </div>
              </div>

              <MoneyField control={form.control} name="amount" label="Total amount" currency={currency} isRequired />

              <div className="space-y-1">
                <SelectField
                  control={form.control}
                  name="account_id"
                  label={copy.accountLabel}
                  placeholder="Leave blank if unpaid"
                  options={accounts.options}
                />
                <p className="text-xs text-muted">Selecting an account records full payment immediately into your books.</p>
              </div>

              <NotesField control={form.control} name="notes" label="Notes" />
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between border-t border-border/40 pt-4 mt-2">
            <div>
              {currentStep > 1 ? (
                <AppButton variant="ghost" startContent={<ArrowLeft size={16} />} label="Back" onPress={handleBack} />
              ) : (
                <AppButton variant="ghost" label="Cancel" onPress={close} />
              )}
            </div>

            <div>
              {currentStep === 1 ? (
                <AppButton variant="primary" endContent={<ArrowRight size={16} />} label="Next" onPress={handleNext} />
              ) : (
                <AppButton
                  variant="primary"
                  label={copy.add}
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

export function TradePage({ kind, startOpen = false }: { kind: Kind; startOpen?: boolean }) {
  return (
    <WorkspaceGate businessOnly>
      {(workspace) => <TradeContent key={workspace.workspaceId} {...workspace} kind={kind} startOpen={startOpen} />}
    </WorkspaceGate>
  );
}

export function SalesPage({ startOpen = false }: { startOpen?: boolean }) {
  return <TradePage kind="sale" startOpen={startOpen} />;
}

export function PurchasesPage({ startOpen = false }: { startOpen?: boolean }) {
  return <TradePage kind="purchase" startOpen={startOpen} />;
}
