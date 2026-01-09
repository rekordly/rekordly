'use client';

import React, { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Wallet } from 'lucide-react';
import { usePurchaseStore } from '@/store/purchase-store';
import { PurchaseCard } from '@/components/ui/PurchaseCard';
import { CreatePurchaseDrawer } from '@/components/drawer/CreatePurchaseDrawer';
import { formatCurrency, formatDate } from '@/lib/fn';
import UniversalListLayout from '@/components/layout/UniversalListLayout';
import UniversalListSkeleton from '@/components/skeleton/UniversalListSkeleton';
import { PurchaseStatusType } from '@/types/purchases';

type PurchaseStatus = 'ALL' | 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED';

const PURCHASE_STATUS_TAGS = [
  { label: 'All', value: 'ALL', color: 'default' as const },
  { label: 'Unpaid', value: 'UNPAID', color: 'danger' as const },
  {
    label: 'Partially Paid',
    value: 'PARTIALLY_PAID',
    color: 'warning' as const,
  },
  { label: 'Paid', value: 'PAID', color: 'success' as const },
  { label: 'Refunded', value: 'REFUNDED', color: 'default' as const },
];

export default function PurchasesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editPurchaseId, setEditPurchaseId] = useState<string | null>(null);

  const {
    displayedPurchases,
    filteredPurchases,
    isInitialLoading,
    isPaginating,
    searchQuery,
    statusFilter,
    displayCount,
    fetchPurchases,
    loadMoreDisplayed,
    searchPurchases,
    clearSearch,
    setStatusFilter,
    refreshPurchases,
    searchPurchasesInDB,
  } = usePurchaseStore();

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  const handleEdit = (purchaseId: string) => {
    setEditPurchaseId(purchaseId);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditPurchaseId(null);
  };

  const totalPurchases = filteredPurchases.length;
  const totalAmount = filteredPurchases.reduce(
    (sum, purchase) => sum + purchase.totalAmount,
    0
  );
  const paidPurchases = filteredPurchases.filter(
    purchase => purchase.status === 'PAID'
  ).length;

  if (isInitialLoading) {
    return <UniversalListSkeleton gridConfig={{ default: 1, md: 2, lg: 3 }} />;
  }

  return (
    <>
      <UniversalListLayout<PurchaseStatus>
        stats={[
          {
            gradient: true,
            description: 'Total Purchases',
            gradientColor: 'primary',
            tag: 'Amount',
            title: formatCurrency(totalAmount),
            icon: <Wallet size={24} />,
          },
          {
            gradient: true,
            description: 'Purchases',
            gradientColor: 'secondary',
            tag: 'All',
            tagColor: 'secondary',
            title: totalPurchases.toString(),
            icon: <ShoppingCart size={24} />,
          },
          {
            gradient: true,
            description: 'Purchases',
            gradientColor: 'secondary',
            tag: 'Paid',
            tagColor: 'secondary',
            title: paidPurchases.toString(),
            icon: <ShoppingCart size={24} />,
          },
        ]}
        searchValue={searchQuery}
        searchPlaceholder="Search by vendor, purchase number, or amount..."
        onSearchChange={value => {
          searchPurchases(value);
          if (value.trim()) {
            setTimeout(() => searchPurchasesInDB(value), 500);
          }
        }}
        onSearchClear={clearSearch}
        statusFilters={PURCHASE_STATUS_TAGS}
        selectedStatus={statusFilter as PurchaseStatus}
        onStatusChange={status =>
          setStatusFilter(status as PurchaseStatusType | 'ALL')
        }
        onRefresh={refreshPurchases}
        onAdd={() => setIsModalOpen(true)}
        addButtonText="Add Purchase"
        addButtonIcon={<Plus className="w-5 h-5" />}
        leftContent={
          <span className="text-sm text-default-500">
            {searchQuery ? `${totalPurchases} results` : 'All purchases'}
          </span>
        }
        items={displayedPurchases.map(purchase => (
          <PurchaseCard
            purchaseType="INVENTORY_RESTOCK"
            key={purchase.id}
            amount={formatCurrency(purchase.totalAmount)}
            vendorName={purchase.vendorName || 'No Vendor'}
            date={formatDate(purchase.purchaseDate)}
            id={purchase.id}
            purchaseNumber={purchase.purchaseNumber}
            status={purchase.status}
            title={purchase.title || 'Purchase'}
            onEdit={handleEdit}
          />
        ))}
        emptyMessage={
          searchQuery || statusFilter !== 'ALL'
            ? 'No purchases found'
            : 'No purchases yet'
        }
        emptyActionText="Create Your First Purchase"
        onEmptyAction={() => setIsModalOpen(true)}
        gridConfig={{ default: 1, md: 2, lg: 3 }}
        hasMore={displayCount < filteredPurchases.length}
        isPaginating={isPaginating}
        currentCount={displayCount}
        totalCount={totalPurchases}
      />

      <CreatePurchaseDrawer
        isOpen={isModalOpen}
        onClose={handleModalClose}
        purchaseId={editPurchaseId}
        purchaseType="INVENTORY_RESTOCK"
      />
    </>
  );
}
