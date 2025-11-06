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
import { Invoice } from '@/types/invoices';

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
              className="h-5"
              color="success"
              size="sm"
              startContent={<CheckCircle size={12} weight="fill" />}
              variant="flat"
            >
              Paid
            </Chip>
          )}
          {hasBalance && (
            <Chip
              className="h-5"
              color="danger"
              size="sm"
              startContent={<WarningCircle size={12} weight="fill" />}
              variant="solid"
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
            className="w-full font-semibold"
            color="primary"
            endContent={<ArrowRight size={14} weight="bold" />}
            size="sm"
            variant="flat"
            onPress={() =>
              router.push(`/dashboard/receipt/${invoice.sale?.receiptNumber}`)
            }
          >
            View Receipt
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
