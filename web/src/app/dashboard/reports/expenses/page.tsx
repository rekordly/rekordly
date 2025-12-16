'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Input,
  Button,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Card,
  CardBody,
  addToast,
} from '@heroui/react';
import {
  Search,
  RefreshCw,
  ChevronDown,
  Filter,
  TrendingDown,
  Plus,
  CreditCard,
} from 'lucide-react';
import { useExpenseStore } from '@/store/expense-store';
import { Expense, ExpenseSourceType } from '@/types/expenses';
import { ExpenseCard } from '@/components/ui/ExpenseCard';
import { OtherExpenseModal } from '@/components/modals/OtherExpenseModal';
import { AddExpensesDrawer } from '@/components/drawer/AddExpensesDrawer';
import { CreatePurchaseDrawer } from '@/components/drawer/CreatePurchaseDrawer';
import StatCard from '@/components/ui/StatCard';
import { formatCurrency } from '@/lib/fn';

const SOURCE_FILTERS = [
  { label: 'All Sources', value: 'ALL' },
  { label: 'Purchases', value: 'PURCHASE' },
  { label: 'Sale Refunds', value: 'SALE_REFUND' },
  { label: 'Quotation Refunds', value: 'QUOTATION_REFUND' },
  { label: 'Other Expenses', value: 'OTHER_EXPENSES' },
];

