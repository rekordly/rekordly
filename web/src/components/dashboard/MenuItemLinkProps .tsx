"use client";

import { Link } from "@heroui/react";
import { MenuItem } from '@/config/menu';
import { usePathname } from 'next/navigation';

interface MenuItemLinkProps {
  item: MenuItem;
  onClose?: () => void;
}

export function MenuItemLink({ item, onClose }: MenuItemLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === item.href;
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onClose}
      className={`
        flex items-center gap-3 px-4 py-3 rounded-lg transition-all w-full
        ${isActive 
          ? 'bg-primary-100 text-primary-600 font-medium' 
          : 'text-foreground hover:bg-default-100'
        }
      `}
    >
      <Icon className="w-5 h-5" />
      <span>{item.name}</span>
    </Link>
  );
}