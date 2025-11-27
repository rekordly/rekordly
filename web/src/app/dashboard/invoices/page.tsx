'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@heroui/button';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Input } from '@heroui/input';
import { Chip } from '@heroui/chip';
import { Spinner } from '@heroui/spinner';
import { Plus, FileText, Search, X, RefreshCw } from 'lucide-react';

import StatCard from '@/components/ui/StatCard';
import { InvoiceCard } from '@/components/ui/InvoiceCard';
import { CreateInvoiceDrawer } from '@/components/drawer/CreateInvoiceDrawer';
import { useInvoiceStore } from '@/store/invoiceStore';
import { formatCurrency, formatDate, STATUS_TAGS } from '@/lib/fn';
import { CardSkeleton } from '@/components/skeleton/CardSkeleton';

export default function InvoicePage() {
  const [showSearch, setShowSearch] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editInvoiceId, setEditInvoiceId] = useState<string | null>(null); // ✅ Track invoice being edited
  const observerTarget = useRef<HTMLDivElement>(null);

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

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const target = entries[0];
      const hasMore = displayCount < filteredInvoices.length;

      if (target.isIntersecting && hasMore && !isPaginating) {
        loadMoreDisplayed();
      }
    },
    [displayCount, filteredInvoices.length, isPaginating, loadMoreDisplayed]
  );

  useEffect(() => {
    const element = observerTarget.current;

    if (!element) return;

    const observer = new IntersectionObserver(handleObserver, {
      root: null,
      rootMargin: '100px',
      threshold: 0,
    });

    observer.observe(element);

    return () => {
      if (element) observer.unobserve(element);
    };
  }, [handleObserver]);

  const handleSearch = (value: string) => {
    searchInvoices(value);

    if (value.trim()) {
      setTimeout(() => {
        searchInvoicesInDB(value);
      }, 500);
    }
  };

  const handleClearSearch = () => {
    clearSearch();
    setShowSearch(false);
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await refreshInvoices();
    setIsRefreshing(false);
  };

  // ✅ Handle edit - opens modal with invoice ID
  const handleEdit = (invoiceId: string) => {
    setEditInvoiceId(invoiceId);
    setIsModalOpen(true);
  };

  // ✅ Handle modal close - clear edit state
  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditInvoiceId(null);
  };

  // ✅ No need to refresh after success - store is already updated!
  const handleSuccess = () => {
    // Optional: You can still refresh if you want to ensure DB sync
    // But it's not necessary since we update the store optimistically
  };

  const totalInvoices = filteredInvoices.length;
  const totalAmount = filteredInvoices.reduce(
    (sum, inv) => sum + inv.totalAmount,
    0
  );
  const paidInvoices = filteredInvoices.filter(
    inv => inv.status === 'CONVERTED'
  ).length;
  const pendingInvoices = filteredInvoices.filter(
    inv => inv.status === 'DRAFT' || inv.status === 'SENT'
  ).length;

  const hasMore = displayCount < filteredInvoices.length;

  return (
    <>
      <div className="px-0">
        <div className="lg:flex flex-row-reverse gap-6 items-start space-y-6">
          {/* Stats Section */}
          <div className="flex-1 gap-3 grid grid-cols-2">
            <StatCard
              compact
              gradient
              className="col-span-2"
              description="Total Revenue"
              gradientColor="primary"
              tag="Amount"
              title={formatCurrency(totalAmount)}
            />
            <StatCard
              compact
              gradient
              description="Invoices"
              gradientColor="secondary"
              tag="All"
              tagColor="secondary"
              title={totalInvoices.toString()}
            />
            <StatCard
              compact
              gradient
              description="Invoices"
              gradientColor="secondary"
              tag="Converted"
              tagColor="secondary"
              title={paidInvoices.toString()}
            />
          </div>

          {/* Invoices List Section */}
          <div className="w-full lg:w-8/12 space-y-6">
            <Card className="rounded-3xl px-2" shadow="none">
              <CardHeader className="flex items-center justify-between py-6">
                <div className="flex items-center gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-foreground font-heading tracking-tight leading-tight flex items-center gap-2">
                      Invoices
                      {(isInitialLoading || isRefreshing || isPaginating) && (
                        <Spinner color="primary" size="sm" />
                      )}
                    </h3>
                    <p className="text-xs text-default-500">
                      {searchQuery
                        ? `${totalInvoices} results`
                        : 'All invoices'}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    isIconOnly
                    className={isRefreshing ? 'animate-spin' : ''}
                    color="default"
                    isDisabled={isRefreshing}
                    startContent={<RefreshCw className="w-5 h-5" />}
                    variant="ghost"
                    onPress={handleManualRefresh}
                  />

                  <Button
                    isIconOnly
                    color="default"
                    variant={showSearch ? 'flat' : 'ghost'}
                    onPress={() => {
                      if (showSearch && searchQuery) {
                        handleClearSearch();
                      } else {
                        setShowSearch(!showSearch);
                      }
                    }}
                  >
                    {showSearch && searchQuery ? (
                      <X className="w-5 h-5" />
                    ) : (
                      <Search className="w-5 h-5" />
                    )}
                  </Button>

                  <Button
                    isIconOnly
                    color="primary"
                    startContent={<Plus className="w-5 h-5" />}
                    onPress={() => setIsModalOpen(true)}
                  />
                </div>
              </CardHeader>

              <CardBody className="space-y-3">
                {showSearch && (
                  <Input
                    autoFocus
                    classNames={{
                      input: 'text-sm',
                      inputWrapper: 'h-12 rounded-2xl',
                    }}
                    endContent={
                      searchQuery && (
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          onPress={handleClearSearch}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )
                    }
                    placeholder="Search by customer, invoice number, or amount..."
                    startContent={
                      <Search className="w-4 h-4 text-default-400" />
                    }
                    value={searchQuery}
                    onValueChange={handleSearch}
                  />
                )}

                <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                  {STATUS_TAGS.map(tag => (
                    <Chip
                      key={tag.value}
                      className="cursor-pointer text-xs"
                      color={statusFilter === tag.value ? tag.color : 'default'}
                      variant={statusFilter === tag.value ? 'solid' : 'flat'}
                      onClick={() => setStatusFilter(tag.value)}
                    >
                      {tag.label}
                    </Chip>
                  ))}
                </div>

                {isInitialLoading && <CardSkeleton />}

                {!isInitialLoading && displayedInvoices.length === 0 && (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 mx-auto text-default-300 mb-2" />
                    <p className="text-sm text-default-500">
                      {searchQuery || statusFilter !== 'ALL'
                        ? 'No invoices found'
                        : 'No invoices yet'}
                    </p>
                    {!searchQuery && statusFilter === 'ALL' && (
                      <Button
                        className="mt-4"
                        color="primary"
                        size="sm"
                        onPress={() => setIsModalOpen(true)}
                      >
                        Create Your First Invoice
                      </Button>
                    )}
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-x-6">
                  {!isInitialLoading &&
                    displayedInvoices.map(invoice => (
                      <InvoiceCard
                        key={invoice.id}
                        amount={formatCurrency(invoice.totalAmount)}
                        customerName={
                          invoice.customer?.name ||
                          invoice.customerName ||
                          'No Customer'
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
                </div>

                <div ref={observerTarget} className="py-4 text-center">
                  {isPaginating && hasMore && (
                    <Spinner color="primary" size="sm" />
                  )}
                  {!isPaginating && hasMore && (
                    <p className="text-xs text-default-400">
                      Showing {displayCount} of {totalInvoices}
                    </p>
                  )}
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>

      <CreateInvoiceDrawer
        invoiceId={editInvoiceId}
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSuccess={handleSuccess}
      />
    </>
  );
}
