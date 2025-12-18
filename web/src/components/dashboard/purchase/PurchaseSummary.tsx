'use client';

import { Card, CardBody, Chip } from '@heroui/react';
import { useFormContext } from 'react-hook-form';
import { Calculator, TrendingUp, AlertCircle } from 'lucide-react';

import { formatCurrency } from '@/lib/fn';

export function PurchaseSummary() {
  const { watch } = useFormContext();

  const vendorName = watch('vendorName') || 'Not specified';
  const items = watch('items') || [];
  const subtotal = watch('subtotal') || 0;
  const otherCostsTotal = watch('otherCostsTotal') || 0;
  const includeVAT = watch('includeVAT') || false;
  const vatAmount = watch('vatAmount') || 0;
  const totalAmount = watch('totalAmount') || 0;
  const amountPaid = watch('amountPaid') || 0;
  const balance = watch('balance') || 0;

  const getStatusColor = () => {
    if (balance === 0) return 'success';
    if (amountPaid > 0) return 'warning';
    return 'danger';
  };

  const getStatusText = () => {
    if (balance === 0) return 'Fully Paid';
    if (amountPaid > 0) return 'Partially Paid';
    return 'Unpaid';
  };

  return (
    <Card className="rounded-2xl bg-gradient-to-br from-primary-50 to-secondary-50 border border-primary-100">
      <CardBody className="space-y-4">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Purchase Summary</h3>
        </div>

        {/* Vendor Info */}
        <div className="space-y-1">
          <p className="text-xs text-default-500">Vendor</p>
          <p className="text-sm font-medium">{vendorName}</p>
        </div>

        {/* Items Count */}
        <div className="space-y-1">
          <p className="text-xs text-default-500">Items</p>
          <p className="text-sm font-medium">{items.length} item(s)</p>
        </div>

        {/* Cost Breakdown */}
        <div className="space-y-2 pt-3 border-t border-divider">
          <div className="flex justify-between text-sm">
            <span className="text-default-600">Subtotal:</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>

          {otherCostsTotal > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-default-600">Other Costs:</span>
              <span>{formatCurrency(otherCostsTotal)}</span>
            </div>
          )}

          {includeVAT && (
            <div className="flex justify-between text-sm">
              <span className="text-default-600">VAT (7.5%):</span>
              <span>{formatCurrency(vatAmount)}</span>
            </div>
          )}

          <div className="flex justify-between pt-2 border-t border-divider">
            <span className="font-medium">Total Amount:</span>
            <span className="font-bold text-lg">
              {formatCurrency(totalAmount)}
            </span>
          </div>
        </div>

        {/* Payment Status */}
        <div className="space-y-2 pt-3 border-t border-divider">
          <div className="flex items-center justify-between">
            <span className="text-sm text-default-600">Payment Status:</span>
            <Chip color={getStatusColor()} size="sm" variant="flat">
              <span className="text-xs font-medium">{getStatusText()}</span>
            </Chip>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-default-600">Amount Paid:</span>
            <span className="font-medium">{formatCurrency(amountPaid)}</span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-default-600">Balance:</span>
            <span
              className={`font-bold ${balance > 0 ? 'text-danger' : 'text-success'}`}
            >
              {formatCurrency(balance)}
            </span>
          </div>
        </div>

        {/* Alert for outstanding balance */}
        {balance > 0 && (
          <div className="flex items-start gap-2 p-3 bg-warning-50 rounded-lg">
            <AlertCircle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-warning-800">
                Outstanding Balance
              </p>
              <p className="text-warning-700">
                {formatCurrency(balance)} remaining to be paid
              </p>
            </div>
          </div>
        )}

        {/* Success message for fully paid */}
        {balance === 0 && amountPaid > 0 && (
          <div className="flex items-start gap-2 p-3 bg-success-50 rounded-lg">
            <TrendingUp className="w-4 h-4 text-success mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-success-800">Fully Paid</p>
              <p className="text-success-700">
                This purchase has been completely paid for
              </p>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
