"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowsClockwise, CheckCircle, Eye, FileCsv, Plus, Tag, Vault } from "@phosphor-icons/react";
import { toast } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { AppRowActions } from "@/components/ui/app-row-actions";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader, Segmented, StatusPill } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { capitalise } from "@/lib/format";
import { financeApi, formatMinorAmount, moneyApi, moneyKeys } from "@/lib/money";
import { accountSchema, categorySchema, type AccountValues, type CategoryValues } from "@/lib/schemas/finance.schemas";
import type { BankLine, BankReconDetail, BankReconciliation, MoneyAccount, MoneyCategory } from "@/types/finance";

import { MoneyField, SelectField, TextInputField } from "./fields";
import { money, useFinanceAction, WorkspaceGate, type WorkspaceInfo } from "./shared";

const TABS = [
  { key: "accounts", label: "Accounts" },
  { key: "categories", label: "Categories" },
  { key: "reconciliation", label: "Bank & Cash Reconciliation" },
] as const;

const ACCOUNT_TYPES = [
  { key: "cash", label: "Cash" },
  { key: "bank", label: "Bank" },
  { key: "mobile_wallet", label: "Mobile wallet" },
  { key: "clearing", label: "Clearing" },
  { key: "other", label: "Other" },
];

const CATEGORY_USES = [
  { key: "money_out", label: "Money out" },
  { key: "money_in", label: "Money in" },
  { key: "both", label: "Both" },
];

function typeLabel(type: string) {
  return capitalise(type.replace(/_/g, " "));
}

