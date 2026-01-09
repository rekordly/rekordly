'use client';

import React, { useState, useEffect } from 'react';
import { CreditCard, TrendingDown, Filter, Plus } from 'lucide-react';
import { useExpenseStore } from '@/store/expense-store';
import { ExpenseCard } from '@/components/ui/ExpenseCard';
import { AddExpensesDrawer } from '@/components/drawer/AddExpensesDrawer';
import { OtherExpenseModal } from '@/components/modals/OtherExpenseModal';
import { formatCurrency } from '@/lib/fn';
import UniversalListLayout from '@/components/layout/UniversalListLayout';
import UniversalListSkeleton from '@/components/skeleton/UniversalListSkeleton';
import { Expense, ExpenseStatus } from '@/types/expenses';
import { addToast } from '@heroui/react';
import { CreatePurchaseDrawer } from '@/components/drawer/CreatePurchaseDrawer';

type SourceType = 'ALL' | 'PURCHASE' | 'EXPENSE';

const SOURCE_FILTERS = [
  { label: 'All Sources', value: 'ALL' as SourceType },
  { label: 'Purchases', value: 'PURCHASE' as SourceType },
  { label: 'Other Expenses', value: 'EXPENSE' as SourceType },
];

type ExpenseStatusType =
  | 'ALL'
  | 'UNPAID'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

const STATUS_FILTERS = [
  {
    label: 'All Status',
    value: 'ALL' as ExpenseStatusType,
    color: 'default' as const,
  },
  {
    label: 'Paid',
    value: 'PAID' as ExpenseStatusType,
    color: 'success' as const,
  },
  {
    label: 'Unpaid',
    value: 'UNPAID' as ExpenseStatusType,
    color: 'danger' as const,
  },
  {
    label: 'Partially Paid',
    value: 'PARTIALLY_PAID' as ExpenseStatusType,
    color: 'warning' as const,
  },
  {
    label: 'Refunded',
    value: 'REFUNDED' as ExpenseStatusType,
    color: 'default' as const,
  },
  {
    label: 'Partially Refunded',
    value: 'PARTIALLY_REFUNDED' as ExpenseStatusType,
    color: 'warning' as const,
  },
];

