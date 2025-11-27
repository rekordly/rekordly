'use client';

import { Card, CardBody, Chip } from '@heroui/react';
import { Calendar, Invoice } from '@phosphor-icons/react';

import { formatDate, getSaleStatusConfig } from '@/lib/fn';
import { Sale } from '@/types/sales';

interface SaleInfoSectionProps {
  sale: Sale;
}

export function SaleInfoSection({ sale }: SaleInfoSectionProps) {
  const statusConfig = getSaleStatusConfig(sale.status);

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
                Receipt Number
              </p>
              <p className="text-lg font-semibold font-heading tracking-tight text-white">
                {sale.receiptNumber}
              </p>
            </div>
            <Chip
              className="font-semibold bg-white/20 text-white backdrop-blur-sm"
              color={statusConfig.chipColor}
              variant="flat"
            >
              {sale.status}
            </Chip>
          </div>
        </CardBody>
      </Card>

      {/* Sale Date & Source Card */}
      <Card className="w-full rounded-xl" shadow="none">
        <CardBody className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <p className="text-xs md:text-sm text-default-400 mb-1">
                Sale Date
              </p>
              <p className="text-xs md:text-sm font-semibold text-default-900 flex items-center gap-1">
                <Calendar className="text-default-500" size={12} />
                {formatDate(sale.saleDate)}
              </p>
            </div>
            {sale.sourceType === 'FROM_INVOICE' && sale.invoice && (
              <>
                <div className="h-8 w-px bg-default-200" />
                <div className="flex-1">
                  <p className="text-xs md:text-sm text-default-400 mb-1">
                    From Invoice
                  </p>
                  <p className="text-xs md:text-sm font-semibold text-default-900 flex items-center gap-1">
                    <Invoice className="text-default-500" size={12} />
                    {sale.invoice.invoiceNumber}
                  </p>
                </div>
              </>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Title & Description Card */}
      {(sale.title || sale.description) && (
        <Card className="w-full rounded-xl" shadow="none">
          <CardBody className="p-4 space-y-2">
            {sale.title && (
              <div>
                <p className="text-xs md:text-sm text-default-400 mb-0.5">
                  Title
                </p>
                <p className="text-sm md:text-base font-semibold text-default-900">
                  {sale.title}
                </p>
              </div>
            )}
            {sale.description && (
              <div>
                <p className="text-xs md:text-sm text-default-400 mb-0.5">
                  Description
                </p>
                <p className="text-xs md:text-sm text-default-700 leading-relaxed">
                  {sale.description}
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