function AccountsContent({ workspaceId, currency, isBusiness }: WorkspaceInfo) {
  const [tab, setTab] = useState<"accounts" | "categories" | "reconciliation">("accounts");
  const [drawer, setDrawer] = useState<"account" | "category" | "recon" | null>(null);
  const accounts = useQuery({ queryKey: moneyKeys.accounts(workspaceId), queryFn: () => moneyApi.listAccounts({ workspaceId }) });
  const categories = useQuery({ queryKey: moneyKeys.categories(workspaceId, "all"), queryFn: () => moneyApi.listCategories({ workspaceId }) });
  const reconciliations = useQuery({
    queryKey: ["reconciliations", workspaceId],
    queryFn: () => financeApi.listReconciliations(workspaceId),
  });

  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [reconType, setReconType] = useState<"bank" | "cash">("bank");
  const [statementDate, setStatementDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [statementBalance, setStatementBalance] = useState<string>("");
  const [reconNotes, setReconNotes] = useState<string>("");

  const [activeRecon, setActiveRecon] = useState<BankReconDetail | null>(null);
  const [bankLines, setBankLines] = useState<BankLine[]>([]);
  const [isReconBusy, setIsReconBusy] = useState(false);

  const accountForm = useForm<AccountValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: { name: "", account_type: "bank", opening_balance: "" },
  });
  const categoryForm = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: "", direction: "money_out" },
  });

  const closeDrawer = () => {
    setDrawer(null);
    accountForm.reset();
    categoryForm.reset();
    setReconNotes("");
  };

  const createAccount = useFinanceAction(
    workspaceId,
    (values: AccountValues) =>
      financeApi.createAccount(workspaceId, { ...values, currency, opening_balance: values.opening_balance || undefined, is_active: true }),
    { success: "Account added", onDone: closeDrawer },
  );
  const createCategory = useFinanceAction(
    workspaceId,
    (values: CategoryValues) =>
      financeApi.createCategory(workspaceId, {
        ...values,
        scope: isBusiness ? "business" : "personal",
        account_class: values.direction === "money_in" ? "income" : "expense",
      }),
    { success: "Category added", onDone: closeDrawer },
  );

  const startReconciliationAction = useFinanceAction(
    workspaceId,
    async (_: void) => {
      if (!selectedAccountId) throw new Error("Select an account to reconcile");
      const minor = Math.round(parseFloat(statementBalance || "0") * 100);
      return financeApi.startReconciliation(workspaceId, {
        money_account_id: Number(selectedAccountId),
        statement_date: statementDate,
        statement_balance_minor: minor,
        reconciliation_type: reconType,
        notes: reconNotes || undefined,
      });
    },
    {
      success: "Reconciliation period started",
      onDone: async () => {
        closeDrawer();
        reconciliations.refetch();
      },
    },
  );

  const openReconWorkspace = async (recon: BankReconciliation) => {
    setIsReconBusy(true);
    try {
      const [detail, lines] = await Promise.all([
        financeApi.getReconciliation(workspaceId, recon.id),
        financeApi.listBankLines(workspaceId, recon.money_account_id),
      ]);
      setActiveRecon(detail);
      setBankLines(lines);
    } catch (err: unknown) {
      toast.danger(err instanceof Error ? err.message : "Failed to load reconciliation details");
    } finally {
      setIsReconBusy(false);
    }
  };

  const toggleTxMatch = async (reconId: number, txId: number, currentlyMatched: boolean) => {
    setIsReconBusy(true);
    try {
      if (currentlyMatched) {
        await financeApi.unmatchReconciliationTransaction(workspaceId, reconId, txId);
      } else {
        await financeApi.matchReconciliationTransaction(workspaceId, reconId, txId);
      }
      const updated = await financeApi.getReconciliation(workspaceId, reconId);
      setActiveRecon(updated);
      reconciliations.refetch();
    } catch (err: unknown) {
      toast.danger(err instanceof Error ? err.message : "Failed to update match status");
    } finally {
      setIsReconBusy(false);
    }
  };

  const handleImportBankLinesCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeRecon) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = String(ev.target?.result ?? "");
        const rows = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (rows.length < 2) {
          toast.danger("CSV requires a header row and at least 1 transaction line");
          return;
        }
        const parsed: Array<{
          transaction_date: string;
          description: string;
          reference?: string;
          direction: "money_in" | "money_out";
          amount_minor: number;
        }> = [];
        for (let i = 1; i < rows.length; i++) {
          const parts = rows[i].split(",").map((p) => p.trim().replace(/^["']|["']$/g, ""));
          if (parts.length < 3) continue;
          let rawAmt = parts[2] || "0";
          let direction: "money_in" | "money_out" = "money_out";
          if (rawAmt.startsWith("-")) {
            rawAmt = rawAmt.slice(1);
            direction = "money_out";
          } else if (parts[3]?.toLowerCase() === "credit" || parts[3]?.toLowerCase() === "money_in") {
            direction = "money_in";
          }
          const minor = Math.round(parseFloat(rawAmt) * 100);
          if (isNaN(minor) || minor <= 0) continue;
          parsed.push({
            transaction_date: parts[0],
            description: parts[1],
            direction,
            amount_minor: minor,
            reference: parts[4] || undefined,
          });
        }
        if (parsed.length === 0) {
          toast.danger("No valid lines found in CSV");
          return;
        }
        const res = await financeApi.importBankLines(workspaceId, {
          money_account_id: activeRecon.reconciliation.money_account_id,
          file_name: file.name,
          lines: parsed,
        });
        setBankLines(res.lines || []);
        toast.success(`Imported ${res.lines?.length ?? 0} statement lines with auto-match hints`);
      } catch (err: unknown) {
        toast.danger(err instanceof Error ? err.message : "Failed to import statement CSV");
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmBankLineMatch = async (line: BankLine) => {
    if (!activeRecon || !line.matched_transaction_id) return;
    setIsReconBusy(true);
    try {
      await financeApi.matchBankLine(workspaceId, line.id, {
        transaction_id: line.matched_transaction_id,
        status: "matched",
      });
      await financeApi.matchReconciliationTransaction(
        workspaceId,
        activeRecon.reconciliation.id,
        line.matched_transaction_id,
      );
      const [updatedDetail, updatedLines] = await Promise.all([
        financeApi.getReconciliation(workspaceId, activeRecon.reconciliation.id),
        financeApi.listBankLines(workspaceId, activeRecon.reconciliation.money_account_id),
      ]);
      setActiveRecon(updatedDetail);
      setBankLines(updatedLines);
      reconciliations.refetch();
      toast.success("Statement line matched to ledger transaction");
    } catch (err: unknown) {
      toast.danger(err instanceof Error ? err.message : "Failed to match statement line");
    } finally {
      setIsReconBusy(false);
    }
  };

  const completeReconAction = useFinanceAction(
    workspaceId,
    (reconId: number) => financeApi.completeReconciliation(workspaceId, reconId),
    {
      success: "Reconciliation completed and balanced",
      onDone: async () => {
        reconciliations.refetch();
        if (activeRecon) {
          const refreshed = await financeApi.getReconciliation(workspaceId, activeRecon.reconciliation.id);
          setActiveRecon(refreshed);
        }
      },
    },
  );

  const accountName = (id: number) => accounts.data?.find((a) => a.id === id)?.name ?? `Account #${id}`;

  return (
    <Page>
      <PageHeader
        title="Accounts"
        description="Where your money lives, how you group it, and how you reconcile statements."
        actions={
          tab === "accounts" ? (
            <AppButton startContent={<Plus weight="bold" />} label="Add account" onPress={() => setDrawer("account")} />
          ) : tab === "categories" ? (
            <AppButton startContent={<Plus weight="bold" />} label="Add category" onPress={() => setDrawer("category")} />
          ) : (
            <AppButton startContent={<Plus weight="bold" />} label="Start reconciliation" onPress={() => setDrawer("recon")} />
          )
        }
      />

      <Segmented aria-label="Accounts sections" options={TABS} value={tab} onChange={setTab} />

      {tab === "accounts" ? (
        <DataView<MoneyAccount>
          key="accounts"
          title="Money accounts"
          searchPlaceholder="Search accounts"
          getSearchText={(row) => `${row.name} ${row.account_type}`}
          rows={accounts.data ?? []}
          rowKey={(row) => row.id}
          isLoading={accounts.isPending}
          isError={accounts.isError}
          empty={
            <EmptyState
              icon={Vault}
              title="No accounts yet"
              description="Add the cash till, bank or wallet you take money through."
              action={<AppButton startContent={<Plus weight="bold" />} label="Add account" onPress={() => setDrawer("account")} />}
            />
          }
          columns={[
            { key: "name", label: "Name", render: (row) => <span className="font-medium text-foreground">{row.name}</span> },
            { key: "type", label: "Type", render: (row) => typeLabel(row.account_type) },
            {
              key: "state",
              label: "Status",
              render: (row) => <StatusPill tone={row.is_active ? "success" : "neutral"}>{row.is_active ? "Active" : "Inactive"}</StatusPill>,
            },
            {
              key: "balance",
              label: "Balance",
              align: "right",
              render: (row) => <span className="tabular font-semibold">{money(row.current_balance_minor, row)}</span>,
            },
          ]}
          renderCard={(row) => (
            <RecordCard
              icon={<Vault size={18} aria-hidden="true" />}
              iconClassName="bg-primary-soft text-primary"
              reference={typeLabel(row.account_type)}
              title={row.name}
              amount={money(row.current_balance_minor, row)}
              status={<StatusPill tone={row.is_active ? "success" : "neutral"}>{row.is_active ? "Active" : "Inactive"}</StatusPill>}
            />
          )}
        />
      ) : tab === "categories" ? (
        <DataView<MoneyCategory>
          key="categories"
          title="Categories"
          searchPlaceholder="Search categories"
          getSearchText={(row) => row.name}
          rows={categories.data ?? []}
          rowKey={(row) => row.id}
          isLoading={categories.isPending}
          isError={categories.isError}
          empty={<EmptyState icon={Tag} title="No categories yet" description="Add groups like Rent or Supplies to see where money goes." />}
          columns={[
            { key: "name", label: "Name", render: (row) => <span className="font-medium text-foreground">{row.name}</span> },
            { key: "use", label: "Used for", render: (row) => typeLabel(row.direction) },
            { key: "scope", label: "Space", render: (row) => capitalise(row.scope) },
          ]}
          renderCard={(row) => (
            <RecordCard icon={<Tag size={18} aria-hidden="true" />} reference={capitalise(row.scope)} title={row.name} amount={typeLabel(row.direction)} />
          )}
        />
      ) : (
        <DataView<BankReconciliation>
          key="reconciliations"
          title="Bank & Cash Reconciliations"
          searchPlaceholder="Search reconciliations"
          getSearchText={(row) => `${row.statement_date} ${row.status} ${accountName(row.money_account_id)}`}
          rows={reconciliations.data ?? []}
          rowKey={(row) => row.id}
          isLoading={reconciliations.isPending}
          isError={reconciliations.isError}
          empty={
            <EmptyState
              icon={ArrowsClockwise}
              title="No reconciliations yet"
              description="Start a bank or cash count reconciliation to match statements with your ledger."
              action={<AppButton startContent={<Plus weight="bold" />} label="Start reconciliation" onPress={() => setDrawer("recon")} />}
            />
          }
          columns={[
            { key: "account", label: "Account", render: (row) => <span className="font-medium text-foreground">{accountName(row.money_account_id)}</span> },
            { key: "type", label: "Mode", render: (row) => <span className="uppercase text-[11px] font-semibold text-muted">{row.reconciliation_type || "bank"}</span> },
            { key: "date", label: "Statement Date", render: (row) => row.statement_date },
            {
              key: "statement_balance",
              label: "Statement / Counted",
              align: "right",
              render: (row) => <span className="font-mono">{money(row.statement_balance_minor, { currency, currency_exponent: 2 })}</span>,
            },
            {
              key: "ledger_balance",
              label: "Ledger Balance",
              align: "right",
              render: (row) => <span className="font-mono">{money(row.ledger_balance_minor, { currency, currency_exponent: 2 })}</span>,
            },
            {
              key: "difference",
              label: "Difference",
              align: "right",
              render: (row) => (
                <span className={`font-mono font-bold ${Number(row.difference_minor) === 0 ? "text-emerald-500" : "text-rose-500"}`}>
                  {money(row.difference_minor, { currency, currency_exponent: 2 })}
                </span>
              ),
            },
            {
              key: "status",
              label: "Status",
              render: (row) => <StatusPill tone={row.status === "reconciled" ? "success" : "neutral"}>{row.status}</StatusPill>,
            },
            {
              key: "actions",
              label: "",
              align: "right",
              render: (row) => (
                <AppRowActions
                  ariaLabel="Reconciliation actions"
                  items={[
                    {
                      key: "inspect",
                      label: row.status === "reconciled" ? "View summary" : "Match & Complete",
                      icon: <Eye size={16} aria-hidden="true" />,
                      onClick: () => openReconWorkspace(row),
                    },
                    {
                      key: "complete",
                      label: "Mark reconciled",
                      icon: <CheckCircle size={16} aria-hidden="true" />,
                      disabled: row.status !== "in_progress" || Number(row.difference_minor) !== 0,
                      onClick: () => completeReconAction.mutate(row.id),
                    },
                  ]}
                />
              ),
            },
          ]}
          renderCard={(row) => (
            <RecordCard
              icon={<ArrowsClockwise size={18} aria-hidden="true" />}
              reference={`${accountName(row.money_account_id)} • ${row.reconciliation_type || "bank"}`}
              title={`Statement Date: ${row.statement_date}`}
              amount={money(row.statement_balance_minor, { currency, currency_exponent: 2 })}
              status={<StatusPill tone={row.status === "reconciled" ? "success" : "neutral"}>{row.status}</StatusPill>}
              actions={
                <AppButton size="sm" variant="ghost" startContent={<Eye size={14} />} label="Match" onPress={() => openReconWorkspace(row)} />
              }
            />
          )}
        />
      )}

      {/* ADD ACCOUNT DRAWER */}
      <FormDrawer
        isOpen={drawer === "account"}
        onOpenChange={(open) => !open && closeDrawer()}
        title="Add account"
        description="A cash till, bank account or wallet."
        submitLabel="Add account"
        isSubmitting={createAccount.isPending}
        onSubmit={accountForm.handleSubmit((values) => createAccount.mutate(values))}
      >
        <TextInputField control={accountForm.control} name="name" label="Account name" placeholder="GTBank current" isRequired />
        <SelectField control={accountForm.control} name="account_type" label="Type" options={ACCOUNT_TYPES} isRequired />
        <MoneyField control={accountForm.control} name="opening_balance" label="Opening balance" currency={currency} description="What is in this account today. You can leave it empty." />
      </FormDrawer>

      {/* ADD CATEGORY DRAWER */}
      <FormDrawer
        isOpen={drawer === "category"}
        onOpenChange={(open) => !open && closeDrawer()}
        title="Add category"
        submitLabel="Add category"
        isSubmitting={createCategory.isPending}
        onSubmit={categoryForm.handleSubmit((values) => createCategory.mutate(values))}
      >
        <TextInputField control={categoryForm.control} name="name" label="Category name" placeholder="Supplies" isRequired />
        <SelectField control={categoryForm.control} name="direction" label="Used for" options={CATEGORY_USES} isRequired />
      </FormDrawer>

      {/* START RECONCILIATION DRAWER */}
      <FormDrawer
        isOpen={drawer === "recon"}
        onOpenChange={(open) => !open && closeDrawer()}
        title="Start Bank or Cash Reconciliation"
        description="Verify your bank statement or physical cash count against the system ledger."
        submitLabel="Start Reconciliation"
        isSubmitting={startReconciliationAction.isPending}
        onSubmit={(e) => {
          e.preventDefault();
          startReconciliationAction.mutate(undefined);
        }}
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Reconciliation Mode</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setReconType("bank")}
                className={`h-10 rounded-xl border text-xs font-semibold transition-colors ${
                  reconType === "bank" ? "border-primary bg-primary-soft text-primary" : "border-border text-muted"
                }`}
              >
                Bank Statement
              </button>
              <button
                type="button"
                onClick={() => setReconType("cash")}
                className={`h-10 rounded-xl border text-xs font-semibold transition-colors ${
                  reconType === "cash" ? "border-primary bg-primary-soft text-primary" : "border-border text-muted"
                }`}
              >
                Physical Cash Count
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Select Account</label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Select an account...</option>
              {(accounts.data || []).map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({money(acc.current_balance_minor, acc)})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">
              {reconType === "cash" ? "Count Date" : "Statement Ending Date"}
            </label>
            <input
              type="date"
              value={statementDate}
              onChange={(e) => setStatementDate(e.target.value)}
              className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">
              {reconType === "cash" ? "Physical Counted Balance" : "Statement Ending Balance"}
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={statementBalance}
              onChange={(e) => setStatementBalance(e.target.value)}
              className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <p className="text-[11px] text-muted">
              {reconType === "cash"
                ? "Enter total cash counted physically in the register or safe."
                : "The closing balance shown on your official bank statement."}
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Notes (Optional)</label>
            <input
              type="text"
              placeholder="e.g. October closing verification"
              value={reconNotes}
              onChange={(e) => setReconNotes(e.target.value)}
              className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
      </FormDrawer>

      {/* ACTIVE RECONCILIATION MATCH & COMPLETE DRAWER */}
      <FormDrawer
        isOpen={activeRecon !== null}
        onOpenChange={(open) => !open && setActiveRecon(null)}
        title={activeRecon ? `Reconcile ${accountName(activeRecon.reconciliation.money_account_id)}` : "Reconciliation"}
        description={activeRecon ? `Statement Date: ${activeRecon.reconciliation.statement_date}` : undefined}
      >
        {activeRecon && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border/60 bg-surface-secondary/30 p-4 text-xs">
              <div>
                <span className="text-muted block">Statement / Counted</span>
                <span className="font-mono font-bold text-foreground">
                  {formatMinorAmount(activeRecon.reconciliation.statement_balance_minor, currency, 2)}
                </span>
              </div>
              <div>
                <span className="text-muted block">Ledger Balance</span>
                <span className="font-mono font-bold text-foreground">
                  {formatMinorAmount(activeRecon.reconciliation.ledger_balance_minor, currency, 2)}
                </span>
              </div>
              <div>
                <span className="text-muted block">Cleared Transactions Net</span>
                <span className="font-mono font-semibold text-foreground">
                  {formatMinorAmount(activeRecon.reconciliation.cleared_balance_minor ?? 0, currency, 2)}
                </span>
              </div>
              <div>
                <span className="text-muted block">Variance</span>
                <span
                  className={`font-mono font-bold ${
                    Number(activeRecon.reconciliation.difference_minor) === 0 ? "text-emerald-500" : "text-rose-500"
                  }`}
                >
                  {formatMinorAmount(activeRecon.reconciliation.difference_minor, currency, 2)}
                </span>
              </div>
            </div>

            {Number(activeRecon.reconciliation.difference_minor) !== 0 && activeRecon.reconciliation.status === "in_progress" && (
              <Alert
                status="warning"
                description="Reconciliation requires zero difference between statement/counted balance and ledger (or exact cleared transactions total) before completion. Record missing fees/deposits or match statement lines below."
              />
            )}

            {/* Statement Lines Import & Auto-Suggestions */}
            {activeRecon.reconciliation.reconciliation_type !== "cash" && activeRecon.reconciliation.status === "in_progress" && (
              <div className="space-y-2 rounded-2xl border border-border/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <FileCsv size={16} className="text-primary" /> Bank Statement Lines ({bankLines.length})
                  </span>
                  <label className="cursor-pointer text-[11px] font-semibold text-primary hover:underline">
                    Upload CSV
                    <input type="file" accept=".csv" onChange={handleImportBankLinesCSV} className="hidden" />
                  </label>
                </div>
                {bankLines.length > 0 && (
                  <div className="max-h-40 overflow-y-auto space-y-1.5">
                    {bankLines.slice(0, 15).map((ln) => (
                      <div key={ln.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface-secondary/40 px-2.5 py-2 text-[11px]">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-foreground truncate">{ln.description}</div>
                          <div className="text-muted font-mono">
                            {ln.transaction_date} • {formatMinorAmount(ln.amount_minor, currency, 2)} ({ln.match_status})
                          </div>
                        </div>
                        {ln.match_status === "suggested" && ln.matched_transaction_id ? (
                          <AppButton
                            size="sm"
                            variant="secondary"
                            label="Confirm Match"
                            isDisabled={isReconBusy}
                            onPress={() => handleConfirmBankLineMatch(ln)}
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Posted Account Transactions Checklist */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Posted Ledger Entries ({activeRecon.transactions.length})
                </h4>
              </div>
              {activeRecon.transactions.length === 0 ? (
                <p className="text-xs text-muted py-4 text-center">No posted transactions found up to this statement date.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-1.5 rounded-2xl border border-border/40 p-2">
                  {activeRecon.transactions.map((tx) => (
                    <label
                      key={tx.id}
                      className={`flex items-center justify-between gap-2 rounded-xl p-2.5 text-xs cursor-pointer transition-colors ${
                        tx.matched ? "bg-primary-soft/40 border border-primary/30" : "hover:bg-surface-secondary/40"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={tx.matched}
                          disabled={activeRecon.reconciliation.status !== "in_progress" || isReconBusy}
                          onChange={() => toggleTxMatch(activeRecon.reconciliation.id, tx.id, tx.matched)}
                          className="rounded border-border text-primary"
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-foreground truncate">
                            {tx.party_name || tx.notes || tx.reference || typeLabel(tx.direction)}
                          </div>
                          <div className="text-[11px] text-muted font-mono">{tx.effective_date}</div>
                        </div>
                      </div>
                      <span className={`font-mono font-bold shrink-0 ${tx.signed_minor >= 0 ? "text-emerald-600" : "text-foreground"}`}>
                        {tx.signed_minor >= 0 ? "+" : ""}
                        {formatMinorAmount(tx.signed_minor, tx.currency || currency, 2)}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {activeRecon.reconciliation.status === "in_progress" && (
              <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
                <AppButton
                  startContent={<CheckCircle size={16} />}
                  label="Complete Reconciliation"
                  isLoading={completeReconAction.isPending}
                  onPress={() => completeReconAction.mutate(activeRecon.reconciliation.id)}
                />
              </div>
            )}
          </div>
        )}
      </FormDrawer>
    </Page>
  );
}

export function AccountsPage() {
  return (
    <WorkspaceGate>{(workspace) => <AccountsContent key={workspace.workspaceId} {...workspace} />}</WorkspaceGate>
  );
}
