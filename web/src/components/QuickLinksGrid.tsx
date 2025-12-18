'use client';

import React, { useState } from 'react';
import { Input } from '@heroui/input';
import { Search } from 'lucide-react';
import { quickLinks, QuickLinkItem } from '@/config/quick-links';
import { CreateInvoiceDrawer } from '@/components/drawer/CreateInvoiceDrawer';
import { AddIncomeDrawer } from '@/components/drawer/AddIncomeDrawer';
import { AddExpensesDrawer } from '@/components/drawer/AddExpensesDrawer';
import { useInvoiceStore } from '@/store/invoiceStore';
import { useIncomeStore } from '@/store/income-store';
import { useExpenseStore } from '@/store/expense-store';
import { CreateSaleDrawer } from './drawer/CreateSaleDrawer';
import { CreateQuotationDrawer } from './drawer/CreateQuotationDrawer';
import { CreatePurchaseDrawer } from './drawer/CreatePurchaseDrawer';
import { useSaleStore } from '@/store/saleStore';
import { useQuotationStore } from '@/store/quotationStore';
import { usePurchaseStore } from '@/store/purchase-store';

interface QuickLinksGridProps {
  showSearch?: boolean;
  columns?: {
    default?: number;
    sm?: number;
    md?: number;
    lg?: number;
  };
  onActionComplete?: () => void;
}

export function QuickLinksGrid({
  showSearch = true,
  columns = { default: 3, sm: 4, md: 5, lg: 6 },
  onActionComplete,
}: QuickLinksGridProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Drawer states
  const [showInvoiceDrawer, setShowInvoiceDrawer] = useState(false);
  const [showSaleDrawer, setShowSaleDrawer] = useState(false);
  const [showQuotationDrawer, setShowQuotationDrawer] = useState(false);
  const [showPurchaseDrawer, setShowPurchaseDrawer] = useState(false);
  const [showIncomeDrawer, setShowIncomeDrawer] = useState(false);
  const [showExpenseDrawer, setShowExpenseDrawer] = useState(false);

  const [incomeType, setIncomeType] = useState<string>('');
  const [expenseType, setExpenseType] = useState<string>('');

  // Store hooks
  const { refreshInvoices } = useInvoiceStore();
  const { fetchIncome } = useIncomeStore();
  const { fetchExpenses } = useExpenseStore();
  const { fetchSales } = useSaleStore();
  const { fetchQuotations } = useQuotationStore();
  const { fetchPurchases } = usePurchaseStore();

  const filteredLinks = React.useMemo(() => {
    if (!searchQuery) return quickLinks;

    return quickLinks.filter(link =>
      link.label.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  const handleActionSelect = (item: QuickLinkItem) => {
    switch (item.actionType) {
      case 'invoice':
        setShowInvoiceDrawer(true);
        break;
      case 'income':
        setIncomeType(item.drawerType || '');
        setShowIncomeDrawer(true);
        break;
      case 'expense':
        setExpenseType(item.drawerType || '');
        setShowExpenseDrawer(true);
        break;
      case 'sale':
        setShowSaleDrawer(true);
        onActionComplete?.();
        break;
      case 'purchase':
        setShowPurchaseDrawer(true);
        onActionComplete?.();
        break;
      case 'quotation':
        setShowQuotationDrawer(true);
        onActionComplete?.();
        break;
    }
  };

  const handleIncomeModalClose = () => {
    setShowIncomeDrawer(false);
    setIncomeType('');
  };

  const handleExpenseModalClose = () => {
    setShowExpenseDrawer(false);
    setExpenseType('');
  };

  const getGridCols = () => {
    const cols = [];
    if (columns.default) cols.push(`grid-cols-${columns.default}`);
    if (columns.sm) cols.push(`sm:grid-cols-${columns.sm}`);
    if (columns.md) cols.push(`md:grid-cols-${columns.md}`);
    if (columns.lg) cols.push(`lg:grid-cols-${columns.lg}`);
    return cols.join(' ');
  };

  return (
    <>
      <div className="space-y-4">
        {/* Search */}
        {showSearch && (
          <Input
            placeholder="Search actions..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            startContent={<Search className="w-4 h-4 text-default-400" />}
            classNames={{
              input: 'text-sm',
              inputWrapper: 'h-10',
            }}
          />
        )}

        {/* Quick Links Grid */}
        <div className={`grid ${getGridCols()} gap-3`}>
          {filteredLinks.map((link, index) => {
            const Icon = link.icon;
            return (
              <button
                key={`${link.label}-${index}`}
                onClick={() => handleActionSelect(link)}
                className={`
                  flex flex-col items-center gap-2 p-3 rounded-xl
                  transition-all duration-200
                  ${link.hoverColor}
                  hover:scale-105 hover:shadow-md
                  group
                `}
              >
                <div
                  className={`
                    w-12 h-12 rounded-xl flex items-center justify-center
                    ${link.bgColor}
                    shadow-sm group-hover:shadow-md
                    transition-shadow duration-200
                  `}
                >
                  <Icon className="w-6 h-6 text-white" strokeWidth={2} />
                </div>
                <span className="text-xs font-medium text-foreground text-center line-clamp-2">
                  {link.label}
                </span>
              </button>
            );
          })}
        </div>

        {filteredLinks.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-default-500">No actions found</p>
          </div>
        )}
      </div>

      {/* Invoice Drawer */}
      <CreateInvoiceDrawer
        isOpen={showInvoiceDrawer}
        onClose={() => setShowInvoiceDrawer(false)}
        onSuccess={async () => {
          onActionComplete?.();
        }}
      />

      <CreateSaleDrawer
        isOpen={showSaleDrawer}
        onClose={() => setShowSaleDrawer(false)}
        onSuccess={async () => {
          onActionComplete?.();
        }}
      />

      <CreateQuotationDrawer
        isOpen={showQuotationDrawer}
        onClose={() => setShowQuotationDrawer(false)}
        onSuccess={async () => {
          onActionComplete?.();
        }}
      />

      <CreatePurchaseDrawer
        isOpen={showPurchaseDrawer}
        onClose={() => setShowPurchaseDrawer(false)}
        onSuccess={async () => {
          onActionComplete?.();
        }}
      />

      <AddIncomeDrawer
        isOpen={showIncomeDrawer}
        prefilledType={incomeType}
        onClose={handleIncomeModalClose}
        onSuccess={() => {
          onActionComplete?.();
        }}
      />

      {/* Expense Drawer */}
      <AddExpensesDrawer
        isOpen={showExpenseDrawer}
        prefilledType={expenseType}
        onClose={handleExpenseModalClose}
        onSuccess={() => {
          onActionComplete?.();
        }}
      />
    </>
  );
}
