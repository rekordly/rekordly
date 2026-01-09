'use client';

import React, { useState, useEffect } from 'react';
import { Wallet, TrendingUp, Filter, Plus } from 'lucide-react';
import { useIncomeStore } from '@/store/income-store';
import { IncomeCard } from '@/components/ui/IncomeCard';
import { AddIncomeDrawer } from '@/components/drawer/AddIncomeDrawer';
import { OtherIncomeModal } from '@/components/modals/OtherIncomeModal';
import { formatCurrency } from '@/lib/fn';
import UniversalListLayout from '@/components/layout/UniversalListLayout';
import UniversalListSkeleton from '@/components/skeleton/UniversalListSkeleton';
import { Income, IncomeRecordStatus } from '@/types/income';
import { addToast } from '@heroui/react';

// Import sale and quotation drawers
// Adjust paths according to your project structure
import { CreateSaleDrawer } from '@/components/drawer/CreateSaleDrawer';
import { CreateQuotationDrawer } from '@/components/drawer/CreateQuotationDrawer';

type SourceType = 'ALL' | 'SALE' | 'QUOTATION' | 'OTHER_INCOME';

const SOURCE_FILTERS = [
  { label: 'All Sources', value: 'ALL' as SourceType },
  { label: 'Sales', value: 'SALE' as SourceType },
  { label: 'Quotations', value: 'QUOTATION' as SourceType },
  { label: 'Other Income', value: 'OTHER_INCOME' as SourceType },
];

type IncomeStatus =
  | 'ALL'
  | 'UNPAID'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

const STATUS_FILTERS = [
  {
    label: 'All Status',
    value: 'ALL' as IncomeStatus,
    color: 'default' as const,
  },
  { label: 'Paid', value: 'PAID' as IncomeStatus, color: 'success' as const },
  {
    label: 'Unpaid',
    value: 'UNPAID' as IncomeStatus,
    color: 'danger' as const,
  },
  {
    label: 'Partially Paid',
    value: 'PARTIALLY_PAID' as IncomeStatus,
    color: 'warning' as const,
  },
  {
    label: 'Refunded',
    value: 'REFUNDED' as IncomeStatus,
    color: 'default' as const,
  },
  {
    label: 'Partially Refunded',
    value: 'PARTIALLY_REFUNDED' as IncomeStatus,
    color: 'warning' as const,
  },
];

