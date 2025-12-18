import { LucideIcon } from 'lucide-react';
import {
  Receipt,
  TrendingDown,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  FileText,
  Banknote,
  HandCoins,
  PiggyBank,
  Wallet,
  UserCheck,
  Building2,
  CreditCard,
  Briefcase,
} from 'lucide-react';

export interface QuickLinkItem {
  icon: LucideIcon;
  label: string;
  color: string;
  hoverColor: string;
  bgColor: string;
  actionType:
    | 'income'
    | 'expense'
    | 'invoice'
    | 'sale'
    | 'purchase'
    | 'quotation';
  drawerType?: string; // For specific income/expense types
}

export const quickLinks: QuickLinkItem[] = [
  // Primary Actions
  {
    icon: Receipt,
    label: 'Invoice',
    color: 'text-blue-600',
    hoverColor: 'hover:bg-blue-800/10',
    bgColor: 'bg-blue-500',
    actionType: 'invoice',
  },
  {
    icon: DollarSign,
    label: 'Sale',
    color: 'text-green-600',
    hoverColor: 'hover:bg-green-800/10',
    bgColor: 'bg-green-500',
    actionType: 'sale',
  },
  {
    icon: ShoppingCart,
    label: 'Purchase',
    color: 'text-purple-600',
    hoverColor: 'hover:bg-purple-800/10',
    bgColor: 'bg-purple-500',
    actionType: 'purchase',
  },

  // Income Quick Actions
  {
    icon: Banknote,
    label: 'Salary',
    color: 'text-emerald-600',
    hoverColor: 'hover:bg-emerald-800/10',
    bgColor: 'bg-emerald-500',
    actionType: 'income',
    drawerType: 'salary',
  },
  {
    icon: HandCoins,
    label: 'Commission',
    color: 'text-teal-600',
    hoverColor: 'hover:bg-teal-800/10',
    bgColor: 'bg-teal-500',
    actionType: 'income',
    drawerType: 'commission',
  },
  {
    icon: PiggyBank,
    label: 'Dividend',
    color: 'text-cyan-600',
    hoverColor: 'hover:bg-cyan-800/10',
    bgColor: 'bg-cyan-500',
    actionType: 'income',
    drawerType: 'dividend',
  },
  {
    icon: Wallet,
    label: 'Other Income',
    color: 'text-blue-600',
    hoverColor: 'hover:bg-blue-800/10',
    bgColor: 'bg-blue-500',
    actionType: 'income',
    drawerType: 'other-income',
  },

  // Expense Quick Actions
  {
    icon: UserCheck,
    label: 'Salaries',
    color: 'text-red-600',
    hoverColor: 'hover:bg-red-800/10',
    bgColor: 'bg-red-500',
    actionType: 'expense',
    drawerType: 'salary',
  },
  {
    icon: Building2,
    label: 'Rent',
    color: 'text-orange-600',
    hoverColor: 'hover:bg-orange-800/10',
    bgColor: 'bg-orange-500',
    actionType: 'expense',
    drawerType: 'rent',
  },
  {
    icon: Banknote,
    label: 'Utilities',
    color: 'text-amber-600',
    hoverColor: 'hover:bg-amber-100/20 dark:hover:bg-amber-800/10 ',
    bgColor: 'bg-amber-500',
    actionType: 'expense',
    drawerType: 'utilities',
  },
  {
    icon: CreditCard,
    label: 'Fuel',
    color: 'text-rose-600',
    hoverColor: 'hover:bg-rose-800/10',
    bgColor: 'bg-rose-500',
    actionType: 'expense',
    drawerType: 'fuel',
  },
  {
    icon: Briefcase,
    label: 'Pro Fees',
    color: 'text-pink-600',
    hoverColor: 'hover:bg-pink-800/10',
    bgColor: 'bg-pink-500',
    actionType: 'expense',
    drawerType: 'professional-fees',
  },
  {
    icon: Receipt,
    label: 'Subscription',
    color: 'text-fuchsia-600',
    hoverColor: 'hover:bg-fuchsia-800/10',
    bgColor: 'bg-fuchsia-500',
    actionType: 'expense',
    drawerType: 'subscriptions',
  },
];
