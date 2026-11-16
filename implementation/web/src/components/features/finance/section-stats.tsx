"use client";

// Stat tiles for the sections that are not plain money lists. Each strip reuses the
// page's own query keys, so it reads from the cache instead of fetching twice.
// Every strip has exactly one bold tile.

import {
  ArrowsClockwise,
  Bank,
  BookOpen,
  CalendarCheck,
  CheckCircle,
  ClipboardText,
  Clock,
  Cube,
  Eye,
  FileText,
  FolderSimple,
  HandCoins,
  Lightning,
  Package,
  PauseCircle,
  Receipt,
  ShieldWarning,
  ShoppingCart,
  Storefront,
  Target,
  TrendUp,
  UsersThree,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";

import { KpiCard } from "@/components/ui/cards";
import { aiImportsApi, aiImportsKeys } from "@/lib/ai-imports";
import { docsSharingApi, docsSharingKeys } from "@/lib/docs-sharing";
import { ledgerApi, ledgerKeys } from "@/lib/ledger";
import { financeApi, formatMinorAmount, moneyKeys } from "@/lib/money";
import type { Budget } from "@/types/finance";

import { KpiRow, ratio, sumMinor } from "./dashboard-parts";
import { useContacts } from "./shared";

/** Formats minor amounts with the exponent the server reports for this workspace. */
function useMoney(workspaceId: number, currency: string) {
  const fromDate = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const summary = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "summary", fromDate],
    queryFn: () => financeApi.summary(workspaceId, { from_date: fromDate, currency }),
  });
  const exponent = summary.data?.currency_exponent ?? 2;
  return { summary, show: (value?: string | number) => formatMinorAmount(String(value ?? "0"), summary.data?.currency ?? currency, exponent) };
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const Row = ({ children }: { children: React.ReactNode }) => <KpiRow className="lg:grid-cols-4">{children}</KpiRow>;

/* Customers and suppliers ------------------------------------------------- */

export function ContactStats({ workspaceId, currency }: { workspaceId: number; currency: string }) {
  const customers = useContacts(workspaceId, "customers");
  const suppliers = useContacts(workspaceId, "suppliers");
  const { summary, show } = useMoney(workspaceId, currency);
  const open = summary.data?.open;
  const active = (list?: { is_active: boolean }[]) => (list ?? []).filter((contact) => contact.is_active).length;
  return (
    <Row>
      <KpiCard loading={customers.isPending} tone="accent" icon={UsersThree} label="Customers" value={String(active(customers.data))} hint="Active customers" />
      <KpiCard loading={suppliers.isPending} icon={Package} label="Suppliers" value={String(active(suppliers.data))} hint="Active suppliers" />
      <KpiCard
        loading={summary.isPending}
        icon={HandCoins}
        label="Customers owe you"
        value={show(open ? sumMinor([open.sales_unpaid_minor, open.invoices_unpaid_minor]) : "0")}
        hint="Unpaid sales and invoices"
      />
      <KpiCard loading={summary.isPending} icon={ShoppingCart} label="You owe suppliers" value={show(open?.purchases_unpaid_minor)} hint={plural(open?.purchases_unpaid_count ?? 0, "unpaid purchase")} />
    </Row>
  );
}

/* Procurement -------------------------------------------------------------- */

const OPEN_ORDER = new Set(["approved", "issued", "acknowledged", "partially_received"]);

