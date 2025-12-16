'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@heroui/button';
import { Card, CardBody } from '@heroui/card';
import { Input } from '@heroui/input';
import { Chip } from '@heroui/chip';
import { Spinner } from '@heroui/spinner';
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from '@heroui/dropdown';
import {
  Plus,
  Banknote,
  Search,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Filter,
  Wallet,
  Activity,
} from 'lucide-react';

import StatCard from '@/components/ui/StatCard';
import { LoanCard } from '@/components/ui/LoanCard';
import { CreateLoanDrawer } from '@/components/drawer/CreateLoanDrawer';
import { useLoanStore } from '@/store/loan-store';
import { formatCurrency } from '@/lib/fn';
import { CardSkeleton } from '@/components/skeleton/CardSkeleton';
import { LoanStatus, LoanType } from '@/types/loan';

export default function LoansPage() {
  const [filterValue, setFilterValue] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editLoanId, setEditLoanId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);

  const {
    displayedLoans,
    filteredLoans,
    isInitialLoading,
    isPaginating,
    isDeleting,
    searchQuery,
    typeFilter,
    statusFilter,
    displayCount,
    summary,
    fetchLoans,
    loadMoreDisplayed,
    searchLoans,
    clearSearch,
    setTypeFilter,
    setStatusFilter,
    refreshLoans,
  } = useLoanStore();

  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const target = entries[0];
      const hasMore = displayCount < filteredLoans.length;

      if (target.isIntersecting && hasMore && !isPaginating) {
        loadMoreDisplayed();
      }
    },
    [displayCount, filteredLoans.length, isPaginating, loadMoreDisplayed]
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
    setFilterValue(value);
    searchLoans(value);
  };

  const handleClearSearch = () => {
    setFilterValue('');
    clearSearch();
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await refreshLoans();
    setIsRefreshing(false);
  };

  const handleEdit = (loan: any) => {
    setEditLoanId(loan.id);
    setIsDrawerOpen(true);
  };

  const handleDrawerClose = () => {
    setIsDrawerOpen(false);
    setEditLoanId(null);
  };

  const handleDelete = async (id: string) => {
    // Delete is handled in the store
  };

  const handleTypeFilterChange = (type: string) => {
    setTypeFilter(type as LoanType | 'ALL');
  };

  const totalLoans = filteredLoans.length;
  const hasMore = displayCount < filteredLoans.length;

  const LOAN_STATUS_TAGS = [
    { label: 'All', value: 'ALL', color: 'default' as const },
    { label: 'Active', value: 'ACTIVE', color: 'primary' as const },
    { label: 'Paid Off', value: 'PAID_OFF', color: 'success' as const },
    { label: 'Defaulted', value: 'DEFAULTED', color: 'danger' as const },
  ];

  const TYPE_FILTERS = [
    { label: 'All Loans', value: 'ALL' },
    { label: 'Money Lent', value: 'RECEIVABLE' },
    { label: 'Money Borrowed', value: 'PAYABLE' },
  ];

  // Get net position description
  const getNetPositionDescription = () => {
    if (!summary) return '';

    const position = summary.netLoanPosition;
    const absPosition = Math.abs(position);

    if (position >= 0) {
      return `You have ${formatCurrency(summary.outstandingReceivable)} outstanding from ${summary.activeLoansReceivable} active loans. Your strong lending position indicates ${formatCurrency(absPosition)} net positive balance.`;
    } else {
      return `You owe ${formatCurrency(summary.outstandingPayable)} across ${summary.activeLoansPayable} active loans. Focus on repayments to improve your ${formatCurrency(absPosition)} net borrowing position.`;
    }
  };

  // Get interest description
  const getInterestDescription = () => {
    if (!summary) return '';

    const earned = summary.totalInterestEarned;
    const paid = summary.totalInterestPaid;
    const net = earned - paid;

    if (net >= 0) {
      return `You've earned ${formatCurrency(earned)} in interest from loans, after paying ${formatCurrency(paid)} on borrowed funds. Net interest benefit of ${formatCurrency(net)}.`;
    } else {
      return `Interest paid of ${formatCurrency(paid)} exceeds interest earned of ${formatCurrency(earned)}. Consider reviewing borrowing terms to reduce ${formatCurrency(Math.abs(net))} net interest cost.`;
    }
  };

  const topContent = (
    <div className="flex flex-col gap-4">
      {/* Mobile: Single row with search and filters */}
      <div className="flex gap-2 items-center md:hidden">
        <Input
          isClearable
          classNames={{
            base: 'flex-1 min-w-0',
            inputWrapper: 'border-1 h-9 rounded-xl',
          }}
          placeholder="Search..."
          size="sm"
          startContent={<Search className="w-4 h-4 text-default-300" />}
          value={filterValue}
          variant="bordered"
          onClear={handleClearSearch}
          onValueChange={handleSearch}
        />

        <Dropdown>
          <DropdownTrigger>
            <Button isIconOnly size="sm" variant="flat" className="h-9 w-9">
              <Filter className="w-4 h-4" />
            </Button>
          </DropdownTrigger>
          <DropdownMenu aria-label="Filters">
            <DropdownItem key="filters" isReadOnly className="cursor-default">
              <div className="flex flex-col gap-3 py-2">
                <div>
                  <p className="text-xs md:text-sm font-semibold mb-2">
                    Loan Type
                  </p>
                  <div className="flex flex-col gap-1">
                    {TYPE_FILTERS.map(filter => (
                      <Button
                        key={filter.value}
                        size="sm"
                        variant={typeFilter === filter.value ? 'flat' : 'light'}
                        className="justify-start"
                        onPress={() => handleTypeFilterChange(filter.value)}
                      >
                        {filter.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>

        <Button
          isIconOnly
          className={isRefreshing ? 'animate-spin' : ''}
          size="sm"
          variant="bordered"
          isDisabled={isRefreshing}
          onPress={handleManualRefresh}
        >
          <RefreshCw className="w-4 h-4" />
        </Button>

        <Button
          isIconOnly
          size="sm"
          color="primary"
          onPress={() => setIsDrawerOpen(true)}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Desktop: Full layout */}
      <div className="hidden md:flex justify-between gap-3 items-end">
        <Input
          isClearable
          classNames={{
            base: 'w-full sm:max-w-[44%]',
            inputWrapper: 'border-1 h-10 rounded-xl',
          }}
          placeholder="Search by party name, loan number, or purpose..."
          size="sm"
          startContent={<Search className="w-4 h-4 text-default-300" />}
          value={filterValue}
          variant="bordered"
          onClear={handleClearSearch}
          onValueChange={handleSearch}
        />
        <div className="flex gap-3">
          <Button
            isIconOnly
            className={isRefreshing ? 'animate-spin' : ''}
            size="sm"
            variant="bordered"
            isDisabled={isRefreshing}
            onPress={handleManualRefresh}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>

          <Dropdown>
            <DropdownTrigger>
              <Button
                endContent={<Filter className="w-4 h-4" />}
                size="sm"
                variant="bordered"
              >
                {TYPE_FILTERS.find(f => f.value === typeFilter)?.label ||
                  'Loan Type'}
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              disallowEmptySelection
              aria-label="Type filter"
              selectedKeys={new Set([typeFilter])}
              selectionMode="single"
              onSelectionChange={keys => {
                const selected = Array.from(keys)[0] as string;
                handleTypeFilterChange(selected);
              }}
            >
              {TYPE_FILTERS.map(filter => (
                <DropdownItem key={filter.value}>{filter.label}</DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>

          <Button
            size="sm"
            color="primary"
            startContent={<Plus className="w-4 h-4" />}
            onPress={() => setIsDrawerOpen(true)}
          >
            Add Loan
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Summary Stats */}
      {summary && (
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <StatCard
            gradient
            description={getNetPositionDescription()}
            gradientColor={summary.netLoanPosition >= 0 ? 'success' : 'danger'}
            tag="Net Loan Position"
            tagColor={summary.netLoanPosition >= 0 ? 'success' : 'danger'}
            title={formatCurrency(Math.abs(summary.netLoanPosition))}
            icon={
              summary.netLoanPosition >= 0 ? (
                <TrendingUp size={24} />
              ) : (
                <TrendingDown size={24} />
              )
            }
          />

          <StatCard
            gradient
            description={`${summary.activeLoansReceivable} active receivables totaling ${formatCurrency(summary.totalReceivable)} in principal. Outstanding balance of ${formatCurrency(summary.outstandingReceivable)} represents ${summary.totalReceivable > 0 ? Math.round((summary.outstandingReceivable / summary.totalReceivable) * 100) : 0}% collection rate.`}
            gradientColor="primary"
            tag="Money You Lent"
            tagColor="primary"
            title={formatCurrency(summary.outstandingReceivable)}
            icon={<Wallet size={24} />}
          />

          <StatCard
            gradient
            description={getInterestDescription()}
            gradientColor="warning"
            tag="Interest Balance"
            tagColor="warning"
            title={formatCurrency(
              summary.totalInterestEarned - summary.totalInterestPaid
            )}
            icon={<Activity size={24} />}
          />
        </div>
      )}

      <Card className="rounded-3xl bg-transparent" shadow="none">
        <CardBody className="py-6">
          {topContent}

          {/* Status Filter Tags */}
          <div className="flex gap-1 overflow-x-auto scrollbar-hide mt-4">
            {LOAN_STATUS_TAGS.map(tag => (
              <Chip
                key={tag.value}
                color={statusFilter === tag.value ? tag.color : 'default'}
                variant={statusFilter === tag.value ? 'solid' : 'flat'}
                className="cursor-pointer text-xs"
                onClick={() => setStatusFilter(tag.value as LoanStatus | 'ALL')}
              >
                {tag.label}
              </Chip>
            ))}
          </div>

          {/* Loans Grid */}
          <div className="mt-6">
            {isInitialLoading ? (
              <div className="py-20">
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <p className="text-sm text-default-500">Loading loans...</p>
                </div>
              </div>
            ) : displayedLoans.length === 0 ? (
              <div className="text-center py-12">
                <Banknote className="w-12 h-12 mx-auto text-default-300 mb-2" />
                <p className="text-sm text-default-500">
                  {filterValue || typeFilter !== 'ALL' || statusFilter !== 'ALL'
                    ? 'No loans found'
                    : 'No loan records yet'}
                </p>
                {!filterValue &&
                  typeFilter === 'ALL' &&
                  statusFilter === 'ALL' && (
                    <Button
                      className="mt-4"
                      color="primary"
                      size="sm"
                      onPress={() => setIsDrawerOpen(true)}
                    >
                      Create Your First Loan Record
                    </Button>
                  )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {displayedLoans.map(loan => (
                    <LoanCard
                      key={loan.id}
                      loan={loan}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      isDeleting={isDeleting}
                    />
                  ))}
                </div>

                {/* Load More Indicator */}
                <div ref={observerTarget} className="py-4 text-center">
                  {isPaginating && hasMore && (
                    <div className="flex justify-center py-6">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    </div>
                  )}

                  {/* End of Results */}
                  {displayedLoans.length >= filteredLoans.length &&
                    filteredLoans.length > 0 && (
                      <p className="text-xs text-default-400">
                        Showing all {filteredLoans.length} results
                      </p>
                    )}
                </div>
              </>
            )}
          </div>
        </CardBody>
      </Card>

      <CreateLoanDrawer
        isOpen={isDrawerOpen}
        onClose={handleDrawerClose}
        loanId={editLoanId}
      />
    </>
  );
}
