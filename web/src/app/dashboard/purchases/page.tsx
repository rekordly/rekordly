'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@heroui/button';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Input } from '@heroui/input';
import { Chip } from '@heroui/chip';
import { Spinner } from '@heroui/spinner';
import { DateRangePicker } from '@heroui/date-picker';
import {
  Plus,
  ShoppingCart,
  Search,
  X,
  RefreshCw,
  Calendar,
} from 'lucide-react';

import StatCard from '@/components/ui/StatCard';
import { PurchaseCard } from '@/components/ui/PurchaseCard';
import { CreatePurchaseDrawer } from '@/components/drawer/CreatePurchaseDrawer';
import { usePurchaseStore } from '@/store/purchase-store';
import { formatCurrency, formatDate } from '@/lib/fn';
import { CardSkeleton } from '@/components/skeleton/CardSkeleton';
import { PurchaseStatusType, DateFilterType } from '@/types/purchases';

// Helper function to convert DateValue to Date for display
const dateValueToDate = (dateValue: any): Date => {
  if (!dateValue) return new Date();
  if (dateValue instanceof Date) return dateValue;
  if (dateValue.year && dateValue.month && dateValue.day) {
    return new Date(dateValue.year, dateValue.month - 1, dateValue.day);
  }
  return new Date(dateValue);
};