export function ProcurementStats({ workspaceId, currency }: { workspaceId: number; currency: string }) {
  const { show } = useMoney(workspaceId, currency);
  const requests = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "purchase-requests"], queryFn: () => financeApi.listPurchaseRequests(workspaceId) });
  const orders = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "purchase-orders"], queryFn: () => financeApi.listPurchaseOrders(workspaceId) });
  const bills = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "supplier-bills"], queryFn: () => financeApi.listSupplierBills(workspaceId) });

  const waiting = (requests.data ?? []).filter((request) => request.status === "submitted").length;
  const openOrders = (orders.data ?? []).filter((order) => OPEN_ORDER.has(order.status));
  const unpaidBills = (bills.data ?? []).filter((bill) => ["approved", "partially_paid", "disputed"].includes(bill.status));
  const overdue = unpaidBills.filter((bill) => bill.overdue).length;
  return (
    <Row>
      <KpiCard
        loading={bills.isPending}
        tone="accent"
        icon={Receipt}
        label="Bills to pay"
        value={show(sumMinor(unpaidBills.map((bill) => bill.outstanding_minor)))}
        hint={plural(unpaidBills.length, "supplier bill")}
      />
      <KpiCard loading={bills.isPending} icon={Clock} label="Overdue bills" value={String(overdue)} hint={overdue ? "Past their due date" : "Nothing overdue"} />
      <KpiCard
        loading={orders.isPending}
        icon={ClipboardText}
        label="Open purchase orders"
        value={show(sumMinor(openOrders.map((order) => order.total_minor)))}
        hint={plural(openOrders.length, "order")}
      />
      <KpiCard loading={requests.isPending} icon={CheckCircle} label="Awaiting approval" value={String(waiting)} hint="Submitted purchase requests" />
    </Row>
  );
}

/* Requests, orders and bills ---------------------------------------------- */

export function PurchaseRequestStats({ workspaceId, currency }: { workspaceId: number; currency: string }) {
  const { show } = useMoney(workspaceId, currency);
  const requests = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "purchase-requests"], queryFn: () => financeApi.listPurchaseRequests(workspaceId) });
  const list = requests.data ?? [];
  const open = list.filter((request) => ["draft", "submitted", "approved"].includes(request.status));
  const waiting = list.filter((request) => request.status === "submitted").length;
  const approved = list.filter((request) => request.status === "approved").length;
  const urgent = open.filter((request) => request.priority === "urgent" || request.priority === "high").length;
  return (
    <Row>
      <KpiCard loading={requests.isPending} tone="accent" icon={ClipboardText} label="Open requests" value={show(sumMinor(open.map((request) => request.estimated_total_minor)))} hint={plural(open.length, "request")} />
      <KpiCard loading={requests.isPending} icon={Clock} label="Awaiting approval" value={String(waiting)} hint="Submitted" />
      <KpiCard loading={requests.isPending} icon={CheckCircle} label="Ready to order" value={String(approved)} hint="Approved" />
      <KpiCard loading={requests.isPending} icon={Warning} label="Urgent" value={String(urgent)} hint="High or urgent" />
    </Row>
  );
}

export function PurchaseOrderStats({ workspaceId, currency }: { workspaceId: number; currency: string }) {
  const { show } = useMoney(workspaceId, currency);
  const orders = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "purchase-orders"], queryFn: () => financeApi.listPurchaseOrders(workspaceId) });
  const list = orders.data ?? [];
  const open = list.filter((order) => OPEN_ORDER.has(order.status));
  const drafts = list.filter((order) => order.status === "draft" || order.status === "submitted").length;
  const partial = list.filter((order) => order.status === "partially_received").length;
  const received = list.filter((order) => order.status === "fully_received" || order.status === "closed").length;
  return (
    <Row>
      <KpiCard loading={orders.isPending} tone="accent" icon={ClipboardText} label="Open orders" value={show(sumMinor(open.map((order) => order.total_minor)))} hint={plural(open.length, "order")} />
      <KpiCard loading={orders.isPending} icon={FileText} label="Drafts" value={String(drafts)} hint="Not issued yet" />
      <KpiCard loading={orders.isPending} icon={Package} label="Part received" value={String(partial)} hint="Goods still due" />
      <KpiCard loading={orders.isPending} icon={CheckCircle} label="Received" value={String(received)} hint="Fully delivered" />
    </Row>
  );
}

