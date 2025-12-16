'use client';

import { Card, CardBody, Chip } from '@heroui/react';
import { Calendar, DollarSign, Percent, TrendingUp } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/fn';
import { Loan } from '@/types/loan';
import { MoneyIcon, Clock } from '@phosphor-icons/react';

interface LoanInfoSectionProps {
  loan: Loan;
}

export function LoanInfoSection({ loan }: LoanInfoSectionProps) {
  const getStatusColor = () => {
    switch (loan.status) {
      case 'PAID_OFF':
        return 'success';
      case 'ACTIVE':
        return 'primary';
      case 'DEFAULTED':
        return 'danger';
      case 'RESTRUCTURED':
        return 'warning';
      case 'WRITTEN_OFF':
        return 'default';
      default:
        return 'default';
    }
  };

  const getLoanTypeColor = () => {
    return loan.loanType === 'RECEIVABLE' ? 'success' : 'warning';
  };

  const getTermText = () => {
    if (!loan.term || !loan.termUnit) return 'N/A';
    const unit = loan.termUnit.toLowerCase();
    return `${loan.term} ${unit}${loan.term > 1 ? 's' : ''}`;
  };

  const getPaymentFrequencyText = () => {
    return loan.paymentFrequency
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <div className="space-y-3">
      {/* Loan Number, Type & Status Card */}
      <Card
        className="w-full rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 dark:from-primary-600 dark:to-primary-700"
        shadow="sm"
      >
        <CardBody className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs md:text-sm font-medium text-white mb-0.5">
                Loan Number
              </p>
              <p className="text-lg font-semibold font-heading tracking-tight text-white">
                {loan.loanNumber}
              </p>
            </div>
            <Chip
              className="font-semibold bg-white/20 text-white backdrop-blur-sm"
              color={getStatusColor()}
              variant="flat"
            >
              {loan.status.replace(/_/g, ' ')}
            </Chip>
          </div>
          <Chip
            className="font-semibold"
            color={getLoanTypeColor()}
            size="sm"
            variant="flat"
          >
            {loan.loanType}
          </Chip>
        </CardBody>
      </Card>

      {/* Loan Details Card */}
      <Card className="w-full bg-brand-background rounded-xl" shadow="none">
        <CardBody className="p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs md:text-sm text-default-400 mb-1">
                Principal Amount
              </p>
              <p className="text-xs md:text-sm font-semibold text-default-900 flex items-center gap-1">
                <MoneyIcon className="text-default-500" size={14} />
                {formatCurrency(loan.principalAmount)}
              </p>
            </div>
            <div>
              <p className="text-xs md:text-sm text-default-400 mb-1">
                Interest Rate
              </p>
              <p className="text-xs md:text-sm font-semibold text-default-900 flex items-center gap-1">
                <Percent className="text-default-500" size={12} />
                {loan.interestRate}% p.a.
              </p>
            </div>
            <div>
              <p className="text-xs md:text-sm text-default-400 mb-1">
                Start Date
              </p>
              <p className="text-xs md:text-sm font-semibold text-default-900 flex items-center gap-1">
                <Calendar className="text-default-500" size={12} />
                {formatDate(loan.startDate)}
              </p>
            </div>
            <div>
              <p className="text-xs md:text-sm text-default-400 mb-1">
                End Date
              </p>
              <p className="text-xs md:text-sm font-semibold text-default-900 flex items-center gap-1">
                <Calendar className="text-default-500" size={12} />
                {loan.endDate ? formatDate(loan.endDate) : 'Ongoing'}
              </p>
            </div>
            <div>
              <p className="text-xs md:text-sm text-default-400 mb-1">
                Loan Term
              </p>
              <p className="text-xs md:text-sm font-semibold text-default-900 flex items-center gap-1">
                <Clock className="text-default-500" size={14} />
                {getTermText()}
              </p>
            </div>
            <div>
              <p className="text-xs md:text-sm text-default-400 mb-1">
                Payment Frequency
              </p>
              <p className="text-xs md:text-sm font-semibold text-default-900">
                {getPaymentFrequencyText()}
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Charges Card */}
      {loan.totalCharges > 0 && (
        <Card className="w-full bg-brand-background rounded-xl" shadow="none">
          <CardBody className="p-4 space-y-2">
            <h4 className="text-sm font-semibold text-default-700 mb-2">
              Loan Charges
            </h4>
            {loan.processingFee > 0 && (
              <div className="flex justify-between text-xs md:text-sm">
                <span className="text-default-600">Processing Fee</span>
                <span className="font-medium">
                  {formatCurrency(loan.processingFee)}
                </span>
              </div>
            )}
            {loan.managementFee > 0 && (
              <div className="flex justify-between text-xs md:text-sm">
                <span className="text-default-600">Management Fee</span>
                <span className="font-medium">
                  {formatCurrency(loan.managementFee)}
                </span>
              </div>
            )}
            {loan.insuranceFee > 0 && (
              <div className="flex justify-between text-xs md:text-sm">
                <span className="text-default-600">Insurance Fee</span>
                <span className="font-medium">
                  {formatCurrency(loan.insuranceFee)}
                </span>
              </div>
            )}
            {loan.otherCharges > 0 && (
              <div className="flex justify-between text-xs md:text-sm">
                <span className="text-default-600">Other Charges</span>
                <span className="font-medium">
                  {formatCurrency(loan.otherCharges)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold pt-2 mt-2 border-t border-default-200">
              <span className="text-default-700">Total Charges</span>
              <span className="text-default-900">
                {formatCurrency(loan.totalCharges)}
              </span>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Purpose & Collateral Card */}
      {(loan.purpose || loan.collateral) && (
        <Card className="w-full bg-brand-background rounded-xl" shadow="none">
          <CardBody className="p-4 space-y-2">
            {loan.purpose && (
              <div>
                <p className="text-xs md:text-sm text-default-400 mb-0.5">
                  Purpose
                </p>
                <p className="text-xs md:text-sm text-default-700 leading-relaxed">
                  {loan.purpose}
                </p>
              </div>
            )}
            {loan.collateral && (
              <div>
                <p className="text-xs md:text-sm text-default-400 mb-0.5">
                  Collateral
                </p>
                <p className="text-xs md:text-sm text-default-700 leading-relaxed">
                  {loan.collateral}
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Notes Card */}
      {loan.notes && (
        <Card className="w-full bg-brand-background rounded-xl" shadow="none">
          <CardBody className="p-4">
            <p className="text-xs md:text-sm text-default-400 mb-0.5">Notes</p>
            <p className="text-xs md:text-sm text-default-700 leading-relaxed">
              {loan.notes}
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
