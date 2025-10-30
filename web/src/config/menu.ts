// src/config/menu.ts
import { LucideIcon, Receipt } from 'lucide-react';
import { Home, Users, DollarSign, HelpCircle, Mail } from 'lucide-react';

export interface MenuItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

export const menuItems: MenuItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Invoice", href: "/dashboard/invoice", icon: Receipt },
  { name: "Income", href: "/dashboard/income", icon: Mail },
  { name: "Expenses", href: "/dashboard/expenses", icon: HelpCircle },
  { name: "Sales", href: "/dashboard/sales", icon: DollarSign },
];