export function SupplierBillStats({ workspaceId, currency }: { workspaceId: number; currency: string }) {
  const { show } = useMoney(workspaceId, currency);
  const bills = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "supplier-bills"], queryFn: () => financeApi.listSupplierBills(workspaceId) });
  const list = bills.data ?? [];
  const unpaid = list.filter((bill) => ["approved", "partially_paid", "disputed"].includes(bill.status));
  const overdue = unpaid.filter((bill) => bill.overdue);
  const drafts = list.filter((bill) => bill.status === "draft").length;
  const paid = list.filter((bill) => bill.status === "paid");
  return (
    <Row>
      <KpiCard loading={bills.isPending} tone="accent" icon={Receipt} label="To pay" value={show(sumMinor(unpaid.map((bill) => bill.outstanding_minor)))} hint={plural(unpaid.length, "bill")} />
      <KpiCard loading={bills.isPending} icon={Clock} label="Overdue" value={show(sumMinor(overdue.map((bill) => bill.outstanding_minor)))} hint={plural(overdue.length, "bill")} />
      <KpiCard loading={bills.isPending} icon={FileText} label="To approve" value={String(drafts)} hint="Draft bills" />
      <KpiCard loading={bills.isPending} icon={HandCoins} label="Paid" value={show(sumMinor(paid.map((bill) => bill.total_minor)))} hint={plural(paid.length, "bill")} />
    </Row>
  );
}

/* Budgets ------------------------------------------------------------------ */

export function BudgetStats({ workspaceId, currency, budgets }: { workspaceId: number; currency: string; budgets: Budget[] }) {
  const { show } = useMoney(workspaceId, currency);
  const active = budgets.filter((budget) => budget.is_active);
  const statuses = useQueries({
    queries: active.map((budget) => ({
      queryKey: [...moneyKeys.workspace(workspaceId), "budget-status", budget.id],
      queryFn: () => financeApi.budgetStatus(workspaceId, budget.id),
    })),
  });
  const loaded = statuses.map((status) => status.data).filter((status) => status !== undefined);
  const loading = statuses.some((status) => status.isPending);
  const budgeted = sumMinor(active.map((budget) => budget.amount_minor));
  const spent = sumMinor(loaded.map((status) => status.actual_spending_minor));
  const remaining = sumMinor(loaded.map((status) => status.remaining_minor));
  const over = loaded.filter((status) => status.is_over_budget).length;
  const used = Math.round(ratio(spent, budgeted) * 100);
  return (
    <Row>
      <KpiCard tone="accent" icon={Target} label="Budgeted" value={show(budgeted)} hint={plural(active.length, "active budget")} />
      <KpiCard loading={loading} icon={TrendUp} label="Spent" value={show(spent)} hint={active.length ? `${used}% of what you budgeted` : "No budgets yet"} />
      <KpiCard loading={loading} icon={CheckCircle} label="Left to spend" value={show(remaining)} hint="Across active budgets" />
      <KpiCard loading={loading} icon={Warning} label="Over budget" value={String(over)} hint={over ? "Budgets past their limit" : "All within limits"} />
    </Row>
  );
}

/* Inventory ----------------------------------------------------------------- */

export function InventoryStats({ workspaceId, currency }: { workspaceId: number; currency: string }) {
  const { show } = useMoney(workspaceId, currency);
  const items = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "catalogue"], queryFn: () => financeApi.listCatalogueItems(workspaceId) });
  const balances = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "inventory-balances"], queryFn: () => financeApi.listInventoryBalances(workspaceId) });

  const activeItems = (items.data ?? []).filter((item) => item.status === "active").length;
  const tracked = (balances.data ?? []).filter((balance) => balance.product_kind === "stock_tracked");
  const outOfStock = tracked.filter((balance) => Number(balance.available_quantity) <= 0).length;
  const units = tracked.reduce((sum, balance) => sum + Number(balance.quantity_on_hand), 0);
  return (
    <Row>
      <KpiCard loading={balances.isPending} tone="accent" icon={Cube} label="Stock value" value={show(sumMinor(tracked.map((balance) => balance.value_on_hand_minor)))} hint="At average cost" />
      <KpiCard loading={items.isPending} icon={Package} label="Active products" value={String(activeItems)} hint="Products and services" />
      <KpiCard loading={balances.isPending} icon={Lightning} label="Units on hand" value={new Intl.NumberFormat("en-NG").format(units)} hint="Across all outlets" />
      <KpiCard loading={balances.isPending} icon={WarningCircle} label="Out of stock" value={String(outOfStock)} hint={outOfStock ? "Need restocking" : "Everything in stock"} />
    </Row>
  );
}