export default function ExpenseList() {
  const [filterValue, setFilterValue] = useState('');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [isExpenseDrawerOpen, setIsExpenseDrawerOpen] = useState(false);
  const [editPurchaseId, setEditPurchaseId] = useState<string | null>(null);
  const [editExpenseId, setEditExpenseId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const {
    displayedExpenses,
    filteredExpenses,
    isInitialLoading,
    isPaginating,
    isDeleting,
    summary,
    fetchExpenses,
    loadMoreDisplayed,
    searchExpenses,
    setSourceFilter: setStoreSourceFilter,
    deleteExpense,
    clearSearch,
  } = useExpenseStore();

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchExpenses(true);
    setIsRefreshing(false);
  };

  const handleExpenseDrawerClose = () => {
    setIsExpenseDrawerOpen(false);
    setEditExpenseId(null);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditPurchaseId(null);
    handleManualRefresh();
  };

  const handleEdit = (expense: Expense) => {
    if (expense.sourceType === 'OTHER_EXPENSES') {
      setEditExpenseId(expense.sourceId);
      setIsExpenseDrawerOpen(true);
    } else if (expense.sourceType === 'PURCHASE' && expense.sourceId) {
      setEditPurchaseId(expense.sourceId);
      setIsModalOpen(true);
    }
  };

  const handleDelete = async (
    id: string,
    sourceType: ExpenseSourceType,
    sourceId: string | null
  ) => {
    try {
      await deleteExpense(id, sourceType, sourceId);
      addToast({
        title: 'Success',
        description: 'Expense deleted successfully',
        color: 'success',
      });
    } catch (error: any) {
      // addToast({
      //   title: 'Error',
      //   description:
      //     error?.response?.data?.message || 'Failed to delete expense',
      //   color: 'danger',
      // });
    }
  };

  const onSearchChange = useCallback(
    (value: string) => {
      setFilterValue(value);
      searchExpenses(value);
    },
    [searchExpenses]
  );

  const handleSourceFilterChange = (source: string) => {
    setSourceFilter(source);
    setStoreSourceFilter(source as any);
  };

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.innerHeight + window.scrollY;
      const documentHeight = document.documentElement.scrollHeight;
      const bottom = documentHeight - scrollPosition <= 100;

      if (
        bottom &&
        !isPaginating &&
        displayedExpenses.length < filteredExpenses.length
      ) {
        loadMoreDisplayed();
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [
    isPaginating,
    displayedExpenses.length,
    filteredExpenses.length,
    loadMoreDisplayed,
  ]);

  const getTopCategoriesDescription = () => {
    if (!summary || !summary.byCategory) return '';

    const sortedCategories = Object.entries(summary.byCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    if (sortedCategories.length === 0) return 'No expense categories yet';

    const topCategoryName = sortedCategories[0][0]
      .replace(/_/g, ' ')
      .toLowerCase();
    const topCategoryAmount = formatCurrency(sortedCategories[0][1]);

    if (sortedCategories.length === 1) {
      return `Your primary expense is ${topCategoryName} totaling ${topCategoryAmount}`;
    }

    const otherCategories = sortedCategories
      .slice(1)
      .map(([name]) => name.replace(/_/g, ' ').toLowerCase())
      .join(' and ');

    return `Leading with ${topCategoryName} at ${topCategoryAmount}, followed by ${otherCategories}`;
  };

  const topContent = (
    <div className="flex flex-col gap-4">
      {/* Mobile: Single row with search and filters */}
      <div className="flex gap-2 items-center md:hidden">
        <Input
          isClearable
          classNames={{
            base: 'flex-1 min-w-0',
            inputWrapper: 'border-1 h-9 rounded-xl',
          }}
          placeholder="Search..."
          size="sm"
          startContent={<Search className="w-4 h-4 text-default-300" />}
          value={filterValue}
          variant="bordered"
          onClear={() => {
            setFilterValue('');
            clearSearch();
          }}
          onValueChange={onSearchChange}
        />

        <Dropdown>
          <DropdownTrigger>
            <Button isIconOnly size="sm" variant="flat" className="h-9 w-9">
              <Filter className="w-4 h-4" />
            </Button>
          </DropdownTrigger>
          <DropdownMenu aria-label="Filters">
            <DropdownItem key="filters" isReadOnly className="cursor-default">
              <div className="flex flex-col gap-3 py-2">
                <div>
                  <p className="text-xs md:text-sm font-semibold mb-2">
                    Source
                  </p>
                  <div className="flex flex-col gap-1">
                    {SOURCE_FILTERS.map(filter => (
                      <Button
                        key={filter.value}
                        size="sm"
                        variant={
                          sourceFilter === filter.value ? 'flat' : 'light'
                        }
                        className="justify-start"
                        onPress={() => handleSourceFilterChange(filter.value)}
                      >
                        {filter.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>

        <Button
          isIconOnly
          className={isRefreshing ? 'animate-spin' : ''}
          size="sm"
          variant="bordered"
          isDisabled={isRefreshing}
          onPress={handleManualRefresh}
        >
          <RefreshCw className="w-4 h-4" />
        </Button>

        <Button
          isIconOnly
          size="sm"
          color="primary"
          onPress={() => setIsExpenseDrawerOpen(true)}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Desktop: Full layout */}
      <div className="hidden md:flex justify-between gap-3 items-end">
        <Input
          isClearable
          classNames={{
            base: 'w-full sm:max-w-[44%]',
            inputWrapper: 'border-1 h-10 rounded-xl',
          }}
          placeholder="Search by vendor, category, or amount..."
          size="sm"
          startContent={<Search className="w-4 h-4 text-default-300" />}
          value={filterValue}
          variant="bordered"
          onClear={() => {
            setFilterValue('');
            clearSearch();
          }}
          onValueChange={onSearchChange}
        />
        <div className="flex gap-3">
          <Button
            isIconOnly
            className={isRefreshing ? 'animate-spin' : ''}
            size="sm"
            variant="bordered"
            isDisabled={isRefreshing}
            onPress={handleManualRefresh}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>

          <Dropdown>
            <DropdownTrigger>
              <Button
                endContent={<ChevronDown className="w-4 h-4" />}
                size="sm"
                variant="bordered"
              >
                {SOURCE_FILTERS.find(f => f.value === sourceFilter)?.label ||
                  'Source'}
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              disallowEmptySelection
              aria-label="Source filter"
              selectedKeys={new Set([sourceFilter])}
              selectionMode="single"
              onSelectionChange={keys => {
                const selected = Array.from(keys)[0] as string;
                handleSourceFilterChange(selected);
              }}
            >
              {SOURCE_FILTERS.map(filter => (
                <DropdownItem key={filter.value}>{filter.label}</DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>

          <Button
            size="sm"
            color="primary"
            startContent={<Plus className="w-4 h-4" />}
            onPress={() => setIsExpenseDrawerOpen(true)}
          >
            Add Expense
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Summary Stats */}
      {summary && (
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <StatCard
            gradient
            description={`Your business incurred ${formatCurrency(summary.grossExpenses)} in expenses. After receiving ${formatCurrency(summary.totalPurchaseRefunds)} in refunds from vendors, net expenses are ${formatCurrency(summary.netExpenses)}. You've paid ${formatCurrency(summary.totalPaid)} with ${formatCurrency(summary.balance)} still owed to vendors.`}
            gradientColor="danger"
            tag="Net Expenses"
            tagColor="danger"
            title={formatCurrency(summary.netExpenses)}
            icon={<CreditCard size={24} />}
          />

          <StatCard
            gradient
            description={`Consistent monthly spending of ${formatCurrency(summary.averagePerMonth)} across ${Object.keys(summary.byCategory || {}).length} expense categories, with ${formatCurrency(summary.totalDeductible)} (${summary.deductiblePercentage.toFixed(1)}%) being tax-deductible`}
            gradientColor="primary"
            tag="Average Expense/Month"
            tagColor="primary"
            title={formatCurrency(summary.averagePerMonth)}
            icon={<TrendingDown size={24} />}
          />

          <StatCard
            gradient
            description={getTopCategoriesDescription()}
            gradientColor="warning"
            tag="Top Category"
            tagColor="warning"
            title={summary.topCategory.replace(/_/g, ' ')}
            icon={<Filter size={24} />}
          />
        </div>
      )}

      <Card className="rounded-3xl bg-transparent" shadow="none">
        <CardBody className="py-6">
          {topContent}

          {/* Expense Grid */}
          <div className="mt-6">
            {isInitialLoading ? (
              <div className="py-20">
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <p className="text-sm text-default-500">
                    Loading expenses...
                  </p>
                </div>
              </div>
            ) : displayedExpenses.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-default-500">
                  {filterValue || sourceFilter !== 'ALL'
                    ? 'No expenses found'
                    : 'No expense records yet.'}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {displayedExpenses.map(expense => (
                    <ExpenseCard
                      key={expense.id}
                      expense={expense}
                      onOtherExpenseClick={setSelectedExpense}
                      onEdit={handleEdit}
                      onDelete={id =>
                        handleDelete(id, expense.sourceType, expense.sourceId)
                      }
                      isDeleting={isDeleting}
                    />
                  ))}
                </div>

                {/* Load More Indicator */}
                {isPaginating && (
                  <div className="flex justify-center py-6">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  </div>
                )}

                {/* End of Results */}
                {displayedExpenses.length >= filteredExpenses.length &&
                  filteredExpenses.length > 0 && (
                    <div className="text-center py-6">
                      <p className="text-xs text-default-400">
                        Showing all {filteredExpenses.length} results
                      </p>
                    </div>
                  )}
              </>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Other Expense Modal */}
      <OtherExpenseModal
        expense={selectedExpense}
        isOpen={!!selectedExpense}
        onClose={() => setSelectedExpense(null)}
      />

      {/* Add Expense Drawer */}
      <AddExpensesDrawer
        isOpen={isExpenseDrawerOpen}
        onClose={handleExpenseDrawerClose}
        expenseId={editExpenseId}
        onSuccess={data => {
          console.log('Expense added:', data);
          handleManualRefresh();
        }}
      />

      {/* Edit Purchase Drawer */}
      <CreatePurchaseDrawer
        isOpen={isModalOpen}
        onClose={handleModalClose}
        purchaseId={editPurchaseId}
      />
    </>
  );
}