export default function ExpensesPage() {
  const [filterValue, setFilterValue] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceType>('ALL');

  // Separate state for each drawer/modal
  const [isOtherExpenseDrawerOpen, setIsOtherExpenseDrawerOpen] =
    useState(false);
  const [isOtherExpenseModalOpen, setIsOtherExpenseModalOpen] = useState(false);
  const [isPurchaseDrawerOpen, setIsPurchaseDrawerOpen] = useState(false);

  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [editExpenseId, setEditExpenseId] = useState<string | null>(null);
  const [editPurchaseId, setEditPurchaseId] = useState<string | null>(null);
  const [prefilledType, setPrefilledType] = useState<
    'PURCHASE' | 'EXPENSE' | undefined
  >(undefined);

  const {
    displayedExpenses,
    filteredExpenses,
    isInitialLoading,
    isPaginating,
    isDeleting,
    statusFilter,
    setStatusFilter,
    summary,
    fetchExpenses,
    deleteExpense,
    searchExpenses,
    setSourceFilter: setStoreSourceFilter,
    clearSearch,
  } = useExpenseStore();

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const handleEdit = (expense: Expense) => {
    if (expense.sourceType === 'EXPENSE') {
      // Edit other expense
      setEditExpenseId(expense.sourceId);
      setPrefilledType('EXPENSE');
      setIsOtherExpenseDrawerOpen(true);
    } else if (expense.sourceType === 'PURCHASE') {
      // Edit purchase
      setEditPurchaseId(expense.sourceId);
      setIsPurchaseDrawerOpen(true);
    }
  };

  const handleOtherExpenseClick = (expense: Expense) => {
    // Open modal to view other expense details
    setSelectedExpense(expense);
    setIsOtherExpenseModalOpen(true);
  };

  const handleDelete = async (
    id: string,
    sourceType: string,
    sourceId: string | null
  ) => {
    try {
      await deleteExpense(id, sourceType as any, sourceId);
      addToast({
        title: 'Success',
        description: 'Expense deleted successfully',
        color: 'success',
      });
    } catch (error: any) {
      addToast({
        title: 'Error',
        description:
          error?.response?.data?.message || 'Failed to delete expense',
        color: 'danger',
      });
    }
  };

  const getTopCategoriesDescription = () => {
    if (!summary) return '';
    const sortedCategories = Object.entries(summary.byCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);
    if (sortedCategories.length === 0) return 'No expense categories yet';
    const topCategoryName = sortedCategories[0][0]
      .replace(/_/g, ' ')
      .toLowerCase();
    const topCategoryAmount = formatCurrency(sortedCategories[0][1]);
    return `Leading with ${topCategoryName} at ${topCategoryAmount}`;
  };

  const handlePurchaseDrawerClose = () => {
    setIsPurchaseDrawerOpen(false);
    setEditPurchaseId(null);
    fetchExpenses(); // Refresh data
  };

  const handleOtherExpenseDrawerClose = () => {
    setIsOtherExpenseDrawerOpen(false);
    setEditExpenseId(null);
    setPrefilledType(undefined);
    fetchExpenses();
  };

  if (isInitialLoading) {
    return <UniversalListSkeleton gridConfig={{ default: 1, md: 2, lg: 3 }} />;
  }

  return (
    <>
      <UniversalListLayout<ExpenseStatusType, SourceType>
        stats={[
          {
            gradient: true,
            description: `Gross expenses of ${formatCurrency(summary?.grossExpenses || 0)} less ${formatCurrency(summary?.totalPurchaseRefunds || 0)} in refunds`,
            gradientColor: 'danger',
            tag: 'Net Expenses',
            tagColor: 'danger',
            title: formatCurrency(summary?.netExpenses || 0),
            icon: <CreditCard size={24} />,
          },
          {
            gradient: true,
            description: 'Average monthly expense',
            gradientColor: 'primary',
            tag: 'Avg/Month',
            tagColor: 'primary',
            title: formatCurrency(summary?.averagePerMonth || 0),
            icon: <TrendingDown size={24} />,
          },
          {
            gradient: true,
            description: getTopCategoriesDescription(),
            gradientColor: 'warning',
            tag: 'Top Category',
            tagColor: 'warning',
            title: summary?.topCategory.replace(/_/g, ' ') || 'N/A',
            icon: <Filter size={24} />,
          },
        ]}
        searchValue={filterValue}
        searchPlaceholder="Search by vendor, title, or amount..."
        onSearchChange={value => {
          setFilterValue(value);
          searchExpenses(value);
        }}
        onSearchClear={() => {
          setFilterValue('');
          clearSearch();
        }}
        statusFilters={STATUS_FILTERS}
        selectedStatus={statusFilter as ExpenseStatusType}
        onStatusChange={status =>
          setStatusFilter(status as ExpenseStatus | 'ALL')
        }
        typeFilters={SOURCE_FILTERS}
        selectedType={sourceFilter}
        onTypeChange={value => {
          setSourceFilter(value);
          setStoreSourceFilter(value as any);
        }}
        onRefresh={fetchExpenses}
        onAdd={() => {
          setPrefilledType(undefined);
          setEditExpenseId(null);
          setIsOtherExpenseDrawerOpen(true);
        }}
        addButtonText="Add Expense"
        addButtonIcon={<Plus className="w-4 h-4" />}
        items={displayedExpenses.map(expense => (
          <ExpenseCard
            key={expense.id}
            expense={expense}
            onEdit={handleEdit}
            onOtherExpenseClick={handleOtherExpenseClick}
            isDeleting={isDeleting}
            onDelete={id =>
              handleDelete(id, expense.sourceType, expense.sourceId)
            }
          />
        ))}
        emptyMessage={
          filterValue || sourceFilter !== 'ALL'
            ? 'No expenses found'
            : 'No expense records yet.'
        }
        emptyActionText="Create Your First Expense"
        onEmptyAction={() => setIsOtherExpenseDrawerOpen(true)}
        gridConfig={{ default: 1, md: 2, lg: 3 }}
        hasMore={displayedExpenses.length < filteredExpenses.length}
        isPaginating={isPaginating}
        currentCount={displayedExpenses.length}
        totalCount={filteredExpenses.length}
      />

      {/* Other Expense Drawer for Add/Edit */}
      <AddExpensesDrawer
        isOpen={isOtherExpenseDrawerOpen}
        prefilledType={prefilledType}
        onClose={handleOtherExpenseDrawerClose}
        onSuccess={() => {
          fetchExpenses(true);
        }}
      />

      {/* Other Expense Modal for View Details */}
      <OtherExpenseModal
        expense={selectedExpense}
        isOpen={isOtherExpenseModalOpen}
        onClose={() => {
          setIsOtherExpenseModalOpen(false);
          setSelectedExpense(null);
        }}
        onEdit={handleEdit}
        onDelete={expense =>
          handleDelete(expense.id, expense.sourceType, expense.sourceId)
        }
      />

      {/* Purchase Drawer for Edit */}
      <CreatePurchaseDrawer
        purchaseType="INVENTORY_RESTOCK"
        purchaseId={editPurchaseId}
        isOpen={isPurchaseDrawerOpen}
        onClose={handlePurchaseDrawerClose}
      />
    </>
  );
}