export default function PurchasesPage() {
  const [showSearch, setShowSearch] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editPurchaseId, setEditPurchaseId] = useState<string | null>(null);
  const observerTarget = useRef<HTMLDivElement>(null);

  const {
    displayedPurchases,
    filteredPurchases,
    isInitialLoading,
    isPaginating,
    searchQuery,
    statusFilter,
    dateFilter,
    displayCount,
    fetchPurchases,
    loadMoreDisplayed,
    searchPurchases,
    clearSearch,
    setStatusFilter,
    setDateFilter,
    refreshPurchases,
    searchPurchasesInDB,
  } = usePurchaseStore();

  // Initial fetch
  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  // Infinite scroll observer
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const target = entries[0];
      const hasMore = displayCount < filteredPurchases.length;

      if (target.isIntersecting && hasMore && !isPaginating) {
        loadMoreDisplayed();
      }
    },
    [displayCount, filteredPurchases.length, isPaginating, loadMoreDisplayed]
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
    searchPurchases(value);

    // If no results found locally, search in DB
    if (value.trim()) {
      setTimeout(() => {
        searchPurchasesInDB(value);
      }, 500);
    }
  };

  const handleClearSearch = () => {
    clearSearch();
    setShowSearch(false);
  };

  const handleDateRangeChange = (dateRange: any) => {
    if (dateRange && dateRange.start && dateRange.end) {
      setDateFilter({
        start: dateRange.start,
        end: dateRange.end,
      });
    } else {
      setDateFilter(null);
    }
    setShowDatePicker(false);
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await refreshPurchases();
    setIsRefreshing(false);
  };

  const handleEdit = (purchaseId: string) => {
    setEditPurchaseId(purchaseId);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditPurchaseId(null);
  };

  // Calculate stats from ALL purchases
  const totalPurchases = filteredPurchases.length;
  const totalAmount = filteredPurchases.reduce(
    (sum, purchase) => sum + purchase.totalAmount,
    0
  );
  const paidPurchases = filteredPurchases.filter(
    purchase => purchase.status === 'PAID'
  ).length;
  const pendingPurchases = filteredPurchases.filter(
    purchase =>
      purchase.status === 'UNPAID' || purchase.status === 'PARTIALLY_PAID'
  ).length;

  const hasMore = displayCount < filteredPurchases.length;

  // Purchase status tags
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
              description="Total Purchases"
              gradientColor="primary"
              tag="Amount"
              title={formatCurrency(totalAmount)}
            />
            <StatCard
              compact
              gradient
              description="Purchases"
              gradientColor="secondary"
              tag="All"
              tagColor="secondary"
              title={totalPurchases.toString()}
            />
            <StatCard
              compact
              gradient
              description="Purchases"
              gradientColor="secondary"
              tag="Paid"
              tagColor="secondary"
              title={paidPurchases.toString()}
            />
          </div>

          {/* Purchases List Section */}
          <div className="w-full lg:w-8/12 space-y-6">
            <Card className="rounded-3xl bg-transparent px-0" shadow="none">
              <CardHeader className="flex items-center justify-between py-6">
                <div className="flex items-center gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-foreground font-heading tracking-tight leading-tight flex items-center gap-2">
                      Purchases
                      {(isInitialLoading || isRefreshing || isPaginating) && (
                        <Spinner color="primary" size="sm" />
                      )}
                    </h3>
                    <p className="text-xs text-default-500">
                      {searchQuery
                        ? `${totalPurchases} results`
                        : 'All purchases'}
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
                    variant={showDatePicker ? 'flat' : 'ghost'}
                    onPress={() => setShowDatePicker(!showDatePicker)}
                  >
                    <Calendar className="w-5 h-5" />
                  </Button>

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
                {/* Date Range Picker */}
                {showDatePicker && (
                  <div className="p-4 bg-default-50 rounded-2xl">
                    <DateRangePicker
                      label="Select date range"
                      onChange={handleDateRangeChange}
                      value={
                        dateFilter?.start && dateFilter?.end
                          ? { start: dateFilter.start, end: dateFilter.end }
                          : null
                      }
                    />
                  </div>
                )}

                {/* Search Input */}
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
                    placeholder="Search by vendor, purchase number, or amount..."
                    startContent={
                      <Search className="w-4 h-4 text-default-400" />
                    }
                    value={searchQuery}
                    onValueChange={handleSearch}
                  />
                )}

                {/* Status Filter */}
                <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                  {PURCHASE_STATUS_TAGS.map(tag => (
                    <Chip
                      key={tag.value}
                      color={statusFilter === tag.value ? tag.color : 'default'}
                      variant={statusFilter === tag.value ? 'solid' : 'flat'}
                      className="cursor-pointer text-xs"
                      onClick={() =>
                        setStatusFilter(tag.value as PurchaseStatusType | 'ALL')
                      }
                    >
                      {tag.label}
                    </Chip>
                  ))}
                </div>

                {/* Date Filter Display */}
                {dateFilter && (dateFilter.start || dateFilter.end) && (
                  <div className="flex items-center justify-between p-2 bg-primary-50 rounded-lg">
                    <span className="text-xs text-primary-700">
                      {dateFilter.start && dateFilter.end
                        ? `From ${formatDate(dateValueToDate(dateFilter.start))} to ${formatDate(dateValueToDate(dateFilter.end))}`
                        : dateFilter.start
                          ? `From ${formatDate(dateValueToDate(dateFilter.start))}`
                          : dateFilter.end
                            ? `Until ${formatDate(dateValueToDate(dateFilter.end))}`
                            : ''}
                    </span>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      onPress={() => setDateFilter(null)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                )}

                {isInitialLoading && <CardSkeleton />}

                {!isInitialLoading && displayedPurchases.length === 0 && (
                  <div className="text-center py-8">
                    <ShoppingCart className="w-12 h-12 mx-auto text-default-300 mb-2" />
                    <p className="text-sm text-default-500">
                      {searchQuery || statusFilter !== 'ALL' || dateFilter
                        ? 'No purchases found'
                        : 'No purchases yet'}
                    </p>
                    {!searchQuery && statusFilter === 'ALL' && !dateFilter && (
                      <Button
                        className="mt-4"
                        color="primary"
                        size="sm"
                        onPress={() => setIsModalOpen(true)}
                      >
                        Create Your First Purchase
                      </Button>
                    )}
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-x-6">
                  {!isInitialLoading &&
                    displayedPurchases.map(purchase => (
                      <PurchaseCard
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
                </div>

                <div ref={observerTarget} className="py-4 text-center">
                  {isPaginating && hasMore && (
                    <Spinner color="primary" size="sm" />
                  )}
                  {!isPaginating && hasMore && (
                    <p className="text-xs text-default-400">
                      Showing {displayCount} of {totalPurchases}
                    </p>
                  )}
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>

      <CreatePurchaseDrawer
        isOpen={isModalOpen}
        onClose={handleModalClose}
        purchaseId={editPurchaseId}
      />
    </>
  );
}
