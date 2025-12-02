'use client';

import { Button } from '@heroui/react';
import { LogOut } from 'lucide-react';
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
      setIncomeType(actionType);
      setIsIncomeModalOpen(true);
    } else if (expenseTypes.includes(actionType)) {
      setExpenseType(actionType);
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
      <aside className="w-64 h-[calc(100vh-64px)] flex flex-col">
        {/* Scrollable navigation area */}
        <nav className="flex-1 overflow-y-auto p-4 pt-8">
          <div className="flex flex-col gap-1">
            {menuItems.map(item => (
              <MenuItemLink
                key={item.name}
                item={item}
                expandedItem={expandedItem}
                onToggle={handleToggle}
                onAction={handleAction}
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
