'use client';

import { Card, CardBody } from '@heroui/react';
import { DollarSign, Calendar, AlertCircle, Info } from 'lucide-react';

import { formatCurrency, formatDate } from '@/lib/fn';

interface RefundInfoSectionProps {
  refundAmount: number;
  refundDate?: string | Date | null;
  refundReason?: string | null;
  status?: string;
}

export function RefundInfoSection({
  refundAmount,
  refundDate,
  refundReason,
  status,
}: RefundInfoSectionProps) {
  // Don't render if no refund amount
  if (!refundAmount || refundAmount <= 0) return null;

  return (
    <Card
      className="rounded-2xl border-2 border-danger-200 dark:border-danger-800"
      shadow="none"
    >
      <CardBody className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <AlertCircle className="w-5 h-5 text-danger-500" />
          <h3 className="text-lg font-semibold text-danger-700 dark:text-danger-500">
            Refund Information
          </h3>
        </div>

        <div className="space-y-6">
          {/* Grid for Amount, Date - 2 or 3 columns on large screens */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Refund Amount */}
            <div>
              <p className="text-xs text-default-500 uppercase tracking-wide font-medium mb-1">
                Refund Amount
              </p>
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-danger-500" />
                <p className="text-sm font-bold text-danger-700 dark:text-danger-500">
                  {formatCurrency(refundAmount)}
                </p>
              </div>
            </div>

            {/* Refund Date */}
            {refundDate && (
              <div>
                <p className="text-xs text-default-500 uppercase tracking-wide font-medium mb-1">
                  Refund Date
                </p>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-danger-500" />
                  <p className="text-sm font-medium text-foreground">
                    {formatDate(refundDate)}
                  </p>
                </div>
              </div>
            )}

            {/* Status - Full Width */}
            {status && (
              <div>
                <p className="text-xs text-default-500 uppercase tracking-wide font-medium mb-1">
                  Status
                </p>
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-danger-500" />
                  <p className="text-sm font-medium text-foreground">
                    {status}
                  </p>
                </div>
              </div>
            )}
          </div>
          {/* Refund Reason - Full Width */}
          {refundReason && (
            <div>
              <p className="text-xs text-default-500 uppercase tracking-wide font-medium mb-1">
                Refund Reason
              </p>
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-danger-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-foreground leading-relaxed">
                  {refundReason}
                </p>
              </div>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
