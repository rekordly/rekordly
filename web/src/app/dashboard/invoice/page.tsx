'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@heroui/button';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Input } from '@heroui/input';
import { Chip } from '@heroui/chip';
import { Spinner } from '@heroui/spinner';
import { Skeleton } from '@heroui/skeleton';
import { Plus, FileText, Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

import StatCard from '@/components/ui/StatCard';
import { InvoiceCard } from '@/components/ui/InvoiceCard';
import { useInvoiceStore } from '@/store/invoiceStore';
import {
  formatCurrency,
  formatDate,
  getStatusConfig,
  STATUS_TAGS,
} from '@/lib/fn';
import { InvoiceStatus } from '@/types/invoice';

export default function InvoicePage() {
  const router = useRouter();
  const [showSearch, setShowSearch] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);

  const {
    filteredInvoices,
    loading,
    searchQuery,
    statusFilter,
    hasMore,
    fetchInvoices,
    fetchMoreInvoices,
    searchInvoices,
    clearSearch,
    setStatusFilter,
  } = useInvoiceStore();

  // Initial fetch - will use cached data first if available
  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Infinite scroll observer
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const target = entries[0];
      if (target.isIntersecting && hasMore && !loading) {
        fetchMoreInvoices();
      }
    },
    [hasMore, loading, fetchMoreInvoices]
  );

  useEffect(() => {
    const element = observerTarget.current;
    if (!element) return;

    const option = {
      root: null,
      rootMargin: '100px',
      threshold: 0,
    };

    const observer = new IntersectionObserver(handleObserver, option);
    observer.observe(element);

    return () => {
      if (element) {
        observer.unobserve(element);
      }
    };
  }, [handleObserver]);

  const handleSearch = (value: string) => {
    searchInvoices(value);
  };

  const handleClearSearch = () => {
    clearSearch();
    setShowSearch(false);
  };

  const handleStatusFilter = (status: InvoiceStatus | 'ALL') => {
    setStatusFilter(status);
  };

  // Calculate stats
  const totalInvoices = filteredInvoices.length;
  const totalAmount = filteredInvoices.reduce(
    (sum, inv) => sum + inv.totalAmount,
    0
  );
  const paidInvoices = filteredInvoices.filter(
    inv => inv.status === 'PAID'
  ).length;
  const pendingInvoices = filteredInvoices.filter(
    inv => inv.status === 'DRAFT' || inv.status === 'SENT'
  ).length;

  return (
    <div className="px-0">
      <div className="lg:flex flex-row-reverse gap-6 space-y-6">
        {/* Stats Section */}
        <div className="flex-1 gap-3 grid grid-cols-2">
          <StatCard
            tag="Total"
            title={totalInvoices.toString()}
            description="All Invoices"
            gradientColor="primary"
            gradient
            compact
          />
          <StatCard
            tag="Amount"
            title={formatCurrency(totalAmount)}
            description="Total Revenue"
            gradientColor="primary"
            gradient
            compact
          />
          <StatCard
            tag="Paid"
            title={paidInvoices.toString()}
            description="Completed"
            gradientColor="primary"
            gradient
            compact
          />
          <StatCard
            tag="Pending"
            title={pendingInvoices.toString()}
            description="Awaiting Payment"
            gradientColor="secondary"
            tagColor="secondary"
            gradient
            compact
          />
        </div>

        {/* Invoices List Section */}
        <div className="w-full lg:w-8/12 space-y-6">
          <Card shadow="none" className="rounded-3xl">
            <CardHeader className="flex items-center justify-between py-6">
              <div className="flex items-center gap-2">
                <div>
                  <h3 className="text-base font-semibold text-foreground font-heading tracking-tight leading-tight">
                    Invoices
                  </h3>
                  <p className="text-xs text-default-500">
                    {searchQuery
                      ? `${filteredInvoices.length} results`
                      : 'Recent invoices'}
                  </p>
                </div>
                {loading && <Spinner size="sm" color="primary" />}
              </div>

              <div className="flex gap-2">
                {/* Search Toggle Button */}
                <Button
                  color="default"
                  variant={showSearch ? 'flat' : 'light'}
                  isIconOnly
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

                {/* Create New Invoice Button */}
                <Button
                  color="primary"
                  isIconOnly
                  onPress={() => router.push('/dashboard/invoice/new')}
                  startContent={<Plus className="w-5 h-5" />}
                />
              </div>
            </CardHeader>

            <CardBody className="space-y-3">
              {/* Search Input */}
              {showSearch && (
                <Input
                  placeholder="Search by customer, invoice number, or amount..."
                  value={searchQuery}
                  onValueChange={handleSearch}
                  startContent={<Search className="w-4 h-4 text-default-400" />}
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
                  classNames={{
                    input: 'text-sm',
                    inputWrapper: 'h-12 rounded-2xl',
                  }}
                  autoFocus
                />
              )}

              {/* Status Filter Tags */}
              <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                {STATUS_TAGS.map(tag => (
                  <Chip
                    key={tag.value}
                    color={statusFilter === tag.value ? tag.color : 'default'}
                    variant={statusFilter === tag.value ? 'solid' : 'flat'}
                    className="cursor-pointer text-xs"
                    onClick={() => handleStatusFilter(tag.value)}
                  >
                    {tag.label}
                  </Chip>
                ))}
              </div>

              {/* Loading State - Skeleton */}
              {loading && filteredInvoices.length === 0 && (
                <div className="space-y-3">
                  {[...Array(5)].map((_, index) => (
                    <div
                      key={index}
                      className="p-4 bg-white dark:bg-background rounded-2xl shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <Skeleton className="w-9 h-9 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/4 rounded-lg" />
                          <Skeleton className="h-3 w-1/2 rounded-lg" />
                          <div className="flex items-center justify-between pt-2">
                            <Skeleton className="h-3 w-1/3 rounded-lg" />
                            <Skeleton className="h-6 w-16 rounded-lg" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Empty State */}
              {!loading && filteredInvoices.length === 0 && (
                <div className="text-center py-8">
                  <FileText className="w-12 h-12 mx-auto text-default-300 mb-2" />
                  <p className="text-sm text-default-500">
                    {searchQuery || statusFilter !== 'ALL'
                      ? 'No invoices found'
                      : 'No invoices yet'}
                  </p>
                  {!searchQuery && statusFilter === 'ALL' && (
                    <Button
                      color="primary"
                      size="sm"
                      className="mt-4"
                      onPress={() => router.push('/dashboard/invoice/new')}
                    >
                      Create Your First Invoice
                    </Button>
                  )}
                </div>
              )}

              {filteredInvoices.map(invoice => {
                const statusConfig = getStatusConfig(invoice.status);
                return (
                  <InvoiceCard
                    key={invoice.id}
                    id={invoice.id}
                    invoiceNumber={invoice.invoiceNumber}
                    title={invoice.title || 'Invoice'}
                    status={invoice.status}
                    customerName={
                      invoice.customer?.name ||
                      invoice.customerName ||
                      'No Customer'
                    }
                    amount={formatCurrency(invoice.totalAmount)}
                    date={formatDate(invoice.issueDate)}
                    onDelete={fetchInvoices}
                  />
                );
              })}

              {/* Infinite Scroll Trigger */}
              <div ref={observerTarget} className="py-4 text-center">
                {loading && hasMore && <Spinner size="sm" color="primary" />}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
