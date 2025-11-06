'use client';

import { Button } from '@heroui/react';
import { LogOut } from 'lucide-react';

// import { MenuItemLink } from '../MenuItemLinkProps';
import { useState } from 'react';

import { MenuItemLink } from '../MenuItemLinkProps ';

import { handleSignOut } from '@/lib/auth/logout';
import { menuItems } from '@/config/menu';

export function Sidebar() {
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const handleToggle = (itemName: string) => {
    setExpandedItem(prev => (prev === itemName ? null : itemName));
  };

  return (
    <aside className="w-64 h-[calc(100vh-64px)] flex flex-col">
      {/* Scrollable navigation area */}
      <nav className="flex-1 overflow-y-auto p-4 pt-8">
        <div className="flex flex-col gap-1">
          {menuItems.map(item => (
            <MenuItemLink
              key={item.name}
              onToggle={handleToggle}
              item={item}
              // onClose={onClose}
              expandedItem={expandedItem}
            />
          ))}
        </div>
      </nav>

      <div className="flex-none p-4 border-t border-primary-200/40">
        <Button
          className="w-full"
          color="danger"
          startContent={<LogOut className="w-4 h-4" />}
          variant="flat"
          onPress={handleSignOut}
        >
          Sign Out
        </Button>
      </div>
    </aside>
  );
}
