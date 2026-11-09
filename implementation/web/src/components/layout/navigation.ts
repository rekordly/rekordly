// The single source for navigation and "add" actions, shared by the sidebar,
// the add menu and the command menu.

import {
  Bell,
  Calculator,
  ChartLineUp,
  FileText,
  GearSix,
  HandCoins,
  House,
  Receipt,
  ShoppingCart,
  SquaresFour,
  Storefront,
  Target,
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
  label: string;
  href: string;
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
      title: "Plan",
      items: [
        { label: "Budgets", href: "/budgets", icon: Target },
        { label: "Accounts", href: "/accounts", icon: Vault },
        { label: "Reports", href: "/reports", icon: ChartLineUp },
        { label: "Tax readiness", href: "/reports/tax", icon: Calculator },
      ],
    },
  ],
  business: [
    {
      title: "Overview",
      items: [
        { label: "Home", href: "/dashboard", icon: House },
        { label: "Review", href: "/review", icon: Bell },
      ],
    },
    {
      title: "Money",
      items: [
        { label: "Money", href: "/transactions", icon: Receipt, permission: PERMISSIONS.MONEY_VIEW },
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
        { label: "Inventory", href: "/inventory", icon: SquaresFour, permission: PERMISSIONS.INVENTORY_VIEW_QUANTITY },
        { label: "Storefront", href: "/store", icon: Storefront, permission: PERMISSIONS.STOREFRONT_VIEW },
        { label: "Contacts", href: "/customers", icon: UsersThree },
      ],
    },
    {
      title: "Insights",
      items: [
        { label: "Reports", href: "/reports", icon: ChartLineUp, permission: PERMISSIONS.REPORTS_VIEW_BASIC },
        { label: "Tax readiness", href: "/reports/tax", icon: Calculator, permission: PERMISSIONS.REPORTS_VIEW_BASIC },
      ],
    },
  ],
  all: [
    {
      title: "All spaces",
      items: [
        { label: "Home", href: "/dashboard", icon: House },
        { label: "Summary", href: "/reports", icon: ChartLineUp },
        { label: "Activity", href: "/transactions", icon: Receipt },
      ],
    },
  ],
};

const ACCOUNT_GROUP: NavGroup = {
  title: "Account",
  items: [{ label: "Settings", href: "/settings", icon: GearSix }],
};

const PERSONAL_ADD_ACTIONS: AddAction[] = [
  { label: "Add income", href: "/transactions/new?type=income" },
  { label: "Add expense", href: "/transactions/new?type=expense" },
  { label: "Transfer money", href: "/transactions/new?type=transfer" },
  { label: "Import records", href: "/transactions/import" },
];

const BUSINESS_ADD_ACTIONS: AddAction[] = [
  { label: "Record money in", href: "/transactions/new?type=income" },
  { label: "Record money out", href: "/transactions/new?type=expense" },
  { label: "New sale", href: "/sales/new" },
  { label: "New invoice", href: "/invoices/new" },
  { label: "Record customer payment", href: "/sales/payments/new" },
  { label: "Add customer", href: "/customers/new" },
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
