'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Wallet, Activity, Plus } from 'lucide-react';
import { useLoanStore } from '@/store/loan-store';
import { LoanCard } from '@/components/ui/LoanCard';
import { CreateLoanDrawer } from '@/components/drawer/CreateLoanDrawer';
import { formatCurrency } from '@/lib/fn';
import UniversalListLayout from '@/components/layout/UniversalListLayout';
import UniversalListSkeleton from '@/components/skeleton/UniversalListSkeleton';
import { LoanStatus, LoanType } from '@/types/loan';

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

export default function LoansPage() {
  const [filterValue, setFilterValue] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editLoanId, setEditLoanId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const {
    displayedLoans,
    filteredLoans,
    isInitialLoading,
    isPaginating,
    isDeleting,
    typeFilter,
    statusFilter,
    deleteLoan,
    summary,
    fetchLoans,
    searchLoans,
    clearSearch,
    setTypeFilter,
    setStatusFilter,
    refreshLoans,
  } = useLoanStore();

  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

  const handleEdit = (loan: any) => {
    setEditLoanId(loan.id);
    setIsDrawerOpen(true);
  };

  const handleDrawerClose = () => {
    setIsDrawerOpen(false);
    setEditLoanId(null);
  };

  const getNetPositionDescription = () => {
    if (!summary) return '';

    // Safe access with fallback to 0
    const position = summary.netLoanPosition ?? 0;
    const outstandingReceivable = summary.outstandingReceivable ?? 0;
    const activeLoansReceivable = summary.activeLoansReceivable ?? 0;
    const outstandingPayable = summary.outstandingPayable ?? 0;
    const activeLoansPayable = summary.activeLoansPayable ?? 0;

    const absPosition = Math.abs(position);
    if (position >= 0) {
      return `You have ${formatCurrency(outstandingReceivable)} outstanding from ${activeLoansReceivable} active loans. Your strong lending position indicates ${formatCurrency(absPosition)} net positive balance.`;
    }
    return `You owe ${formatCurrency(outstandingPayable)} across ${activeLoansPayable} active loans. Focus on repayments to improve your ${formatCurrency(absPosition)} net borrowing position.`;
  };

  const getInterestDescription = () => {
    if (!summary) return '';

    // Safe access with fallback to 0
    const earned = summary.totalInterestEarned ?? 0;
    const paid = summary.totalInterestPaid ?? 0;
    const net = earned - paid;

    if (net >= 0) {
      return `You've earned ${formatCurrency(earned)} in interest from loans, after paying ${formatCurrency(paid)} on borrowed funds. Net interest benefit of ${formatCurrency(net)}.`;
    }
    return `Interest paid of ${formatCurrency(paid)} exceeds interest earned of ${formatCurrency(earned)}. Consider reviewing borrowing terms to reduce ${formatCurrency(Math.abs(net))} net interest cost.`;
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteLoan(id);
    } finally {
      setDeletingId(null);
    }
  };

  if (isInitialLoading) {
    return <UniversalListSkeleton gridConfig={{ default: 1, md: 2, lg: 3 }} />;
  }

  return (
    <>
      <UniversalListLayout<LoanStatus, LoanType | 'ALL'>
        stats={[
          {
            gradient: true,
            description: getNetPositionDescription(),
            gradientColor:
              (summary?.netLoanPosition ?? 0) >= 0 ? 'success' : 'danger',
            tag: 'Net Loan Position',
            tagColor:
              (summary?.netLoanPosition ?? 0) >= 0 ? 'success' : 'danger',
            title: formatCurrency(Math.abs(summary?.netLoanPosition ?? 0)),
            icon:
              (summary?.netLoanPosition ?? 0) >= 0 ? (
                <TrendingUp size={24} />
              ) : (
                <TrendingDown size={24} />
              ),
          },
          {
            gradient: true,
            description: `${summary?.activeLoansReceivable ?? 0} active receivables totaling ${formatCurrency(summary?.totalReceivable ?? 0)} in principal.`,
            gradientColor: 'primary',
            tag: 'Money You Lent',
            tagColor: 'primary',
            title: formatCurrency(summary?.outstandingReceivable ?? 0),
            icon: <Wallet size={24} />,
          },
          {
            gradient: true,
            description: getInterestDescription(),
            gradientColor: 'warning',
            tag: 'Interest Balance',
            tagColor: 'warning',
            title: formatCurrency(
              (summary?.totalInterestEarned ?? 0) -
                (summary?.totalInterestPaid ?? 0)
            ),
            icon: <Activity size={24} />,
          },
        ]}
        searchValue={filterValue}
        searchPlaceholder="Search by party name, loan number, or purpose..."
        onSearchChange={value => {
          setFilterValue(value);
          searchLoans(value);
        }}
        onSearchClear={() => {
          setFilterValue('');
          clearSearch();
        }}
        statusFilters={LOAN_STATUS_TAGS}
        selectedStatus={statusFilter as LoanStatus}
        onStatusChange={status => setStatusFilter(status as LoanStatus | 'ALL')}
        typeFilters={TYPE_FILTERS}
        selectedType={typeFilter}
        onTypeChange={type => setTypeFilter(type as LoanType | 'ALL')}
        onRefresh={refreshLoans}
        onAdd={() => setIsDrawerOpen(true)}
        addButtonText="Add Loan"
        addButtonIcon={<Plus className="w-4 h-4" />}
        items={displayedLoans.map(loan => (
          <LoanCard
            key={loan.id}
            loan={loan}
            onEdit={handleEdit}
            onDelete={handleDelete}
            isDeleting={isDeleting}
          />
        ))}
        emptyMessage={
          filterValue || typeFilter !== 'ALL' || statusFilter !== 'ALL'
            ? 'No loans found'
            : 'No loan records yet'
        }
        emptyActionText="Create Your First Loan Record"
        onEmptyAction={() => setIsDrawerOpen(true)}
        gridConfig={{ default: 1, md: 2, lg: 3 }}
        hasMore={displayedLoans.length < filteredLoans.length}
        isPaginating={isPaginating}
        currentCount={displayedLoans.length}
        totalCount={filteredLoans.length}
      />

      <CreateLoanDrawer
        isOpen={isDrawerOpen}
        onClose={handleDrawerClose}
        loanId={editLoanId}
      />
    </>
  );
}
