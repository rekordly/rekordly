// The single source for navigation and "add" actions, shared by the sidebar,
// the add menu and the command menu.

import {
  ArrowDownLeft,
  ArrowsLeftRight,
  ArrowUpRight,
  Bell,
  ChartLineUp,
  CreditCard,
  FolderSimple,
  GearSix,
  HandCoins,
  House,
  Package,
  Receipt,
  ShoppingCart,
  Sparkle,
  UsersThree,
  SquaresFour,
  Storefront as StorefrontIcon,
  Wallet,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";

import { PERMISSIONS } from "@/lib/permissions-catalog";
import type { ShellMode } from "@/stores/workspace-store";
import type { Permission } from "@/types/auth";

export interface NavLink {
  label: string;
  href: string;
  permission?: Permission;
}

export interface NavItem {
  label: string;
  icon: PhosphorIcon;
  /** Leaf items link here. Parents use their first visible child. */
  href: string;
  permission?: Permission;
  /** Pages grouped under this item; the sidebar shows them when it is expanded. */
  children?: NavLink[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export interface AddAction {
  direction: "money_in" | "money_out" | "transfer";
  label: string;
  description: string;
  icon: PhosphorIcon;
}

const NAVIGATION: Readonly<Record<ShellMode, NavGroup[]>> = {
  personal: [
    {
      title: "Main",
      items: [
        { label: "Home", href: "/dashboard", icon: House },
        { label: "Activity", href: "/transactions", icon: Receipt },
        {
          label: "Plan & track",
          href: "/budgets",
          icon: SquaresFour,
          children: [
            { label: "Budgets", href: "/budgets" },
            { label: "Accounts", href: "/accounts" },
            { label: "Categories", href: "/categories" },
          ],
        },
        { label: "Reports", href: "/reports", icon: ChartLineUp },
        {
          label: "Wealth",
          href: "/loans",
          icon: HandCoins,
          children: [
            { label: "Loans", href: "/loans" },
            { label: "Investments", href: "/investments" },
            { label: "Assets", href: "/assets" },
            { label: "Owner transfer", href: "/owner-transfers" },
          ],
        },
      ],
    },
  ],
  business: [
    {
      title: "Main",
      items: [
        { label: "Dashboard", href: "/dashboard", icon: House },
        {
          label: "Sales",
          href: "/sales",
          icon: Receipt,
          children: [
            { label: "Sales", href: "/sales", permission: PERMISSIONS.SALES_VIEW },
            { label: "Invoices", href: "/invoices" },
            { label: "Payments", href: "/payments" },
          ],
        },
        { label: "Customers", href: "/customers", icon: UsersThree },
        {
          label: "Purchases",
          href: "/purchases",
          icon: ShoppingCart,
          children: [
            { label: "Purchases", href: "/purchases", permission: PERMISSIONS.PURCHASES_VIEW },
            { label: "Procurement", href: "/procurement", permission: PERMISSIONS.PURCHASES_VIEW },
            { label: "Purchase orders", href: "/purchase-orders", permission: PERMISSIONS.PURCHASES_VIEW },
            { label: "Bills", href: "/bills", permission: PERMISSIONS.PURCHASES_VIEW },
            { label: "Requests", href: "/purchase-requests", permission: PERMISSIONS.PURCHASES_VIEW },
          ],
        },
        {
          label: "Money",
          href: "/transactions",
          icon: Wallet,
          children: [
            { label: "Records", href: "/transactions", permission: PERMISSIONS.MONEY_VIEW },
            { label: "Accounts", href: "/accounts" },
            { label: "Wallets", href: "/wallets" },
            { label: "Budgets", href: "/budgets" },
            { label: "CSV imports", href: "/transactions/import", permission: PERMISSIONS.IMPORTS_CREATE },
          ],
        },
        {
          label: "Operations",
          href: "/products",
          icon: Package,
          children: [
            { label: "Products", href: "/products" },
            { label: "Inventory", href: "/inventory", permission: PERMISSIONS.INVENTORY_VIEW_QUANTITY },
          ],
        },
        {
          label: "Store",
          href: "/store",
          icon: StorefrontIcon,
          permission: PERMISSIONS.STOREFRONT_VIEW,
          children: [
            { label: "Overview", href: "/store" },
            { label: "Orders", href: "/store/orders" },
            { label: "Products", href: "/store/products" },
            { label: "Design", href: "/store/design" },
            { label: "Settings", href: "/store/settings" },
          ],
        },
        {
          label: "Reports",
          href: "/reports",
          icon: ChartLineUp,
          children: [
            { label: "Overview", href: "/reports", permission: PERMISSIONS.REPORTS_VIEW_BASIC },
            { label: "Accounting reports", href: "/reports/accounting", permission: PERMISSIONS.REPORTS_VIEW_ACCOUNTING },
            { label: "Tax readiness", href: "/reports/tax", permission: PERMISSIONS.REPORTS_VIEW_BASIC },
            { label: "Ledger & chart", href: "/ledger", permission: PERMISSIONS.LEDGER_VIEW },
            { label: "Periods & close", href: "/periods", permission: PERMISSIONS.RECONCILIATION_VIEW },
          ],
        },
        { label: "Type what happened", href: "/capture", icon: Sparkle, permission: PERMISSIONS.AI_USE },
        {
          label: "Files & automation",
          href: "/documents",
          icon: FolderSimple,
          children: [
            { label: "Documents & files", href: "/documents", permission: PERMISSIONS.DOCUMENTS_VIEW_ARTIFACTS },
            { label: "Automation & jobs", href: "/automation", permission: PERMISSIONS.AUTOMATION_MANAGE },
          ],
        },
      ],
    },
  ],
  all: [
    {
      title: "All spaces",
      items: [
        { label: "All summary", href: "/dashboard", icon: House },
        { label: "Records", href: "/transactions", icon: Receipt },
        { label: "Summary reports", href: "/reports", icon: ChartLineUp },
        { label: "Owner transfer", href: "/owner-transfers", icon: ArrowsLeftRight },
      ],
    },
  ],
};

/** Account pages live in the profile card at the bottom of the sidebar, not in the menu. */
const ACCOUNT_LINKS: (NavLink & { icon: PhosphorIcon })[] = [
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Plan & billing", href: "/billing", icon: CreditCard, permission: PERMISSIONS.BILLING_VIEW },
  { label: "Compare plans", href: "/plans", icon: SquaresFour, permission: PERMISSIONS.BILLING_VIEW },
  { label: "Settings", href: "/settings", icon: GearSix },
];

export function accountLinksFor(can: (permission: Permission) => boolean) {
  return ACCOUNT_LINKS.filter((link) => !link.permission || can(link.permission));
}

const PERSONAL_ADD_ACTIONS: AddAction[] = [
  { direction: "money_in", label: "Income", description: "Money you received", icon: ArrowDownLeft },
  { direction: "money_out", label: "Expense", description: "Money you spent", icon: ArrowUpRight },
  { direction: "transfer", label: "Transfer", description: "Between your accounts", icon: ArrowsLeftRight },
];

const BUSINESS_ADD_ACTIONS: AddAction[] = [
  { direction: "money_in", label: "Income", description: "Money you received", icon: ArrowDownLeft },
  { direction: "money_out", label: "Expense", description: "Money you spent", icon: ArrowUpRight },
  { direction: "transfer", label: "Transfer", description: "Move money between accounts", icon: ArrowsLeftRight },
];

/** Drops what the member cannot open; a parent left with no children disappears, and links to its first child. */
export function navigationFor(mode: ShellMode, can: (permission: Permission) => boolean): NavGroup[] {
  const allowed = (permission?: Permission) => !permission || can(permission);
  return NAVIGATION[mode]
    .map((group) => ({
      ...group,
      items: group.items.flatMap<NavItem>((item) => {
        if (!allowed(item.permission)) return [];
        if (!item.children) return [item];
        const children = item.children.filter((child) => allowed(child.permission));
        if (children.length === 0) return [];
        return [{ ...item, href: children[0].href, children }];
      }),
    }))
    .filter((group) => group.items.length > 0);
}

export function addActionsFor(mode: ShellMode): AddAction[] {
  return mode === "business" ? BUSINESS_ADD_ACTIONS : PERSONAL_ADD_ACTIONS;
}

export function modeLabel(mode: ShellMode): string {
  return mode === "all" ? "All spaces" : mode === "personal" ? "Personal" : "Business";
}

function matches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The single most specific href in the menu that contains the path, so only one row lights up. */
export function activeHrefFor(groups: NavGroup[], pathname: string): string | undefined {
  let best: string | undefined;
  for (const group of groups) {
    for (const item of group.items) {
      for (const href of item.children ? item.children.map((child) => child.href) : [item.href]) {
        if (matches(pathname, href) && (!best || href.length > best.length)) best = href;
      }
    }
  }
  return best;
}
