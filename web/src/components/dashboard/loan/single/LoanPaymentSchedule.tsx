'use client';

import { Card, CardBody, Progress } from '@heroui/react';
import { formatCurrency } from '@/lib/fn';
import { Loan } from '@/types/loan';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

interface LoanPaymentScheduleProps {
  loan: Loan;
}

export function LoanPaymentSchedule({ loan }: LoanPaymentScheduleProps) {
  const totalLoanAmount = loan.principalAmount + loan.totalCharges;
  const repaymentProgress =
    totalLoanAmount > 0 ? (loan.totalPaid / totalLoanAmount) * 100 : 0;

  const principalProgress =
    loan.principalAmount > 0
      ? ((loan.principalAmount - loan.currentBalance) / loan.principalAmount) *
        100
      : 0;

  return (
    <Card className="w-full bg-brand-background rounded-3xl p-4" shadow="none">
      <CardBody className="p-0 space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Loan Summary</h3>
        </div>

        {/* Overall Progress */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-default-700">
              Repayment Progress
            </span>
            <span className="text-sm font-bold text-primary">
              {repaymentProgress.toFixed(1)}%
            </span>
          </div>
          <Progress
            aria-label="Repayment progress"
            classNames={{
              indicator: 'bg-gradient-to-r from-primary-400 to-primary-600',
            }}
            value={repaymentProgress}
          />
          <div className="flex justify-between text-xs text-default-500">
            <span>Paid: {formatCurrency(loan.totalPaid)}</span>
            <span>Total: {formatCurrency(totalLoanAmount)}</span>
          </div>
        </div>

        {/* Principal vs Interest Breakdown */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-default-200">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-success" />
              <span className="text-xs text-default-600">Principal Paid</span>
            </div>
            <p className="text-lg font-bold text-success">
              {formatCurrency(loan.principalAmount - loan.currentBalance)}
            </p>
            <Progress
              aria-label="Principal paid"
              classNames={{
                indicator: 'bg-success',
              }}
              size="sm"
              value={principalProgress}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-warning" />
              <span className="text-xs text-default-600">Interest Paid</span>
            </div>
            <p className="text-lg font-bold text-warning">
              {formatCurrency(loan.totalInterestPaid)}
            </p>
            <div className="text-xs text-default-500 mt-1">
              @ {loan.interestRate}% p.a.
            </div>
          </div>
        </div>

        {/* Outstanding Balance */}
        <div className="pt-4 border-t border-default-200">
          <div className="bg-gradient-to-br from-danger-50 to-danger-100 dark:from-danger-900/20 dark:to-danger-800/20 rounded-2xl p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-danger-700 dark:text-danger-300 font-medium mb-1">
                  Outstanding Balance
                </p>
                <p className="text-2xl font-bold text-danger-600 dark:text-danger-400">
                  {formatCurrency(loan.currentBalance)}
                </p>
              </div>
              {loan.loanType === 'RECEIVABLE' ? (
                <TrendingUp className="w-6 h-6 text-danger-500" />
              ) : (
                <TrendingDown className="w-6 h-6 text-danger-500" />
              )}
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-default-200">
          <div className="bg-default-100 dark:bg-default-50/10 rounded-xl p-3">
            <p className="text-xs text-default-600 mb-1">Total Amount</p>
            <p className="text-sm font-bold text-default-900">
              {formatCurrency(totalLoanAmount)}
            </p>
          </div>
          <div className="bg-default-100 dark:bg-default-50/10 rounded-xl p-3">
            <p className="text-xs text-default-600 mb-1">Total Paid</p>
            <p className="text-sm font-bold text-success">
              {formatCurrency(loan.totalPaid)}
            </p>
          </div>
          <div className="bg-default-100 dark:bg-default-50/10 rounded-xl p-3">
            <p className="text-xs text-default-600 mb-1">Principal</p>
            <p className="text-sm font-bold text-default-900">
              {formatCurrency(loan.principalAmount)}
            </p>
          </div>
          <div className="bg-default-100 dark:bg-default-50/10 rounded-xl p-3">
            <p className="text-xs text-default-600 mb-1">Charges</p>
            <p className="text-sm font-bold text-default-900">
              {formatCurrency(loan.totalCharges)}
            </p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
