'use client';

import { Link } from '@heroui/react';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';

import { MenuItem, SubMenuItem } from '@/config/menu';

interface MenuItemLinkProps {
  item: MenuItem;
  onClose?: () => void;
  expandedItem?: string | null;
  onToggle?: (itemName: string) => void;
}

export function MenuItemLink({
  item,
  onClose,
  expandedItem,
  onToggle,
}: MenuItemLinkProps) {
  const pathname = usePathname();
  const Icon = item.icon;

  // Check if this item or any of its subitems is active
  const isActive = item.href ? pathname === item.href : false;
  const hasActiveSubItem = item.subItems?.some(
    subItem => pathname === subItem.href
  );
  const isExpanded = expandedItem === item.name;

  // If item has subitems, it's a parent menu
  if (item.subItems && item.subItems.length > 0) {
    return (
      <div className="w-full">
        {/* Parent Menu Item */}
        <button
          className={`
            flex items-center justify-between w-full px-4 py-3 rounded-lg transition-all
            ${
              hasActiveSubItem
                ? 'bg-primary/10 text-primary'
                : 'text-foreground hover:bg-default-100'
            }
          `}
          onClick={() => onToggle?.(item.name)}
        >
          <div className="flex items-center gap-3">
            <Icon
              className="w-5 h-5"
              strokeWidth={hasActiveSubItem ? 2.5 : 2}
            />
            <span className={hasActiveSubItem ? 'font-medium' : ''}>
              {item.name}
            </span>
          </div>
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${
              isExpanded ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* Submenu Items */}
        <div
          className={`
            overflow-hidden transition-all duration-200 ease-in-out
            ${isExpanded ? 'max-h-96 opacity-100 mt-1' : 'max-h-0 opacity-0'}
          `}
        >
          <div className="pl-4 space-y-1">
            {item.subItems.map(subItem => (
              <SubMenuItemLink
                key={subItem.href}
                subItem={subItem}
                onClose={onClose}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Regular menu item without subitems
  return (
    <Link
      className={`
        flex items-center gap-3 px-4 py-3 rounded-lg transition-all w-full
        ${
          isActive
            ? 'bg-primary text-white font-medium shadow-sm'
            : 'text-foreground hover:bg-default-100'
        }
      `}
      href={item.href!}
      onClick={onClose}
    >
      <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
      <span>{item.name}</span>
    </Link>
  );
}

interface SubMenuItemLinkProps {
  subItem: SubMenuItem;
  onClose?: () => void;
}

function SubMenuItemLink({ subItem, onClose }: SubMenuItemLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === subItem.href;
  const SubIcon = subItem.icon;

  return (
    <Link
      className={`
        flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all w-full text-sm
        ${
          isActive
            ? 'bg-primary text-white font-medium shadow-sm'
            : 'text-default-600 hover:bg-default-100 hover:text-foreground'
        }
      `}
      href={subItem.href}
      onClick={onClose}
    >
      <SubIcon className="w-4 h-4" strokeWidth={isActive ? 2.5 : 2} />
      <span>{subItem.name}</span>
    </Link>
  );
}
