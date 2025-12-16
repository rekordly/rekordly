'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@heroui/button';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Input } from '@heroui/input';
import { Chip } from '@heroui/chip';
import { Spinner } from '@heroui/spinner';
import { Plus, Receipt, Search, X, RefreshCw } from 'lucide-react';

import StatCard from '@/components/ui/StatCard';
import { SaleCard } from '@/components/ui/SalesCard';
import { CreateSaleDrawer } from '@/components/drawer/CreateSaleDrawer';
import { useSaleStore } from '@/store/saleStore';
import { formatCurrency, formatDate, SALE_STATUS_TAGS } from '@/lib/fn';
import { CardSkeleton } from '@/components/skeleton/CardSkeleton';
import { SaleStatusType } from '@/types/sales';

export default function SalePage() {
  const [showSearch, setShowSearch] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editSaleId, setEditSaleId] = useState<string | null>(null);
  const observerTarget = useRef<HTMLDivElement>(null);

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
    searchSalesInDB,
  } = useSaleStore();

  // Initial fetch
  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  // Infinite scroll observer
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const target = entries[0];
      const hasMore = displayCount < filteredSales.length;

      if (target.isIntersecting && hasMore && !isPaginating) {
        loadMoreDisplayed();
      }
    },
    [displayCount, filteredSales.length, isPaginating, loadMoreDisplayed]
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
    searchSales(value);

    // If no results found locally, search in DB
    if (value.trim()) {
      setTimeout(() => {
        searchSalesInDB(value);
      }, 500);
    }
  };

  const handleClearSearch = () => {
    clearSearch();
    setShowSearch(false);
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await refreshSales();
    setIsRefreshing(false);
  };

  const handleEdit = (saleId: string) => {
    setEditSaleId(saleId);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditSaleId(null);
  };

  // Calculate stats from ALL sales
  const totalSales = filteredSales.length;
  const totalAmount = filteredSales.reduce(
    (sum, sale) => sum + sale.totalAmount,
    0
  );
  const paidSales = filteredSales.filter(sale => sale.status === 'PAID').length;
  const pendingSales = filteredSales.filter(
    sale => sale.status === 'UNPAID' || sale.status === 'PARTIALLY_PAID'
  ).length;

  const hasMore = displayCount < filteredSales.length;

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
              description="Sales"
              gradientColor="secondary"
              tag="All"
              tagColor="secondary"
              title={totalSales.toString()}
            />
            <StatCard
              compact
              gradient
              description="Sales"
              gradientColor="secondary"
              tag="Paid"
              tagColor="secondary"
              title={paidSales.toString()}
            />
          </div>

          {/* Sales List Section */}
          <div className="w-full lg:w-8/12 space-y-6">
            <Card className="rounded-3xl bg-transparent px-0" shadow="none">
              <CardHeader className="flex items-center justify-between py-6">
                <div className="flex items-center gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-foreground font-heading tracking-tight leading-tight flex items-center gap-2">
                      Sales
                      {(isInitialLoading || isRefreshing || isPaginating) && (
                        <Spinner color="primary" size="sm" />
                      )}
                    </h3>
                    <p className="text-xs text-default-500">
                      {searchQuery ? `${totalSales} results` : 'All sales'}
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
                    placeholder="Search by customer, receipt number, or amount..."
                    startContent={
                      <Search className="w-4 h-4 text-default-400" />
                    }
                    value={searchQuery}
                    onValueChange={handleSearch}
                  />
                )}

                <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                  {SALE_STATUS_TAGS.map(tag => (
                    <Chip
                      key={tag.value}
                      color={statusFilter === tag.value ? tag.color : 'default'}
                      variant={statusFilter === tag.value ? 'solid' : 'flat'}
                      className="cursor-pointer text-xs"
                      onClick={() =>
                        setStatusFilter(tag.value as SaleStatusType | 'ALL')
                      }
                    >
                      {tag.label}
                    </Chip>
                  ))}
                </div>

                {isInitialLoading && <CardSkeleton />}

                {!isInitialLoading && displayedSales.length === 0 && (
                  <div className="text-center py-8">
                    <Receipt className="w-12 h-12 mx-auto text-default-300 mb-2" />
                    <p className="text-sm text-default-500">
                      {searchQuery || statusFilter !== 'ALL'
                        ? 'No sales found'
                        : 'No sales yet'}
                    </p>
                    {!searchQuery && statusFilter === 'ALL' && (
                      <Button
                        className="mt-4"
                        color="primary"
                        size="sm"
                        onPress={() => setIsModalOpen(true)}
                      >
                        Create Your First Sale
                      </Button>
                    )}
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-x-6">
                  {!isInitialLoading &&
                    displayedSales.map(sale => (
                      <SaleCard
                        key={sale.id}
                        amount={formatCurrency(sale.totalAmount)}
                        customerName={
                          sale.customer?.name ||
                          sale.customerName ||
                          'No Customer'
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
                </div>

                <div ref={observerTarget} className="py-4 text-center">
                  {isPaginating && hasMore && (
                    <Spinner color="primary" size="sm" />
                  )}
                  {!isPaginating && hasMore && (
                    <p className="text-xs text-default-400">
                      Showing {displayCount} of {totalSales}
                    </p>
                  )}
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>

      <CreateSaleDrawer
        saleId={editSaleId}
        isOpen={isModalOpen}
        onClose={handleModalClose}
      />
    </>
  );
}
