'use client';

import { Card, CardBody, Button, Chip } from '@heroui/react';
import {
  Receipt,
  CheckCircle,
  WarningCircle,
  ArrowRight,
} from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/fn';
import { Invoice } from '@/types/invoice';

interface InvoicePaymentSectionProps {
  invoice: Invoice;
}

export default function InvoicePaymentSection({
  invoice,
}: InvoicePaymentSectionProps) {
  const router = useRouter();

  if (!invoice.sale) return null;
  console.log(invoice.sale);

  const isFullyPaid = invoice.sale.balance === 0;
  const hasBalance = invoice.sale.balance > 0;

  return (
    <Card className={`w-full rounded-xl`} shadow="none">
      <CardBody className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs md:text-sm text-default-500 uppercase tracking-wider flex items-center gap-1.5">
            <Receipt size={14} />
            Payment Info
          </p>
          {isFullyPaid && (
            <Chip
              size="sm"
              variant="flat"
              color="success"
              startContent={<CheckCircle size={12} weight="fill" />}
              className="h-5"
            >
              Paid
            </Chip>
          )}
          {hasBalance && (
            <Chip
              size="sm"
              variant="solid"
              color="danger"
              startContent={<WarningCircle size={12} weight="fill" />}
              className="h-5"
            >
              Partial
            </Chip>
          )}
        </div>

        <div className="space-y-2.5 mb-3">
          <div className="flex justify-between items-center">
            <span className="text-xs md:text-sm text-default-600">
              Receipt No.
            </span>
            <span className="text-xs md:text-sm font-semibold text-default-900">
              {invoice.sale.receiptNumber}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-xs md:text-sm text-default-600">
              Amount Paid
            </span>
            <span className="text-sm md:text-base font-bold text-success-500">
              {formatCurrency(invoice.sale.amountPaid)}
            </span>
          </div>

          {hasBalance && (
            <div className="flex justify-between items-center pt-2 border-t border-default-200">
              <span className="text-xs md:text-sm font-semibold text-default-700">
                Balance Due
              </span>
              <span className="text-sm font-bold text-danger-500">
                {formatCurrency(invoice.sale.balance)}
              </span>
            </div>
          )}
        </div>

        {invoice.sale.receiptNumber && (
          <Button
            size="sm"
            color="primary"
            variant="flat"
            endContent={<ArrowRight size={14} weight="bold" />}
            onPress={() =>
              router.push(`/dashboard/receipt/${invoice.sale?.receiptNumber}`)
            }
            className="w-full font-semibold"
          >
            View Receipt
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