/* Storefront ---------------------------------------------------------------- */

export function StorefrontStats({ workspaceId }: { workspaceId: number }) {
  const analytics = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "storefront-analytics"], queryFn: () => financeApi.getStorefrontAnalytics(workspaceId, 30) });
  const products = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "storefront-products"], queryFn: () => financeApi.listMerchantStorefrontProducts(workspaceId) });
  const a = analytics.data;
  const orders = (a?.orders_confirmed ?? 0) + (a?.orders_fulfilled ?? 0);
  const conversion = a && a.page_views > 0 ? `${((a.checkouts_submitted / a.page_views) * 100).toFixed(1)}%` : "—";
  return (
    <Row>
      <KpiCard loading={analytics.isPending} tone="accent" icon={Storefront} label="Orders" value={String(orders)} hint="Confirmed or fulfilled, last 30 days" />
      <KpiCard loading={analytics.isPending} icon={Eye} label="Store visits" value={new Intl.NumberFormat("en-NG").format(a?.page_views ?? 0)} hint="Page views, last 30 days" />
      <KpiCard loading={analytics.isPending} icon={TrendUp} label="Conversion" value={conversion} hint="Checkouts per visit" />
      <KpiCard
        loading={products.isPending}
        icon={Package}
        label="Products listed"
        value={String((products.data ?? []).filter((product) => product.is_published).length)}
        hint={`${(products.data ?? []).length} in your catalogue`}
      />
    </Row>
  );
}

/* Ledger -------------------------------------------------------------------- */

export function LedgerStats({ workspaceId }: { workspaceId: number }) {
  const chart = useQuery({ queryKey: ledgerKeys.chart(workspaceId), queryFn: () => ledgerApi.listChartAccounts(workspaceId) });
  const journals = useQuery({ queryKey: ledgerKeys.journals(workspaceId, "all"), queryFn: () => ledgerApi.listJournals(workspaceId, { limit: 50 }) });
  const drafts = useQuery({ queryKey: ledgerKeys.manualDrafts(workspaceId), queryFn: () => ledgerApi.listManualDrafts(workspaceId) });
  const entries = journals.data?.items ?? [];
  const reversed = entries.filter((entry) => entry.status === "reversed").length;
  const pending = (drafts.data ?? []).filter((draft) => draft.status !== "posted" && draft.status !== "rejected").length;
  return (
    <Row>
      <KpiCard loading={journals.isPending} tone="accent" icon={BookOpen} label="Recent journals" value={String(entries.length)} hint={entries.length >= 50 ? "Latest 50 entries" : "Posted entries"} />
      <KpiCard loading={chart.isPending} icon={Bank} label="Ledger accounts" value={String((chart.data ?? []).filter((account) => account.is_active).length)} hint="Active in your chart" />
      <KpiCard loading={drafts.isPending} icon={FileText} label="Manual drafts" value={String(pending)} hint="Waiting to be posted" />
      <KpiCard loading={journals.isPending} icon={ArrowsClockwise} label="Reversed" value={String(reversed)} hint="Among recent journals" />
    </Row>
  );
}

/* Periods and close --------------------------------------------------------- */

