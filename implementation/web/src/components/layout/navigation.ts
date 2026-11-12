// The single source for navigation and "add" actions, shared by the sidebar,
// the add menu and the command menu.

import {
  ArrowDownLeft,
  ArrowsLeftRight,
  ArrowUpRight,
  BookOpen,
  Calculator,
  CalendarCheck,
  ChartLineUp,
  FileText,
  GearSix,
  HandCoins,
  House,
  Receipt,
  ClipboardText,
  ShoppingCart,
  Sparkle,
  SquaresFour,
  Storefront,
  Target,
  UploadSimple,
  UsersThree,
  Vault,
  Wallet,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";

import { PERMISSIONS } from "@/lib/permissions-catalog";
import type { ShellMode } from "@/stores/workspace-store";
import type { Permission } from "@/types/auth";

export interface NavItem {
  label: string;
  href: string;
  icon: PhosphorIcon;
  permission?: Permission;
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
      title: "Overview",
      items: [
        { label: "Home", href: "/dashboard", icon: House },
        { label: "Activity", href: "/transactions", icon: Receipt },
      ],
    },
    {
      title: "Plan & Track",
      items: [
        { label: "Budgets", href: "/budgets", icon: Target },
        { label: "Accounts", href: "/accounts", icon: Vault },
        { label: "Categories", href: "/categories", icon: ClipboardText },
        { label: "Reports", href: "/reports", icon: ChartLineUp },
      ],
    },
    {
      title: "Wealth & Obligations",
      items: [
        { label: "Loans", href: "/loans", icon: HandCoins },
        { label: "Investments", href: "/investments", icon: ChartLineUp },
        { label: "Assets", href: "/assets", icon: Wallet },
        { label: "Owner transfer", href: "/owner-transfers", icon: ArrowsLeftRight },
      ],
    },
  ],
  business: [
    {
      title: "Overview",
      items: [
        { label: "Home", href: "/dashboard", icon: House },
      ],
    },
    {
      title: "Money",
      items: [
        { label: "Records", href: "/transactions", icon: Receipt, permission: PERMISSIONS.MONEY_VIEW },
        { label: "Sales", href: "/sales", icon: Receipt, permission: PERMISSIONS.SALES_VIEW },
        { label: "Purchases", href: "/purchases", icon: ShoppingCart, permission: PERMISSIONS.PURCHASES_VIEW },
        { label: "Invoices", href: "/invoices", icon: FileText },
        { label: "Payments", href: "/payments", icon: HandCoins },
        { label: "Wallets", href: "/wallets", icon: Wallet },
        { label: "Accounts", href: "/accounts", icon: Vault },
        { label: "Budgets", href: "/budgets", icon: Target },
      ],
    },
    {
      title: "Operations",
      items: [
        { label: "Procurement", href: "/procurement", icon: ClipboardText, permission: PERMISSIONS.PURCHASES_VIEW },
        { label: "Inventory", href: "/inventory", icon: SquaresFour, permission: PERMISSIONS.INVENTORY_VIEW_QUANTITY },
        { label: "Storefront", href: "/store", icon: Storefront, permission: PERMISSIONS.STOREFRONT_VIEW },
        { label: "Contacts", href: "/customers", icon: UsersThree },
      ],
    },
    {
      title: "Insights",
      items: [
        { label: "Reports", href: "/reports", icon: ChartLineUp, permission: PERMISSIONS.REPORTS_VIEW_BASIC },
        { label: "Accounting reports", href: "/reports/accounting", icon: ChartLineUp, permission: PERMISSIONS.REPORTS_VIEW_ACCOUNTING },
        { label: "Ledger & Chart", href: "/ledger", icon: BookOpen, permission: PERMISSIONS.LEDGER_VIEW },
        { label: "Periods & Close", href: "/periods", icon: CalendarCheck, permission: PERMISSIONS.RECONCILIATION_VIEW },
        { label: "Tax readiness", href: "/reports/tax", icon: Calculator, permission: PERMISSIONS.REPORTS_VIEW_BASIC },
        { label: "Type what happened", href: "/capture", icon: Sparkle, permission: PERMISSIONS.AI_USE },
        { label: "CSV Imports", href: "/transactions/import", icon: UploadSimple, permission: PERMISSIONS.IMPORTS_CREATE },
        { label: "Automation & Jobs", href: "/automation", icon: GearSix, permission: PERMISSIONS.AUTOMATION_MANAGE },
      ],
    },
  ],
  all: [
    {
      title: "All spaces",
      items: [
        { label: "All summary", href: "/dashboard", icon: House },
        { label: "Owner transfer", href: "/owner-transfers", icon: ArrowsLeftRight },
        { label: "Summary reports", href: "/reports", icon: ChartLineUp },
        { label: "Records", href: "/transactions", icon: Receipt },
      ],
    },
  ],
};

const ACCOUNT_GROUP: NavGroup = {
  title: "Account",
  items: [{ label: "Settings", href: "/settings", icon: GearSix }],
};

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

export function navigationFor(mode: ShellMode, can: (permission: Permission) => boolean): NavGroup[] {
  return [...NAVIGATION[mode], ACCOUNT_GROUP]
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.permission || can(item.permission)),
    }))
    .filter((group) => group.items.length > 0);
}

export function addActionsFor(mode: ShellMode): AddAction[] {
  return mode === "business" ? BUSINESS_ADD_ACTIONS : PERSONAL_ADD_ACTIONS;
}

export function modeLabel(mode: ShellMode): string {
  return mode === "all" ? "All spaces" : mode === "personal" ? "Personal" : "Business";
}
