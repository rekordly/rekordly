'use client';

import React, { useState, useEffect } from 'react';
import { Receipt, Plus, Wallet } from 'lucide-react';
import { useSaleStore } from '@/store/saleStore';
import { SaleCard } from '@/components/ui/SalesCard';
import { CreateSaleDrawer } from '@/components/drawer/CreateSaleDrawer';
import { formatCurrency, formatDate } from '@/lib/fn';
import UniversalListLayout from '@/components/layout/UniversalListLayout';
import UniversalListSkeleton from '@/components/skeleton/UniversalListSkeleton';

type SaleStatus =
  | 'ALL'
  | 'UNPAID'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

const SALE_STATUS_FILTERS = [
  {
    label: 'All Status',
    value: 'ALL' as SaleStatus,
    color: 'default' as const,
  },
  { label: 'Paid', value: 'PAID' as SaleStatus, color: 'success' as const },
  { label: 'Unpaid', value: 'UNPAID' as SaleStatus, color: 'danger' as const },
  {
    label: 'Partially Paid',
    value: 'PARTIALLY_PAID' as SaleStatus,
    color: 'warning' as const,
  },
  {
    label: 'Refunded',
    value: 'REFUNDED' as SaleStatus,
    color: 'default' as const,
  },
  {
    label: 'Partially Refunded',
    value: 'PARTIALLY_REFUNDED' as SaleStatus,
    color: 'warning' as const,
  },
];

export default function SalePage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editSaleId, setEditSaleId] = useState<string | null>(null);

  const {
    displayedSales,
    filteredSales,
    isInitialLoading,
    isPaginating,
    searchQuery,
    statusFilter,
    displayCount,
    fetchSales,
    loadMoreDisplayed,
    searchSales,
    clearSearch,
    setStatusFilter,
    refreshSales,
  } = useSaleStore();

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  const handleEdit = (saleId: string) => {
    setEditSaleId(saleId);
    setIsModalOpen(true);
  };

  const totalSales = filteredSales.length;
  const totalAmount = filteredSales.reduce(
    (sum, sale) => sum + sale.totalAmount,
    0
  );
  const paidSales = filteredSales.filter(sale => sale.status === 'PAID').length;

  if (isInitialLoading) {
    return <UniversalListSkeleton gridConfig={{ default: 1, md: 2, lg: 3 }} />;
  }

  return (
    <>
      <UniversalListLayout<SaleStatus>
        stats={[
          {
            gradient: true,
            description: 'Total Revenue',
            gradientColor: 'primary',
            tag: 'Amount',
            title: formatCurrency(totalAmount),
            icon: <Wallet size={24} />,
          },
          {
            gradient: true,
            description: 'Total Sales',
            gradientColor: 'secondary',
            tag: 'All',
            tagColor: 'secondary',
            title: totalSales.toString(),
            icon: <Receipt size={24} />,
          },
          {
            gradient: true,
            description: 'Paid Sales',
            gradientColor: 'success',
            tag: 'Paid',
            tagColor: 'success',
            title: paidSales.toString(),
            icon: <Receipt size={24} />,
          },
        ]}
        searchValue={searchQuery}
        searchPlaceholder="Search by customer, receipt number, or amount..."
        onSearchChange={searchSales}
        onSearchClear={clearSearch}
        statusFilters={SALE_STATUS_FILTERS}
        selectedStatus={statusFilter as SaleStatus}
        onStatusChange={status => setStatusFilter(status as any)}
        onRefresh={refreshSales}
        onAdd={() => setIsModalOpen(true)}
        addButtonText="Add Sale"
        addButtonIcon={<Plus className="w-5 h-5" />}
        leftContent={
          <span className="text-sm text-default-500">
            {displayedSales.length} sales
          </span>
        }
        items={displayedSales.map(sale => (
          <SaleCard
            key={sale.id}
            amount={formatCurrency(sale.totalAmount)}
            customerName={
              sale.customer?.name || sale.customerName || 'No Customer'
            }
            date={formatDate(sale.saleDate)}
            id={sale.id}
            receiptNumber={sale.receiptNumber}
            status={sale.status}
            title={sale.title || 'Sale'}
            sourceType={sale.sourceType}
            onEdit={handleEdit}
          />
        ))}
        emptyMessage={
          searchQuery || statusFilter !== 'ALL'
            ? 'No sales found'
            : 'No sales yet'
        }
        emptyActionText="Create Your First Sale"
        onEmptyAction={() => setIsModalOpen(true)}
        gridConfig={{ default: 1, md: 2, lg: 3 }}
        hasMore={displayCount < filteredSales.length}
        isPaginating={isPaginating}
        currentCount={displayCount}
        totalCount={totalSales}
      />

      <CreateSaleDrawer
        saleId={editSaleId}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditSaleId(null);
        }}
      />
    </>
  );
}
