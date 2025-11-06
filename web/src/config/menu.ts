import { LucideIcon } from 'lucide-react';
import {
  House,
  FileText,
  ShoppingCart,
  Receipt,
  Users,
  TrendingDown,
  Wallet,
  Building2,
  HardDrive,
  LineChart,
  ChartLine,
  TrendingUp,
  Landmark,
  Shield,
  Bell,
  User,
} from 'lucide-react';

export interface SubMenuItem {
  name: string;
  href: string;
  icon: LucideIcon;
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

  // Billing (Quotes & Invoices)
  {
    name: 'Billing',
    icon: Wallet,
    subItems: [
      { name: 'Quotations', href: '/dashboard/quotations', icon: FileText },
      { name: 'Invoices', href: '/dashboard/invoices', icon: Receipt },
      { name: 'Sales', href: '/dashboard/sales', icon: TrendingUp },
      // { name: 'Returns', href: '/dashboard/sales/returns', icon: Landmark },
    ],
  },

  {
    name: 'Purchases',
    href: '/dashboard/purchases',
    icon: ShoppingCart,
  },

  {
    name: 'Expenses',
    href: '/dashboard/expenses',
    icon: TrendingDown,
  },

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
      { name: 'Sales Report', href: '/dashboard/reports/sales', icon: Receipt },
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
      { name: 'Tax Report', href: '/dashboard/reports/tax', icon: FileText },
    ],
  },

  {
    name: 'Customers',
    href: '/dashboard/customers',
    icon: Users,
  },

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
