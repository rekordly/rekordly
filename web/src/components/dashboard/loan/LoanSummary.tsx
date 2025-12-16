'use client';

import { Card, CardBody, Chip } from '@heroui/react';
import { useFormContext } from 'react-hook-form';
import {
  Calculator,
  TrendingUp,
  TrendingDown,
  AlertCircle,
} from 'lucide-react';

import { formatCurrency } from '@/lib/fn';

export function LoanSummary() {
  const { watch } = useFormContext();

  const loanType = watch('loanType');
  const partyName = watch('partyName') || 'Not specified';

  const principalAmount = watch('principalAmount') || 0;
  const interestRate = watch('interestRate') || 0;
  const processingFee = watch('processingFee') || 0;
  const managementFee = watch('managementFee') || 0;
  const insuranceFee = watch('insuranceFee') || 0;
  const otherCharges = watch('otherCharges') || 0;
  const paymentFrequency = watch('paymentFrequency');
  const term = watch('term');
  const termUnit = watch('termUnit') || 'MONTHS';
  const startDate = watch('startDate');
  const purpose = watch('purpose');

  const totalCharges =
    processingFee + managementFee + insuranceFee + otherCharges;

  // Calculate total interest over the loan term
  const calculateTotalInterest = () => {
    if (!principalAmount || !interestRate || !term) return 0;

    const annualRate = interestRate / 100;
    let termInYears = 0;

    // Convert term to years based on termUnit
    if (termUnit === 'DAYS') {
      termInYears = term / 365;
    } else if (termUnit === 'MONTHS') {
      termInYears = term / 12;
    } else if (termUnit === 'YEARS') {
      termInYears = term;
    }

    // Simple interest: Principal × Rate × Time
    return principalAmount * annualRate * termInYears;
  };

  const totalInterest = calculateTotalInterest();
  const totalAmountDue = principalAmount + totalCharges + totalInterest;

  // Calculate end date from start date + term
  const getEndDate = () => {
    if (!startDate || !term) return null;
    const start = new Date(startDate);
    const end = new Date(start);

    if (termUnit === 'DAYS') {
      end.setDate(end.getDate() + term);
    } else if (termUnit === 'MONTHS') {
      end.setMonth(end.getMonth() + term);
    } else if (termUnit === 'YEARS') {
      end.setFullYear(end.getFullYear() + term);
    }

    return end.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getFrequencyLabel = (frequency: string) => {
    const labels: Record<string, string> = {
      DAILY: 'Daily',
      WEEKLY: 'Weekly',
      BIWEEKLY: 'Bi-weekly',
      MONTHLY: 'Monthly',
      QUARTERLY: 'Quarterly',
      ANNUALLY: 'Annually',
      ONE_TIME: 'One-time',
    };
    return labels[frequency] || frequency;
  };

  const getTermUnitLabel = (unit: string) => {
    const labels: Record<string, string> = {
      DAYS: 'days',
      MONTHS: 'months',
      YEARS: 'years',
    };
    return labels[unit] || unit.toLowerCase();
  };

  const estimateMonthlyInterest = () => {
    if (!principalAmount || !interestRate) return 0;
    // Simple monthly interest calculation: (Principal * Annual Rate) / 12
    return (principalAmount * (interestRate / 100)) / 12;
  };

  return (
    <Card className="rounded-2xl mx-3 bg-gradient-to-br from-primary-50 to-secondary-50 dark:from-primary-900/20 dark:to-secondary-900/20 border border-primary-100 dark:border-primary-800">
      <CardBody className="space-y-4">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Loan Summary</h3>
        </div>

        {/* Loan Type Badge */}
        <div className="flex items-center gap-2">
          {loanType === 'RECEIVABLE' ? (
            <>
              <TrendingUp className="w-4 h-4 text-success" />
              <Chip color="success" size="sm" variant="flat">
                <span className="text-xs font-medium">Money You Lent</span>
              </Chip>
            </>
          ) : (
            <>
              <TrendingDown className="w-4 h-4 text-danger" />
              <Chip color="danger" size="sm" variant="flat">
                <span className="text-xs font-medium">Money You Borrowed</span>
              </Chip>
            </>
          )}
        </div>

        {/* Party Info */}
        <div className="space-y-1">
          <p className="text-xs text-default-500">
            {loanType === 'RECEIVABLE' ? 'Borrower' : 'Lender'}
          </p>
          <p className="text-sm font-medium">{partyName}</p>
        </div>

        {/* Purpose */}
        {purpose && (
          <div className="space-y-1">
            <p className="text-xs text-default-500">Purpose</p>
            <p className="text-sm font-medium">{purpose}</p>
          </div>
        )}

        {/* Amount Breakdown */}
        <div className="space-y-2 pt-3 border-t border-divider">
          <div className="flex justify-between text-sm">
            <span className="text-default-600">Principal Amount:</span>
            <span className="font-semibold">
              {formatCurrency(principalAmount)}
            </span>
          </div>

          {totalCharges > 0 && (
            <>
              {processingFee > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-default-500">Processing Fee:</span>
                  <span>{formatCurrency(processingFee)}</span>
                </div>
              )}
              {managementFee > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-default-500">Management Fee:</span>
                  <span>{formatCurrency(managementFee)}</span>
                </div>
              )}
              {insuranceFee > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-default-500">Insurance Fee:</span>
                  <span>{formatCurrency(insuranceFee)}</span>
                </div>
              )}
              {otherCharges > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-default-500">Other Charges:</span>
                  <span>{formatCurrency(otherCharges)}</span>
                </div>
              )}

              <div className="flex justify-between text-xs pt-2 border-t border-divider/50">
                <span className="text-default-500">Total Charges:</span>
                <span className="font-medium">
                  {formatCurrency(totalCharges)}
                </span>
              </div>
            </>
          )}

          {totalInterest > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-default-600">
                Total Interest ({interestRate}%):
              </span>
              <span className="font-medium text-warning-600">
                {formatCurrency(totalInterest)}
              </span>
            </div>
          )}

          <div className="flex justify-between pt-2 border-t border-divider">
            <span className="font-medium">Total Amount Due:</span>
            <span className="font-bold text-lg">
              {formatCurrency(totalAmountDue)}
            </span>
          </div>
        </div>

        {/* Interest & Terms */}
        <div className="space-y-2 pt-3 border-t border-divider">
          <div className="flex justify-between text-sm">
            <span className="text-default-600">Interest Rate:</span>
            <span className="font-medium">{interestRate}% per annum</span>
          </div>

          {interestRate > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-default-500">Est. Monthly Interest:</span>
              <span className="text-warning-600 font-medium">
                ~{formatCurrency(estimateMonthlyInterest())}
              </span>
            </div>
          )}

          <div className="flex justify-between text-sm">
            <span className="text-default-600">Payment Frequency:</span>
            <span className="font-medium">
              {getFrequencyLabel(paymentFrequency)}
            </span>
          </div>

          {term && (
            <div className="flex justify-between text-sm">
              <span className="text-default-600">Term:</span>
              <span className="font-medium">
                {term} {getTermUnitLabel(termUnit)}
              </span>
            </div>
          )}

          {startDate && (
            <div className="flex justify-between text-sm">
              <span className="text-default-600">Start Date:</span>
              <span className="font-medium">
                {new Date(startDate).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
          )}

          {getEndDate() && (
            <div className="flex justify-between text-sm">
              <span className="text-default-600">End Date:</span>
              <span className="font-medium">{getEndDate()}</span>
            </div>
          )}
        </div>

        {/* Info Alert */}
        <div className="flex items-start gap-2 p-3 bg-primary-50 dark:bg-primary-900/30 rounded-lg">
          <AlertCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div className="text-xs">
            <p className="font-medium text-primary-800 dark:text-primary-200">
              {loanType === 'RECEIVABLE'
                ? 'Loan to be Collected'
                : 'Loan to be Repaid'}
            </p>
            <p className="text-primary-700 dark:text-primary-300">
              {loanType === 'RECEIVABLE'
                ? `You lent ${formatCurrency(principalAmount)} to ${partyName}. Total to collect: ${formatCurrency(totalAmountDue)} (including ${formatCurrency(totalInterest)} interest).`
                : `You borrowed ${formatCurrency(principalAmount)} from ${partyName}. Total to repay: ${formatCurrency(totalAmountDue)} (including ${formatCurrency(totalInterest)} interest).`}
            </p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
