// app/dashboard/DashboardClientLayout.tsx
'use client';

import { useState } from 'react';
import { Session } from 'next-auth';
import Navbar from '@/components/dashboard/Navbar';
import { Sidebar } from '@/components/dashboard/layout/Sidebar';
import { QuickAction } from '@/components/quick-action';
import { AddIncomeDrawer } from '@/components/drawer/AddIncomeDrawer';
import { AddExpensesDrawer } from '@/components/drawer/AddExpensesDrawer';
import { MobileSidebar } from './MobileSidebar';

interface DashboardClientLayoutProps {
  children: React.ReactNode;
  session: Session | null;
}

export default function DashboardClientLayout({
  children,
  session,
}: DashboardClientLayoutProps) {
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [isExpensesModalOpen, setIsExpensesModalOpen] = useState(false);
  const [incomeType, setIncomeType] = useState<string | undefined>(undefined);
  const [expenseType, setExpenseType] = useState<string | undefined>(undefined);

  const handleOpenIncomeDrawer = (type?: string) => {
    setIncomeType(type);
    setIsIncomeModalOpen(true);
  };

  const handleOpenExpenseDrawer = (type?: string) => {
    setExpenseType(type);
    setIsExpensesModalOpen(true);
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
      <div className="h-screen max-w-8xl mx-auto flex flex-col overflow-hidden">
        {session?.user && (
          <div className="flex-none">
            <Navbar user={session.user} />
          </div>
        )}

        {/* Main content area with sidebar and scrollable content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Desktop Sidebar */}
          <div className="hidden md:block flex-none">
            <Sidebar
              onOpenIncomeDrawer={handleOpenIncomeDrawer}
              onOpenExpenseDrawer={handleOpenExpenseDrawer}
            />
          </div>

          {/* Mobile Sidebar */}

          {/* Scrollable content area */}
          <main className="flex-1 overflow-y-auto">
            <div className="container mx-auto p-4 md:p-6 pb-28">{children}</div>
          </main>
        </div>
        <QuickAction
        //   onOpenIncomeDrawer={handleOpenIncomeDrawer}
        //   onOpenExpenseDrawer={handleOpenExpenseDrawer}
        />
      </div>

      {/* Drawers at root level - always in DOM */}
      <AddIncomeDrawer
        isOpen={isIncomeModalOpen}
        prefilledType={incomeType}
        onClose={handleIncomeModalClose}
        onSuccess={data => console.log('Income added:', data)}
      />

      <AddExpensesDrawer
        isOpen={isExpensesModalOpen}
        prefilledType={expenseType}
        onClose={handleExpensesModalClose}
        onSuccess={data => console.log('Expense added:', data)}
      />
    </>
  );
}
