'use client';

import { Card, CardBody, Chip, Divider } from '@heroui/react';
import { useFormContext } from 'react-hook-form';
import { TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { CalculatorIcon } from '@phosphor-icons/react';

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

  const hasCharges = totalCharges > 0;
  const hasInterest = totalInterest > 0;

  return (
    <Card
      className="bg-linear-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200 dark:border-green-800"
      shadow="none"
    >
      <CardBody className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-base font-semibold flex items-center gap-2">
            <CalculatorIcon className="w-5 h-5 text-primary" />
            Loan Summary
          </h4>

          {loanType === 'RECEIVABLE' ? (
            <Chip color="success" size="sm" variant="flat">
              <div className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                <span className="text-xs font-medium">Money Lent</span>
              </div>
            </Chip>
          ) : (
            <Chip color="danger" size="sm" variant="flat">
              <div className="flex items-center gap-1">
                <TrendingDown className="w-3 h-3" />
                <span className="text-xs font-medium">Money Borrowed</span>
              </div>
            </Chip>
          )}
        </div>

        {/* Amount Breakdown */}
        <div className="space-y-2 pt-3">
          {!principalAmount ? (
            <p className="text-sm text-default-500 text-center py-4">
              No loan amount specified
            </p>
          ) : (
            <div className="space-y-1">
              {/* Principal Amount */}
              <div className="flex justify-between items-center text-sm">
                <span className="text-default-600">Principal Amount</span>
                <span className="font-medium">
                  {formatCurrency(principalAmount)}
                </span>
              </div>

              {/* Charges Breakdown */}
              {hasCharges && (
                <div className="space-y-0.5">
                  {processingFee > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-default-600">Processing Fee</span>
                      <span className="text-sm font-medium">
                        +{formatCurrency(processingFee)}
                      </span>
                    </div>
                  )}

                  {managementFee > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-default-600">Management Fee</span>
                      <span className="text-sm font-medium">
                        +{formatCurrency(managementFee)}
                      </span>
                    </div>
                  )}

                  {insuranceFee > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-default-600">Insurance Fee</span>
                      <span className="text-sm font-medium">
                        +{formatCurrency(insuranceFee)}
                      </span>
                    </div>
                  )}

                  {otherCharges > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-default-600">Other Charges</span>
                      <span className="text-sm font-medium">
                        +{formatCurrency(otherCharges)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Interest */}
              {hasInterest && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-default-600">
                    Total Interest ({interestRate}%)
                  </span>
                  <span className="text-sm font-medium text-warning-600">
                    +{formatCurrency(totalInterest)}
                  </span>
                </div>
              )}

              <Divider className="mt-2" />

              {/* Total Amount Due */}
              <div className="flex justify-between items-center pt-1">
                <span className="text-base font-semibold text-foreground">
                  Total Amount Due
                </span>
                <span className="text-base font-semibold text-foreground">
                  {formatCurrency(totalAmountDue)}
                </span>
              </div>

              {/* Loan Terms */}
              {(paymentFrequency || term || startDate) && (
                <>
                  <Divider className="my-2" />

                  {interestRate > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-default-600">Interest Rate</span>
                      <span className="text-sm font-medium">
                        {interestRate}% p.a.
                      </span>
                    </div>
                  )}

                  {paymentFrequency && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-default-600">
                        Payment Frequency
                      </span>
                      <span className="text-sm font-medium">
                        {getFrequencyLabel(paymentFrequency)}
                      </span>
                    </div>
                  )}

                  {term && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-default-600">Loan Term</span>
                      <span className="text-sm font-medium">
                        {term} {getTermUnitLabel(termUnit)}
                      </span>
                    </div>
                  )}

                  {startDate && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-default-600">Start Date</span>
                      <span className="text-sm font-medium">
                        {new Date(startDate).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  )}

                  {getEndDate() && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-default-600">Maturity Date</span>
                      <span className="text-sm font-medium">
                        {getEndDate()}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