export default function IncomePage() {
  const [filterValue, setFilterValue] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceType>('ALL');

  // Separate state for each drawer/modal
  const [isOtherIncomeDrawerOpen, setIsOtherIncomeDrawerOpen] = useState(false);
  const [isOtherIncomeModalOpen, setIsOtherIncomeModalOpen] = useState(false);
  const [isSaleDrawerOpen, setIsSaleDrawerOpen] = useState(false);
  const [isQuotationDrawerOpen, setIsQuotationDrawerOpen] = useState(false);

  const [selectedIncome, setSelectedIncome] = useState<Income | null>(null);
  const [editIncomeId, setEditIncomeId] = useState<string | null>(null);
  const [editSaleId, setEditSaleId] = useState<string | null>(null);
  const [editQuotationId, setEditQuotationId] = useState<string | null>(null);

  const {
    displayedIncome,
    filteredIncome,
    isInitialLoading,
    isPaginating,
    isDeleting,
    statusFilter,
    setStatusFilter,
    summary,
    fetchIncome,
    deleteIncome,
    searchIncome,
    setSourceFilter: setStoreSourceFilter,
    clearSearch,
  } = useIncomeStore();

  useEffect(() => {
    fetchIncome();
  }, [fetchIncome]);

  const handleEdit = (income: Income) => {
    if (income.sourceType === 'OTHER_INCOME') {
      // Edit other income
      setEditIncomeId(income.sourceId);
      setIsOtherIncomeDrawerOpen(true);
    } else if (income.sourceType === 'SALE') {
      // Edit sale
      setEditSaleId(income.sourceId);
      setIsSaleDrawerOpen(true);
    } else if (income.sourceType === 'QUOTATION') {
      // Edit quotation
      setEditQuotationId(income.sourceId);
      setIsQuotationDrawerOpen(true);
    }
  };

  const handleOtherIncomeClick = (income: Income) => {
    // Open modal to view other income details
    setSelectedIncome(income);
    setIsOtherIncomeModalOpen(true);
  };

  const handleDelete = async (
    id: string,
    sourceType: string,
    sourceId: string | null
  ) => {
    try {
      await deleteIncome(id, sourceType as any, sourceId);
      addToast({
        title: 'Success',
        description: 'Income deleted successfully',
        color: 'success',
      });
    } catch (error: any) {
      // Error already handled in store
    }
  };

  const getTopSourcesDescription = () => {
    if (!summary) return '';
    const sortedSources = Object.entries(summary.bySource)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);
    if (sortedSources.length === 0) return 'No income sources yet';
    const topSourceName = sortedSources[0][0].replace('_', ' ').toLowerCase();
    const topSourceAmount = formatCurrency(sortedSources[0][1]);
    return `Leading with ${topSourceName} at ${topSourceAmount}`;
  };

  const handleSaleDrawerClose = () => {
    setIsSaleDrawerOpen(false);
    setEditSaleId(null);
    fetchIncome(); // Refresh data
  };

  const handleQuotationDrawerClose = () => {
    setIsQuotationDrawerOpen(false);
    setEditQuotationId(null);
    fetchIncome(); // Refresh data
  };

  const handleOtherIncomeDrawerClose = () => {
    setIsOtherIncomeDrawerOpen(false);
    setEditIncomeId(null);
    fetchIncome();
  };

  if (isInitialLoading) {
    return <UniversalListSkeleton gridConfig={{ default: 1, md: 2, lg: 3 }} />;
  }

  return (
    <>
      <UniversalListLayout<IncomeStatus, SourceType>
        stats={[
          {
            gradient: true,
            description: `Net income after ${formatCurrency(summary?.totalRefunds || 0)} in refunds`,
            gradientColor: 'success',
            tag: 'Net Income',
            tagColor: 'success',
            title: formatCurrency(summary?.netIncome || 0),
            icon: <Wallet size={24} />,
          },
          {
            gradient: true,
            description: 'Average monthly income',
            gradientColor: 'primary',
            tag: 'Avg/Month',
            tagColor: 'primary',
            title: formatCurrency(summary?.averagePerMonth || 0),
            icon: <TrendingUp size={24} />,
          },
          {
            gradient: true,
            description: getTopSourcesDescription(),
            gradientColor: 'warning',
            tag: 'Top Source',
            tagColor: 'warning',
            title: summary?.topSource.replace('_', ' ') || 'N/A',
            icon: <Filter size={24} />,
          },
        ]}
        searchValue={filterValue}
        searchPlaceholder="Search by customer, title, or amount..."
        onSearchChange={value => {
          setFilterValue(value);
          searchIncome(value);
        }}
        onSearchClear={() => {
          setFilterValue('');
          clearSearch();
        }}
        statusFilters={STATUS_FILTERS}
        selectedStatus={statusFilter as IncomeStatus}
        onStatusChange={status =>
          setStatusFilter(status as IncomeRecordStatus | 'ALL')
        }
        typeFilters={SOURCE_FILTERS}
        selectedType={sourceFilter}
        onTypeChange={type => {
          setSourceFilter(type);
          setStoreSourceFilter(type);
        }}
        onRefresh={fetchIncome}
        onAdd={() => setIsOtherIncomeDrawerOpen(true)}
        addButtonText="Add Income"
        addButtonIcon={<Plus className="w-4 h-4" />}
        items={displayedIncome.map(income => (
          <IncomeCard
            key={income.id}
            income={income}
            onEdit={handleEdit}
            onOtherIncomeClick={handleOtherIncomeClick}
            isDeleting={isDeleting}
            onDelete={id =>
              handleDelete(id, income.sourceType, income.sourceId)
            }
          />
        ))}
        emptyMessage={
          filterValue || sourceFilter !== 'ALL'
            ? 'No income found'
            : 'No income records yet.'
        }
        emptyActionText="Create Your First Income"
        onEmptyAction={() => setIsOtherIncomeDrawerOpen(true)}
        gridConfig={{ default: 1, md: 2, lg: 3 }}
        hasMore={displayedIncome.length < filteredIncome.length}
        isPaginating={isPaginating}
        currentCount={displayedIncome.length}
        totalCount={filteredIncome.length}
      />

      {/* Other Income Drawer for Add/Edit */}
      <AddIncomeDrawer
        isOpen={isOtherIncomeDrawerOpen}
        onClose={handleOtherIncomeDrawerClose}
        incomeId={editIncomeId}
      />

      {/* Other Income Modal for View Details */}
      <OtherIncomeModal
        income={selectedIncome}
        isOpen={isOtherIncomeModalOpen}
        onClose={() => {
          setIsOtherIncomeModalOpen(false);
          setSelectedIncome(null);
        }}
      />

      {/* Sale Drawer for Edit */}
      <CreateSaleDrawer
        saleId={editSaleId}
        isOpen={isSaleDrawerOpen}
        onClose={handleSaleDrawerClose}
      />

      {/* Quotation Drawer for Edit */}
      <CreateQuotationDrawer
        isOpen={isQuotationDrawerOpen}
        quotationId={editQuotationId}
        onClose={handleQuotationDrawerClose}
      />
    </>
  );
}
