import { Icon } from '@phosphor-icons/react';
import {
  House,
  FileText,
  ShoppingCart,
  Receipt,
  Users,
  TrendDown,
  TrendUp,
  Wallet,
  Buildings,
  ChartLine,
  Bank,
  Shield,
  Bell,
  User,
  CurrencyDollar,
  Money,
  UserCheck,
  Package,
  Wrench,
  Storefront,
  CreditCard,
  GasPump,
  Plugs,
  Briefcase,
  ArrowCircleUp,
  ArrowCircleDown,
} from '@phosphor-icons/react/dist/ssr';

export interface SubMenuItem {
  name: string;
  href?: string;
  icon: Icon;
  iconColor?: string;
  action?: 'modal' | 'drawer';
  actionType?: string;
}

export interface MenuItem {
  name: string;
  href?: string;
  icon: Icon;
  iconColor?: string;
  subItems?: SubMenuItem[];
  action?: 'modal' | 'drawer';
  actionType?: string;
}

export const menuItems: MenuItem[] = [
  // Dashboard
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: House,
    iconColor: '#3b82f6', // blue
  },

  // Income - Now a drawer action
  // {
  //   name: 'Income',
  //   icon: ArrowCircleUp,
  //   iconColor: '#10b981', // green
  //   action: 'drawer',
  //   actionType: 'income',
  // },
  {
    name: 'Income',
    href: '/dashboard/income',
    icon: ArrowCircleUp,
    iconColor: '#10b981',
  },

  // Single menu items (previously under Income)
  {
    name: 'Sales',
    href: '/dashboard/sales',
    icon: CurrencyDollar,
    iconColor: '#8b5cf6', // purple
  },
  {
    name: 'Invoices',
    href: '/dashboard/invoices',
    icon: Receipt,
    iconColor: '#f59e0b', // amber
  },
  {
    name: 'Quotations',
    href: '/dashboard/quotations',
    icon: FileText,
    iconColor: '#06b6d4', // cyan
  },

  // Production submenu
  {
    name: 'Production',
    icon: Wrench,
    iconColor: '#f97316', // orange
    subItems: [
      {
        name: 'Product Templates',
        href: '/dashboard/productions/templates',
        icon: Package,
        iconColor: '#f97316',
      },
      {
        name: 'Production Orders',
        href: '/dashboard/productions/',
        icon: Wrench,
        iconColor: '#ea580c',
      },
    ],
  },

  // Expenses submenu (excluding Purchase)
  {
    name: 'Expenses',
    icon: ArrowCircleDown,
    iconColor: '#ef4444', // red
    subItems: [
      {
        name: 'Salaries',
        icon: UserCheck,
        iconColor: '#ec4899', // pink
        action: 'drawer',
        actionType: 'salary-expense',
      },
      {
        name: 'Rent Payment',
        icon: Buildings,
        iconColor: '#8b5cf6', // purple
        action: 'drawer',
        actionType: 'rent',
      },
      {
        name: 'Utilities',
        icon: Plugs,
        iconColor: '#eab308', // yellow
        action: 'drawer',
        actionType: 'utilities',
      },
      {
        name: 'Fuel',
        icon: GasPump,
        iconColor: '#f97316', // orange
        action: 'drawer',
        actionType: 'fuel',
      },
    ],
  },

  // Single menu items
  {
    name: 'Purchases',
    href: '/dashboard/purchases',
    icon: ShoppingCart,
    iconColor: '#a855f7', // purple
  },
  {
    name: 'Inventory',
    href: '/dashboard/inventory',
    icon: Package,
    iconColor: '#14b8a6', // teal
  },
  {
    name: 'Storefront',
    href: '/dashboard/storefront',
    icon: Storefront,
    iconColor: '#6366f1', // indigo
  },
  {
    name: 'Loans',
    href: '/dashboard/loans',
    icon: Wallet,
    iconColor: '#84cc16', // lime
  },

  // Salary Payment
  // {
  //   name: 'Salary Payment',
  //   icon: Money,
  //   iconColor: '#22c55e', // green
  //   action: 'drawer',
  //   actionType: 'salary-payment',
  // },

  // Reports Section
  {
    name: 'Reports',
    icon: ChartLine,
    iconColor: '#0ea5e9', // sky
    subItems: [
      {
        name: 'Profit & Loss',
        href: '/dashboard/reports/pnl',
        icon: TrendUp,
        iconColor: '#10b981',
      },
      {
        name: 'Balance Sheet',
        href: '/dashboard/reports/balance-sheet',
        icon: Bank,
        iconColor: '#3b82f6',
      },
      {
        name: 'Cash Flow',
        href: '/dashboard/reports/cashflow',
        icon: ChartLine,
        iconColor: '#06b6d4',
      },
      {
        name: 'Revenue',
        href: '/dashboard/reports/revenue',
        icon: TrendUp,
        iconColor: '#10b981',
      },
      {
        name: 'Expense Report',
        href: '/dashboard/reports/expenses',
        icon: TrendDown,
        iconColor: '#ef4444',
      },
      {
        name: 'Asset Report',
        href: '/dashboard/reports/assets',
        icon: Buildings,
        iconColor: '#8b5cf6',
      },
      {
        name: 'Tax Report',
        href: '/dashboard/reports/tax',
        icon: FileText,
        iconColor: '#f59e0b',
      },
    ],
  },

  // Customers
  {
    name: 'Customers',
    href: '/dashboard/customers',
    icon: Users,
    iconColor: '#ec4899', // pink
  },

  // Profile (single item instead of Account submenu)
  {
    name: 'Profile',
    href: '/dashboard/profile',
    icon: User,
    iconColor: '#64748b', // slate
  },
];

// Type guard to check if a menu item has an action
export function hasAction(item: SubMenuItem | MenuItem): item is (
  | SubMenuItem
  | MenuItem
) & {
  action: 'modal' | 'drawer';
  actionType: string;
} {
  return (
    'action' in item &&
    item.action !== undefined &&
    'actionType' in item &&
    item.actionType !== undefined
  );
}
