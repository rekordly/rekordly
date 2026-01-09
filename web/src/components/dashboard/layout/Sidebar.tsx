'use client';

import { Button } from '@heroui/react';
import { SignOut } from '@phosphor-icons/react/dist/ssr';
import { useState } from 'react';

import { MenuItemLink } from '../MenuItemLinkProps';
import { AddIncomeDrawer } from '@/components/drawer/AddIncomeDrawer';
import { AddExpensesDrawer } from '@/components/drawer/AddExpensesDrawer';

import { handleSignOut } from '@/lib/auth/logout';
import { menuItems } from '@/config/menu';

interface SidebarProps {
  onOpenExpenseDrawer?: (type: string) => void;
  onOpenIncomeDrawer?: (type: string) => void;
}

export function Sidebar({
  onOpenExpenseDrawer,
  onOpenIncomeDrawer,
}: SidebarProps) {
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [isExpensesModalOpen, setIsExpensesModalOpen] = useState(false);
  const [incomeType, setIncomeType] = useState<string | undefined>(undefined);
  const [expenseType, setExpenseType] = useState<string | undefined>(undefined);

  const handleToggle = (itemName: string) => {
    setExpandedItem(prev => (prev === itemName ? null : itemName));
  };

  const handleAction = (actionType: string) => {
    const incomeTypes = ['income'];
    const expenseTypes = ['salary-expense', 'rent', 'utilities', 'fuel'];
    const salaryTypes = ['salary-payment'];

    if (incomeTypes.includes(actionType)) {
      setIncomeType(actionType);
      setIsIncomeModalOpen(true);
    } else if (expenseTypes.includes(actionType)) {
      setExpenseType(actionType);
      setIsExpensesModalOpen(true);
    } else if (salaryTypes.includes(actionType)) {
      setExpenseType('salary');
      setIsExpensesModalOpen(true);
    }
  };

  const handleIncomeModalClose = () => {
    setIsIncomeModalOpen(false);
    setIncomeType(undefined);
  };

  const handleExpensesModalClose = () => {
    setIsExpensesModalOpen(false);
    setExpenseType(undefined);
  };

  return (
    <>
      <aside className="hidden lg:flex flex-col h-screen w-56 border-r border-divider/50 bg-linear-to-b from-background to-default-50/30">
        {/* Scrollable navigation area */}
        <div className="flex-1 overflow-y-auto px-3 py-4 scrollbar-hide">
          <nav className="flex flex-col gap-0.5">
            {menuItems.map((item, index) => (
              <MenuItemLink
                key={index}
                expandedItem={expandedItem}
                item={item}
                onToggle={handleToggle}
                onAction={handleAction}
              />
            ))}
          </nav>
        </div>

        {/* Footer with Sign Out button */}
        <div className="p-4 border-t border-divider/50">
          <Button
            className="w-full font-semibold"
            color="danger"
            startContent={<SignOut weight="bold" className="w-5 h-5" />}
            variant="flat"
            onPress={handleSignOut}
          >
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Income Modal */}
      <AddIncomeDrawer
        isOpen={isIncomeModalOpen}
        prefilledType={incomeType}
        onClose={handleIncomeModalClose}
        onSuccess={data => {
          console.log('Income added:', data);
          // Refresh data or show success message
        }}
      />

      {/* Expense Modal */}
      <AddExpensesDrawer
        isOpen={isExpensesModalOpen}
        prefilledType={expenseType}
        onClose={handleExpensesModalClose}
        onSuccess={data => {
          console.log('Expense added:', data);
          // Refresh data or show success message
        }}
      />
    </>
  );
}
