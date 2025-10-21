// src/config/menu.ts
import { LucideIcon } from 'lucide-react';
import { Home, Users, DollarSign, HelpCircle, Mail } from 'lucide-react';

export interface MenuItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

export const menuItems: MenuItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Community", href: "#community", icon: Users },
  { name: "Pricing", href: "#pricing", icon: DollarSign },
  { name: "FAQs", href: "#faqs", icon: HelpCircle },
  { name: "Contact", href: "#contact", icon: Mail },
];