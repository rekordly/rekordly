// components/dashboard/layout/MobileSidebar.tsx
'use client';

import { useState } from 'react';
import { Button } from '@heroui/react';
import { Menu, X } from 'lucide-react';
import { MenuItemLink } from '../MenuItemLinkProps';
import { menuItems } from '@/config/menu';
import { handleSignOut } from '@/lib/auth/logout';

interface MobileSidebarProps {
  onOpenExpenseDrawer?: (type: string) => void;
  onOpenIncomeDrawer?: (type: string) => void;
}

export function MobileSidebar({
  onOpenExpenseDrawer,
  onOpenIncomeDrawer,
}: MobileSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const handleToggle = (itemName: string) => {
    setExpandedItem(prev => (prev === itemName ? null : itemName));
  };

  const handleAction = (actionType: string) => {
    const incomeTypes = ['salary', 'commission', 'dividend', 'other-income'];
    const expenseTypes = [
      'salary-expense',
      'rent',
      'utilities',
      'fuel',
      'professional-fees',
      'subscriptions',
    ];

    if (incomeTypes.includes(actionType)) {
      onOpenIncomeDrawer?.(actionType);
      setIsOpen(false);
    } else if (expenseTypes.includes(actionType)) {
      onOpenExpenseDrawer?.(actionType);
      setIsOpen(false);
    }
  };

  return (
    <>
      {/* Mobile Hamburger Button */}
      <Button
        variant="light"
        isIconOnly
        className="md:hidden ml-4"
        onPress={() => setIsOpen(true)}
      >
        <Menu className="w-5 h-5" />
      </Button>

      {/* Mobile Sidebar Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsOpen(false)}
          />

          {/* Sidebar Content */}
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-background shadow-xl flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold">Menu</h2>
              <Button
                isIconOnly
                variant="light"
                size="sm"
                onPress={() => setIsOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Scrollable navigation area */}
            <nav className="flex-1 overflow-y-auto p-4">
              <div className="flex flex-col gap-1">
                {menuItems.map(item => (
                  <MenuItemLink
                    key={item.name}
                    item={item}
                    expandedItem={expandedItem}
                    onToggle={handleToggle}
                    onAction={handleAction}
                    onClose={() => setIsOpen(false)}
                  />
                ))}
              </div>
            </nav>

            {/* Sign Out Button */}
            <div className="flex-none p-4 border-t border-primary-200/40">
              <Button
                className="w-full"
                color="danger"
                startContent={<X className="w-4 h-4" />}
                variant="flat"
                onPress={() => {
                  handleSignOut();
                  setIsOpen(false);
                }}
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
