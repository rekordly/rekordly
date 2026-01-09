'use client';

import React, { useState, useEffect } from 'react';
import { FileText, Plus, Wallet } from 'lucide-react';
import { useQuotationStore } from '@/store/quotationStore';
import { QuotationCard } from '@/components/ui/QuotationCard';
import { CreateQuotationDrawer } from '@/components/drawer/CreateQuotationDrawer';
import { formatCurrency, formatDate, QUOTATION_STATUS_TAGS } from '@/lib/fn';
import UniversalListLayout from '@/components/layout/UniversalListLayout';
import UniversalListSkeleton from '@/components/skeleton/UniversalListSkeleton';

type QuotationStatus = 'ALL' | 'DRAFT' | 'SENT' | 'UNPAID' | 'PAID';

export default function QuotationPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editQuotationId, setEditQuotationId] = useState<string | null>(null);

  const {
    displayedQuotations,
    filteredQuotations,
    isInitialLoading,
    isPaginating,
    searchQuery,
    statusFilter,
    displayCount,
    fetchQuotations,
    loadMoreDisplayed,
    searchQuotations,
    clearSearch,
    setStatusFilter,
    refreshQuotations,
    searchQuotationsInDB,
  } = useQuotationStore();

  useEffect(() => {
    fetchQuotations();
  }, [fetchQuotations]);

  const handleEdit = (quotationId: string) => {
    setEditQuotationId(quotationId);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditQuotationId(null);
  };

  const totalQuotations = filteredQuotations.length;
  const totalAmount = filteredQuotations.reduce(
    (sum, quot) => sum + quot.totalAmount,
    0
  );
  const paidQuotations = filteredQuotations.filter(
    quot => quot.status === 'PAID'
  ).length;

  if (isInitialLoading) {
    return <UniversalListSkeleton gridConfig={{ default: 1, md: 2, lg: 3 }} />;
  }

  return (
    <>
      <UniversalListLayout<QuotationStatus>
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
            description: 'Quotations',
            gradientColor: 'secondary',
            tag: 'All',
            tagColor: 'secondary',
            title: totalQuotations.toString(),
            icon: <FileText size={24} />,
          },
          {
            gradient: true,
            description: 'Quotations',
            gradientColor: 'secondary',
            tag: 'Paid',
            tagColor: 'secondary',
            title: paidQuotations.toString(),
            icon: <FileText size={24} />,
          },
        ]}
        searchValue={searchQuery}
        searchPlaceholder="Search by customer, quotation number, or amount..."
        onSearchChange={value => {
          searchQuotations(value);
          if (value.trim()) {
            setTimeout(() => searchQuotationsInDB(value), 500);
          }
        }}
        onSearchClear={clearSearch}
        statusFilters={QUOTATION_STATUS_TAGS}
        selectedStatus={statusFilter as QuotationStatus}
        onStatusChange={status => setStatusFilter(status as any)}
        onRefresh={refreshQuotations}
        onAdd={() => setIsModalOpen(true)}
        addButtonText="Add Quotation"
        addButtonIcon={<Plus className="w-5 h-5" />}
        leftContent={
          <span className="text-sm text-default-500">
            {searchQuery ? `${totalQuotations} results` : 'All quotations'}
          </span>
        }
        items={displayedQuotations.map(quotation => (
          <QuotationCard
            key={quotation.id}
            amount={formatCurrency(quotation.totalAmount)}
            customerName={
              quotation.customer?.name ||
              quotation.customerName ||
              'No Customer'
            }
            date={formatDate(quotation.issueDate)}
            id={quotation.id}
            quotationNumber={quotation.quotationNumber}
            status={quotation.status}
            title={quotation.title || 'Quotation'}
            onDelete={refreshQuotations}
            onEdit={handleEdit}
          />
        ))}
        emptyMessage={
          searchQuery || statusFilter !== 'ALL'
            ? 'No quotations found'
            : 'No quotations yet'
        }
        emptyActionText="Create Your First Quotation"
        onEmptyAction={() => setIsModalOpen(true)}
        gridConfig={{ default: 1, md: 2, lg: 3 }}
        hasMore={displayCount < filteredQuotations.length}
        isPaginating={isPaginating}
        currentCount={displayCount}
        totalCount={totalQuotations}
      />

      <CreateQuotationDrawer
        isOpen={isModalOpen}
        quotationId={editQuotationId}
        onClose={handleModalClose}
      />
    </>
  );
}