export function PeriodStats({ workspaceId }: { workspaceId: number }) {
  const periods = useQuery({ queryKey: ledgerKeys.periods(workspaceId), queryFn: () => ledgerApi.listPeriods(workspaceId) });
  const recons = useQuery({ queryKey: ledgerKeys.reconciliations(workspaceId), queryFn: () => ledgerApi.listReconciliations(workspaceId) });
  const list = periods.data ?? [];
  const openCount = list.filter((period) => period.status === "open").length;
  const closedCount = list.filter((period) => period.status === "closed" || period.status === "locked").length;
  const latest = [...(recons.data ?? [])].sort((a, b) => b.run.created_at.localeCompare(a.run.created_at))[0];
  return (
    <Row>
      <KpiCard
        loading={recons.isPending}
        tone="accent"
        icon={ShieldWarning}
        label="Last check"
        value={latest ? (latest.run.status === "passed" ? "Passed" : "Failed") : "Not run"}
        hint={latest ? `${latest.run.failed_checks} of ${latest.run.total_checks} checks failed` : "Run a reconciliation check"}
      />
      <KpiCard loading={periods.isPending} icon={CalendarCheck} label="Open periods" value={String(openCount)} hint="Still accepting records" />
      <KpiCard loading={periods.isPending} icon={CheckCircle} label="Closed periods" value={String(closedCount)} hint="Closed or locked" />
      <KpiCard loading={recons.isPending} icon={ArrowsClockwise} label="Checks run" value={String((recons.data ?? []).length)} hint="Reconciliation history" />
    </Row>
  );
}

/* Files --------------------------------------------------------------------- */

export function FileStats({ workspaceId }: { workspaceId: number }) {
  const files = useQuery({ queryKey: docsSharingKeys.files(workspaceId), queryFn: () => docsSharingApi.listFiles(workspaceId) });
  const list = (files.data ?? []).filter((file) => file.deletion_status === "active");
  const bytes = list.reduce((sum, file) => sum + file.byte_size, 0);
  const size = bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
  return (
    <Row>
      <KpiCard loading={files.isPending} tone="accent" icon={FolderSimple} label="Files" value={String(list.length)} hint="Receipts, invoices and documents" />
      <KpiCard loading={files.isPending} icon={Cube} label="Storage used" value={size} hint="Active files" />
      <KpiCard loading={files.isPending} icon={Clock} label="Being checked" value={String(list.filter((file) => file.scan_status === "pending").length)} hint="Virus scan pending" />
      <KpiCard loading={files.isPending} icon={ShieldWarning} label="Quarantined" value={String(list.filter((file) => file.scan_status === "quarantined").length)} hint="Blocked by the scan" />
    </Row>
  );
}

/* Automation ---------------------------------------------------------------- */

export function AutomationStats({ workspaceId }: { workspaceId: number }) {
  const automations = useQuery({ queryKey: aiImportsKeys.automations(workspaceId), queryFn: () => aiImportsApi.listAutomations(workspaceId) });
  const failed = useQuery({ queryKey: aiImportsKeys.failedJobs(workspaceId), queryFn: () => aiImportsApi.listFailedJobs(workspaceId) });
  const rules = automations.data?.rules ?? [];
  const enabled = rules.filter((rule) => rule.is_enabled).length;
  const openFailures = (failed.data ?? []).filter((job) => job.status === "open").length;
  return (
    <Row>
      <KpiCard loading={automations.isPending} tone="accent" icon={Lightning} label="Active rules" value={String(enabled)} hint={plural(rules.length, "rule")} />
      <KpiCard loading={automations.isPending} icon={PauseCircle} label="Paused rules" value={String(rules.length - enabled)} hint="Not running" />
      <KpiCard loading={automations.isPending} icon={ArrowsClockwise} label="Recent runs" value={String((automations.data?.executions ?? []).length)} hint="Rule executions" />
      <KpiCard loading={failed.isPending} icon={WarningCircle} label="Failed jobs" value={String(openFailures)} hint={openFailures ? "Need a retry or review" : "Nothing failing"} />
    </Row>
  );
}
