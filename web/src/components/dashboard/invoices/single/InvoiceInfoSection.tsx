'use client';

import { Card, CardBody, Chip } from '@heroui/react';
import { Calendar } from '@phosphor-icons/react';

import { formatDate, getStatusConfig } from '@/lib/fn';
import { Invoice } from '@/types/invoices';

interface InvoiceInfoSectionProps {
  invoice: Invoice;
}

export default function InvoiceInfoSection({
  invoice,
}: InvoiceInfoSectionProps) {
  const statusConfig = getStatusConfig(invoice.status);

  return (
    <div className="space-y-3">
      {/* Invoice Number & Status Card */}
      <Card
        className="w-full rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 dark:from-primary-600 dark:to-primary-700"
        shadow="sm"
      >
        <CardBody className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm font-medium text-primary-100 mb-0.5">
                Invoice
              </p>
              <p className="text-lg font-semibold font-heading tracking-tight text-white">
                {invoice.invoiceNumber}
              </p>
            </div>
            <Chip
              className="font-semibold bg-white/20 text-white backdrop-blur-sm"
              color={statusConfig.chipColor}
              variant="flat"
            >
              {invoice.status}
            </Chip>
          </div>
        </CardBody>
      </Card>

      {/* Dates Card */}
      <Card className="w-full bg-brand-background rounded-xl" shadow="none">
        <CardBody className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <p className="text-xs md:text-sm text-default-400 mb-1">Issued</p>
              <p className="text-xs md:text-sm font-semibold text-default-900 flex items-center gap-1">
                <Calendar className="text-default-500" size={12} />
                {formatDate(invoice.issueDate)}
              </p>
            </div>
            {invoice.dueDate && (
              <>
                <div className="h-8 w-px bg-default-200" />
                <div className="flex-1">
                  <p className="text-xs md:text-sm text-default-400 mb-1">
                    Due
                  </p>
                  <p className="text-xs md:text-sm font-semibold text-default-900 flex items-center gap-1">
                    <Calendar className="text-default-500" size={12} />
                    {formatDate(invoice.dueDate)}
                  </p>
                </div>
              </>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Title & Description Card */}
      {(invoice.title || invoice.description) && (
        <Card className="w-full bg-brand-background rounded-xl" shadow="none">
          <CardBody className="p-4 space-y-2">
            {invoice.title && (
              <div>
                <p className="text-xs md:text-sm text-default-400 mb-0.5">
                  Title
                </p>
                <p className="text-sm md:text-base font-semibold text-default-900">
                  {invoice.title}
                </p>
              </div>
            )}
            {invoice.description && (
              <div>
                <p className="text-xs md:text-sm text-default-400 mb-0.5">
                  Description
                </p>
                <p className="text-xs md:text-sm text-default-700 leading-relaxed">
                  {invoice.description}
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
