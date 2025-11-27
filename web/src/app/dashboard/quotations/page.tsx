'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@heroui/button';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Input } from '@heroui/input';
import { Chip } from '@heroui/chip';
import { Spinner } from '@heroui/spinner';
import { Plus, FileText, Search, X, RefreshCw } from 'lucide-react';

import StatCard from '@/components/ui/StatCard';
import { QuotationCard } from '@/components/ui/QuotationCard';
import { CreateQuotationDrawer } from '@/components/drawer/CreateQuotationDrawer';
import { useQuotationStore } from '@/store/quotationStore';
import { formatCurrency, formatDate, QUOTATION_STATUS_TAGS } from '@/lib/fn';
import { CardSkeleton } from '@/components/skeleton/CardSkeleton';

export default function QuotationPage() {
  const [showSearch, setShowSearch] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editQuotationId, seteditQuotationId] = useState<string | null>(null);
  const observerTarget = useRef<HTMLDivElement>(null);

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

  // Initial fetch
  useEffect(() => {
    fetchQuotations();
  }, [fetchQuotations]);

  // Infinite scroll observer
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const target = entries[0];
      const hasMore = displayCount < filteredQuotations.length;

      if (target.isIntersecting && hasMore && !isPaginating) {
        loadMoreDisplayed();
      }
    },
    [displayCount, filteredQuotations.length, isPaginating, loadMoreDisplayed]
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
    searchQuotations(value);

    // If no results found locally, search in DB
    if (value.trim()) {
      setTimeout(() => {
        searchQuotationsInDB(value);
      }, 500);
    }
  };

  const handleClearSearch = () => {
    clearSearch();
    setShowSearch(false);
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await refreshQuotations();
    setIsRefreshing(false);
  };

  const handleEdit = (invoiceId: string) => {
    seteditQuotationId(invoiceId);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    seteditQuotationId(null);
  };

  // Calculate stats from ALL quotations
  const totalQuotations = filteredQuotations.length;
  const totalAmount = filteredQuotations.reduce(
    (sum, quot) => sum + quot.totalAmount,
    0
  );
  const paidQuotations = filteredQuotations.filter(
    quot => quot.status === 'PAID'
  ).length;
  const pendingQuotations = filteredQuotations.filter(
    quot =>
      quot.status === 'DRAFT' ||
      quot.status === 'SENT' ||
      quot.status === 'UNPAID'
  ).length;

  const hasMore = displayCount < filteredQuotations.length;

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
              description="Quotations"
              gradientColor="secondary"
              tag="All"
              tagColor="secondary"
              title={totalQuotations.toString()}
            />
            <StatCard
              compact
              gradient
              description="Quotations"
              gradientColor="secondary"
              tag="Paid"
              tagColor="secondary"
              title={paidQuotations.toString()}
            />
          </div>

          {/* Quotations List Section */}
          <div className="w-full lg:w-8/12 space-y-6">
            <Card className="rounded-3xl px-2" shadow="none">
              <CardHeader className="flex items-center justify-between py-6">
                <div className="flex items-center gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-foreground font-heading tracking-tight leading-tight flex items-center gap-2">
                      Quotations
                      {(isInitialLoading || isRefreshing || isPaginating) && (
                        <Spinner color="primary" size="sm" />
                      )}
                    </h3>
                    <p className="text-xs text-default-500">
                      {searchQuery
                        ? `${totalQuotations} results`
                        : 'All quotations'}
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
                    placeholder="Search by customer, quotation number, or amount..."
                    startContent={
                      <Search className="w-4 h-4 text-default-400" />
                    }
                    value={searchQuery}
                    onValueChange={handleSearch}
                  />
                )}

                <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                  {QUOTATION_STATUS_TAGS.map(tag => (
                    <Chip
                      key={tag.value}
                      color={statusFilter === tag.value ? tag.color : 'default'}
                      variant={statusFilter === tag.value ? 'solid' : 'flat'}
                      className="cursor-pointer text-xs"
                      // onClick={() => setStatusFilter(tag.value)}
                    >
                      {tag.label}
                    </Chip>
                  ))}
                </div>

                {isInitialLoading && <CardSkeleton />}

                {!isInitialLoading && displayedQuotations.length === 0 && (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 mx-auto text-default-300 mb-2" />
                    <p className="text-sm text-default-500">
                      {searchQuery || statusFilter !== 'ALL'
                        ? 'No quotations found'
                        : 'No quotations yet'}
                    </p>
                    {!searchQuery && statusFilter === 'ALL' && (
                      <Button
                        className="mt-4"
                        color="primary"
                        size="sm"
                        onPress={() => setIsModalOpen(true)}
                      >
                        Create Your First Quotation
                      </Button>
                    )}
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-x-6">
                  {!isInitialLoading &&
                    displayedQuotations.map(quotation => (
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
                </div>

                <div ref={observerTarget} className="py-4 text-center">
                  {isPaginating && hasMore && (
                    <Spinner color="primary" size="sm" />
                  )}
                  {!isPaginating && hasMore && (
                    <p className="text-xs text-default-400">
                      Showing {displayCount} of {totalQuotations}
                    </p>
                  )}
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>

      <CreateQuotationDrawer
        isOpen={isModalOpen}
        quotationId={editQuotationId}
        onClose={handleModalClose}
      />
    </>
  );
}
