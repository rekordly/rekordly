import { LucideIcon } from 'lucide-react';
import {
  House,
  FileText,
  ShoppingCart,
  Receipt,
  Users,
  TrendingDown,
  TrendingUp,
  Wallet,
  Building2,
  HardDrive,
  LineChart,
  ChartLine,
  Landmark,
  Shield,
  Bell,
  User,
  DollarSign,
  Banknote,
  CreditCard,
  Briefcase,
  UserCheck,
  HandCoins,
  Gift,
  PiggyBank,
} from 'lucide-react';

export interface SubMenuItem {
  name: string;
  href?: string;
  icon: LucideIcon;
  action?: 'modal' | 'drawer'; // For items that open modals/drawers
  actionType?: string; // Type identifier for the action
}

export interface MenuItem {
  name: string;
  href?: string;
  icon: LucideIcon;
  subItems?: SubMenuItem[];
}

export const menuItems: MenuItem[] = [
  // Dashboard
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: House,
  },

  // Income Section
  {
    name: 'Income',
    icon: TrendingUp,
    subItems: [
      // Regular income tracking pages
      {
        name: 'Quotations',
        href: '/dashboard/quotations',
        icon: FileText,
      },
      { name: 'Invoices', href: '/dashboard/invoices', icon: Receipt },
      { name: 'Sales', href: '/dashboard/sales', icon: DollarSign },

      // Quick entry modals/drawers for common income types
      {
        name: 'Salary Payment',
        icon: Banknote,
        action: 'drawer',
        actionType: 'salary',
      },
      {
        name: 'Commission',
        icon: HandCoins,
        action: 'drawer',
        actionType: 'commission',
      },
      {
        name: 'Dividend Income',
        icon: PiggyBank,
        action: 'drawer',
        actionType: 'dividend',
      },
      {
        name: 'Other Income',
        icon: Wallet,
        action: 'drawer',
        actionType: 'other-income',
      },
    ],
  },

  // Expenses Section
  {
    name: 'Expenses',
    icon: TrendingDown,
    subItems: [
      // Purchases moved under expenses
      {
        name: 'Purchases',
        href: '/dashboard/purchases',
        icon: ShoppingCart,
      },
      {
        name: 'Expenses',
        href: '/dashboard/expenses/records',
        icon: TrendingDown,
      },

      // Quick entry modals/drawers for common expense types
      {
        name: 'Salaries',
        icon: UserCheck,
        action: 'drawer',
        actionType: 'salary',
      },
      {
        name: 'Rent Payment',
        icon: Building2,
        action: 'drawer',
        actionType: 'rent',
      },
      {
        name: 'Utilities',
        icon: Banknote,
        action: 'drawer',
        actionType: 'utilities',
      },
      {
        name: 'Fuel',
        icon: CreditCard,
        action: 'drawer',
        actionType: 'fuel',
      },
      {
        name: 'Professional Fees',
        icon: Briefcase,
        action: 'drawer',
        actionType: 'professional-fees',
      },
      {
        name: 'Subscriptions',
        icon: Receipt,
        action: 'drawer',
        actionType: 'subscriptions',
      },
    ],
  },

  // Assets Section
  {
    name: 'Assets',
    icon: Building2,
    subItems: [
      {
        name: 'Fixed Assets',
        href: '/dashboard/assets/fixed',
        icon: Building2,
      },
      {
        name: 'Digital Assets',
        href: '/dashboard/assets/digital',
        icon: HardDrive,
      },
      {
        name: 'Investments',
        href: '/dashboard/assets/investments',
        icon: LineChart,
      },
    ],
  },

  // Reports Section
  {
    name: 'Reports',
    icon: ChartLine,
    subItems: [
      {
        name: 'Profit & Loss',
        href: '/dashboard/reports/pnl',
        icon: TrendingUp,
      },
      {
        name: 'Balance Sheet',
        href: '/dashboard/reports/balance-sheet',
        icon: Landmark,
      },
      {
        name: 'Cash Flow',
        href: '/dashboard/reports/cashflow',
        icon: LineChart,
      },
      {
        name: 'Income Report',
        href: '/dashboard/reports/income',
        icon: TrendingUp,
      },
      {
        name: 'Expense Report',
        href: '/dashboard/reports/expenses',
        icon: TrendingDown,
      },
      {
        name: 'Asset Report',
        href: '/dashboard/reports/assets',
        icon: Building2,
      },
      {
        name: 'Tax Report',
        href: '/dashboard/reports/tax',
        icon: FileText,
      },
    ],
  },

  // Customers
  {
    name: 'Customers',
    href: '/dashboard/customers',
    icon: Users,
  },

  // Account Section
  {
    name: 'Account',
    icon: User,
    subItems: [
      { name: 'Profile', href: '/dashboard/account/profile', icon: User },
      { name: 'Security', href: '/dashboard/account/security', icon: Shield },
      {
        name: 'Notifications',
        href: '/dashboard/account/notifications',
        icon: Bell,
      },
    ],
  },
];

// Type guard to check if a menu item has an action
export function hasAction(
  item: SubMenuItem
): item is SubMenuItem & { action: 'modal' | 'drawer'; actionType: string } {
  return item.action !== undefined && item.actionType !== undefined;
}
