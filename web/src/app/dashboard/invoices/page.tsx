'use client';

import React, { useState, useEffect } from 'react';
import { FileText, Plus, Wallet } from 'lucide-react';
import { useInvoiceStore } from '@/store/invoiceStore';
import { InvoiceCard } from '@/components/ui/InvoiceCard';
import { CreateInvoiceDrawer } from '@/components/drawer/CreateInvoiceDrawer';
import { formatCurrency, formatDate, STATUS_TAGS } from '@/lib/fn';
import UniversalListLayout from '@/components/layout/UniversalListLayout';
import UniversalListSkeleton from '@/components/skeleton/UniversalListSkeleton';

type InvoiceStatus = 'ALL' | 'DRAFT' | 'SENT' | 'CONVERTED';

export default function InvoicePage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editInvoiceId, setEditInvoiceId] = useState<string | null>(null);

  const {
    displayedInvoices,
    filteredInvoices,
    isInitialLoading,
    isPaginating,
    searchQuery,
    statusFilter,
    displayCount,
    fetchInvoices,
    loadMoreDisplayed,
    searchInvoices,
    clearSearch,
    setStatusFilter,
    refreshInvoices,
    searchInvoicesInDB,
  } = useInvoiceStore();

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleEdit = (invoiceId: string) => {
    setEditInvoiceId(invoiceId);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditInvoiceId(null);
  };

  const totalInvoices = filteredInvoices.length;
  const totalAmount = filteredInvoices.reduce(
    (sum, inv) => sum + inv.totalAmount,
    0
  );
  const paidInvoices = filteredInvoices.filter(
    inv => inv.status === 'CONVERTED'
  ).length;

  if (isInitialLoading) {
    return <UniversalListSkeleton gridConfig={{ default: 1, md: 2, lg: 3 }} />;
  }

  return (
    <>
      <UniversalListLayout<InvoiceStatus>
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
            description: 'Invoices',
            gradientColor: 'secondary',
            tag: 'All',
            tagColor: 'secondary',
            title: totalInvoices.toString(),
            icon: <FileText size={24} />,
          },
          {
            gradient: true,
            description: 'Invoices',
            gradientColor: 'secondary',
            tag: 'Converted',
            tagColor: 'secondary',
            title: paidInvoices.toString(),
            icon: <FileText size={24} />,
          },
        ]}
        searchValue={searchQuery}
        searchPlaceholder="Search by customer, invoice number, or amount..."
        onSearchChange={value => {
          searchInvoices(value);
          if (value.trim()) {
            setTimeout(() => searchInvoicesInDB(value), 500);
          }
        }}
        onSearchClear={clearSearch}
        statusFilters={STATUS_TAGS}
        selectedStatus={statusFilter as InvoiceStatus}
        onStatusChange={status => setStatusFilter(status as any)}
        onRefresh={refreshInvoices}
        onAdd={() => setIsModalOpen(true)}
        addButtonText="Add Invoice"
        addButtonIcon={<Plus className="w-5 h-5" />}
        leftContent={
          <span className="text-sm text-default-500">
            {searchQuery ? `${totalInvoices} results` : 'All invoices'}
          </span>
        }
        items={displayedInvoices.map(invoice => (
          <InvoiceCard
            key={invoice.id}
            amount={formatCurrency(invoice.totalAmount)}
            customerName={
              invoice.customer?.name || invoice.customerName || 'No Customer'
            }
            date={formatDate(invoice.issueDate)}
            id={invoice.id}
            invoiceNumber={invoice.invoiceNumber}
            status={invoice.status}
            title={invoice.title || 'Invoice'}
            onDelete={refreshInvoices}
            onEdit={handleEdit}
          />
        ))}
        emptyMessage={
          searchQuery || statusFilter !== 'ALL'
            ? 'No invoices found'
            : 'No invoices yet'
        }
        emptyActionText="Create Your First Invoice"
        onEmptyAction={() => setIsModalOpen(true)}
        gridConfig={{ default: 1, md: 2, lg: 3 }}
        hasMore={displayCount < filteredInvoices.length}
        isPaginating={isPaginating}
        currentCount={displayCount}
        totalCount={totalInvoices}
      />

      <CreateInvoiceDrawer
        invoiceId={editInvoiceId}
        isOpen={isModalOpen}
        onClose={handleModalClose}
      />
    </>
  );
}
