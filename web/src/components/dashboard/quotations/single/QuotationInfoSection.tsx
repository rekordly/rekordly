'use client';

import { Card, CardBody, Chip } from '@heroui/react';
import { Calendar } from '@phosphor-icons/react';
import { formatDate, getQuotationStatusConfig } from '@/lib/fn';
import { Quotation } from '@/types/quotations';

interface QuotationInfoSectionProps {
  quotation: Quotation;
}

export default function QuotationInfoSection({
  quotation,
}: QuotationInfoSectionProps) {
  const statusConfig = getQuotationStatusConfig(quotation.status);

  return (
    <div className="space-y-3">
      {/* Quotation Number & Status Card */}
      <Card
        className="w-full rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 dark:from-primary-600 dark:to-primary-700"
        shadow="sm"
      >
        <CardBody className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm font-medium text-primary-100 mb-0.5">
                Quotation
              </p>
              <p className="text-lg font-semibold font-heading tracking-tight text-white">
                {quotation.quotationNumber}
              </p>
            </div>
            <Chip
              variant="flat"
              color={statusConfig.chipColor}
              className="font-semibold bg-white/20 text-white backdrop-blur-sm"
            >
              {quotation.status}
            </Chip>
          </div>
        </CardBody>
      </Card>

      {/* Dates Card */}
      <Card className="w-full rounded-xl" shadow="none">
        <CardBody className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <p className="text-xs md:text-sm text-default-400 mb-1">Issued</p>
              <p className="text-xs md:text-sm font-semibold text-default-900 flex items-center gap-1">
                <Calendar size={12} className="text-default-500" />
                {formatDate(quotation.issueDate)}
              </p>
            </div>
            {quotation.validUntil && (
              <>
                <div className="h-8 w-px bg-default-200" />
                <div className="flex-1">
                  <p className="text-xs md:text-sm text-default-400 mb-1">
                    Valid Until
                  </p>
                  <p className="text-xs md:text-sm font-semibold text-default-900 flex items-center gap-1">
                    <Calendar size={12} className="text-default-500" />
                    {formatDate(quotation.validUntil)}
                  </p>
                </div>
              </>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Title & Description Card */}
      {(quotation.title || quotation.description) && (
        <Card className="w-full rounded-xl" shadow="none">
          <CardBody className="p-4 space-y-2">
            {quotation.title && (
              <div>
                <p className="text-xs md:text-sm text-default-400 mb-0.5">
                  Title
                </p>
                <p className="text-sm md:text-base font-semibold text-default-900">
                  {quotation.title}
                </p>
              </div>
            )}
            {quotation.description && (
              <div>
                <p className="text-xs md:text-sm text-default-400 mb-0.5">
                  Description
                </p>
                <p className="text-xs md:text-sm text-default-700 leading-relaxed">
                  {quotation.description}
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
