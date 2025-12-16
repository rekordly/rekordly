'use client';

import { Card, CardBody, Chip } from '@heroui/react';
import { Calendar, FileText, Building2, DollarSign } from 'lucide-react';

import { formatCurrency, formatDate } from '@/lib/fn';
import { Purchase } from '@/types/purchases';
import { Invoice, MoneyIcon } from '@phosphor-icons/react';

interface PurchaseInfoSectionProps {
  purchase: Purchase;
}

export function PurchaseInfoSection({ purchase }: PurchaseInfoSectionProps) {
  const getStatusColor = () => {
    switch (purchase.status) {
      case 'PAID':
        return 'success';
      case 'PARTIALLY_PAID':
        return 'warning';
      case 'UNPAID':
        return 'danger';
      case 'REFUNDED':
      case 'PARTIALLY_REFUNDED':
        return 'default';
      default:
        return 'default';
    }
  };

  const getStatusText = () => {
    switch (purchase.status) {
      case 'PAID':
        return 'Fully Paid';
      case 'PARTIALLY_PAID':
        return 'Partially Paid';
      case 'UNPAID':
        return 'Unpaid';
      case 'REFUNDED':
        return 'Refunded';
      case 'PARTIALLY_REFUNDED':
        return 'Partially Refunded';
      default:
        return purchase.status;
    }
  };

  return (
    <div className="space-y-3">
      {/* Receipt Number & Status Card */}
      <Card
        className="w-full rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 dark:from-primary-600 dark:to-primary-700"
        shadow="sm"
      >
        <CardBody className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm font-medium text-white mb-0.5">
                Purchase Number
              </p>
              <p className="text-lg font-semibold font-heading tracking-tight text-white">
                {purchase.purchaseNumber}
              </p>
            </div>
            <Chip
              className="font-semibold bg-white/20 text-white backdrop-blur-sm"
              color={getStatusColor()}
              variant="flat"
            >
              {purchase.status}
            </Chip>
          </div>
        </CardBody>
      </Card>

      {/* purchase Date & Source Card */}
      <Card className="w-full bg-brand-background rounded-xl" shadow="none">
        <CardBody className="p-4">
          <div className="grid grid-cols-2 items-center justify-between gap-3">
            <div className="">
              <p className="text-xs md:text-sm text-default-400 mb-1">
                Purchase Date
              </p>
              <p className="text-xs md:text-sm font-semibold text-default-900 flex items-center gap-1">
                <Calendar className="text-default-500" size={12} />
                {formatDate(purchase.purchaseDate)}
              </p>
            </div>
            <div className="">
              <p className="text-xs md:text-sm text-default-400 mb-1">
                Total Amount
              </p>
              <p className="text-xs md:text-sm font-semibold text-default-900 flex items-center gap-1">
                <MoneyIcon className="text-default-500" size={14} />
                {formatCurrency(purchase.totalAmount)}
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Title & Description Card */}
      {(purchase.title || purchase.description) && (
        <Card className="w-full bg-brand-background rounded-xl" shadow="none">
          <CardBody className="p-4 space-y-2">
            {purchase.title && (
              <div>
                <p className="text-xs md:text-sm text-default-400 mb-0.5">
                  Title
                </p>
                <p className="text-sm md:text-base font-semibold text-default-900">
                  {purchase.title}
                </p>
              </div>
            )}
            {purchase.description && (
              <div>
                <p className="text-xs md:text-sm text-default-400 mb-0.5">
                  Description
                </p>
                <p className="text-xs md:text-sm text-default-700 leading-relaxed">
                  {purchase.description}
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
