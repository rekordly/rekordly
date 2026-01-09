'use client';

import { Link } from '@heroui/react';
import { usePathname } from 'next/navigation';
import { CaretDown } from '@phosphor-icons/react/dist/ssr';

import { MenuItem, SubMenuItem, hasAction } from '@/config/menu';

interface MenuItemLinkProps {
  item: MenuItem;
  onClose?: () => void;
  expandedItem?: string | null;
  onToggle?: (itemName: string) => void;
  onAction?: (actionType: string, action: 'modal' | 'drawer') => void;
}

export function MenuItemLink({
  item,
  onClose,
  expandedItem,
  onToggle,
  onAction,
}: MenuItemLinkProps) {
  const pathname = usePathname();
  const Icon = item.icon;

  // Check if this item or any of its subitems is active
  const isActive = item.href ? pathname === item.href : false;
  const hasActiveSubItem = item.subItems?.some(
    subItem => subItem.href && pathname === subItem.href
  );
  const isExpanded = expandedItem === item.name;

  // Check if this is an action item (for top-level action items like Income)
  const isTopLevelAction = hasAction(item);

  // Handle top-level action items
  if (isTopLevelAction) {
    return (
      <button
        className={`
          flex items-center gap-2.5 px-3 py-3 rounded-lg transition-all w-full
          text-default-700 hover:bg-default-100/70 active:scale-[0.98] group
        `}
        onClick={() => {
          onAction?.(item.actionType, item.action);
          onClose?.();
        }}
      >
        <Icon
          weight="duotone"
          className="w-6 h-6 shrink-0"
          style={{ color: item.iconColor }}
        />
        <span className="text-base">{item.name}</span>
      </button>
    );
  }

  // If item has subitems, it's a parent menu
  if (item.subItems && item.subItems.length > 0) {
    return (
      <div className="w-full">
        {/* Parent Menu Item */}
        <button
          className={`
            flex items-center justify-between w-full px-3 py-3 rounded-lg transition-all group
            ${
              hasActiveSubItem
                ? 'bg-primary/10 text-primary'
                : 'text-default-700 hover:bg-default-100/70'
            }
          `}
          onClick={() => onToggle?.(item.name)}
        >
          <div className="flex items-center gap-2.5">
            <Icon
              weight={hasActiveSubItem ? 'fill' : 'duotone'}
              className="w-6 h-6 shrink-0"
              style={{ color: item.iconColor }}
            />
            <span className="text-base">{item.name}</span>
          </div>
          <CaretDown
            weight="bold"
            className={`w-3.5 h-3.5 shrink-0 transition-transform duration-300 ${
              isExpanded ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* Submenu Items */}
        <div
          className={`
            overflow-hidden transition-all duration-300 ease-in-out
            ${isExpanded ? 'max-h-150 opacity-100 mt-0.5' : 'max-h-0 opacity-0'}
          `}
        >
          <div className="pl-3 space-y-0.5 pt-0.5">
            {item.subItems.map((subItem, index) => (
              <SubMenuItemLink
                key={subItem.href || `action-${index}`}
                subItem={subItem}
                onClose={onClose}
                onAction={onAction}
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
        flex items-center gap-2.5 px-3 py-3 rounded-lg transition-all w-full active:scale-[0.98] group
        ${
          isActive
            ? 'bg-primary text-white'
            : 'text-default-700 hover:bg-default-100/70'
        }
      `}
      href={item.href!}
      onClick={onClose}
    >
      <Icon
        weight={isActive ? 'fill' : 'duotone'}
        className="w-6 h-6 shrink-0"
        style={{ color: isActive ? '#ffffff' : item.iconColor }}
      />
      <span className="text-base">{item.name}</span>
    </Link>
  );
}

interface SubMenuItemLinkProps {
  subItem: SubMenuItem;
  onClose?: () => void;
  onAction?: (actionType: string, action: 'modal' | 'drawer') => void;
}

function SubMenuItemLink({ subItem, onClose, onAction }: SubMenuItemLinkProps) {
  const pathname = usePathname();
  const SubIcon = subItem.icon;

  // Check if this is an action item (modal/drawer)
  const isActionItem = hasAction(subItem);
  const isActive = subItem.href ? pathname === subItem.href : false;

  // Handle action items (modal/drawer)
  if (isActionItem) {
    return (
      <button
        className={`
          flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all w-full
          text-default-600 hover:bg-default-100/60 active:scale-[0.98] group
        `}
        onClick={() => {
          onAction?.(subItem.actionType, subItem.action);
          onClose?.();
        }}
      >
        <SubIcon
          weight="duotone"
          className="w-4 h-4 shrink-0"
          style={{ color: subItem.iconColor }}
        />
        <span className="text-sm">{subItem.name}</span>
      </button>
    );
  }

  // Handle regular link items
  return (
    <Link
      className={`
        flex items-center gap-2.5 px-3 py-1.5 rounded-md transition-all w-full active:scale-[0.98] group
        ${
          isActive
            ? 'bg-primary/90 text-white'
            : 'text-default-600 hover:bg-default-100/60'
        }
      `}
      href={subItem.href!}
      onClick={onClose}
    >
      <SubIcon
        weight={isActive ? 'fill' : 'duotone'}
        className="w-4 h-4 shrink-0"
        style={{ color: isActive ? '#ffffff' : subItem.iconColor }}
      />
      <span className="text-sm">{subItem.name}</span>
    </Link>
  );
}
