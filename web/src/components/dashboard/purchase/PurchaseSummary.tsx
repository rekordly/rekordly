'use client';

import { Card, CardBody, Chip, Divider } from '@heroui/react';
import { useFormContext } from 'react-hook-form';
import { TrendingUp, AlertCircle } from 'lucide-react';
import { PurchaseType } from '@prisma/client';

import { formatCurrency } from '@/lib/fn';
import { CalculatorIcon } from '@phosphor-icons/react';

interface PurchaseSummaryProps {
  purchaseType: PurchaseType;
}

export function PurchaseSummary({ purchaseType }: PurchaseSummaryProps) {
  const { watch } = useFormContext();

  const customer = watch('customer');
  const vendorName = customer?.name || 'Not specified';
  const items = watch('items') || [];
  const subtotal = watch('subtotal') || 0;
  const otherCosts = watch('otherCosts') || [];
  const otherCostsTotal = watch('otherCostsTotal') || 0;
  const includeVAT = watch('includeVAT') || false;
  const vatAmount = watch('vatAmount') || 0;
  const totalAmount = watch('totalAmount') || 0;
  const amountPaid = watch('amountPaid') || 0;
  const balance = watch('balance') || 0;

  const hasItems = items.length > 0;
  const hasAdditions = includeVAT || otherCostsTotal > 0;

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

  const getPurchaseTypeLabel = () => {
    switch (purchaseType) {
      case 'INVENTORY_RESTOCK':
        return 'Inventory Purchase';
      case 'BUSINESS_EXPENSE':
        return 'Business Expense';
      case 'ASSET_PURCHASE':
        return 'Asset Purchase';
      case 'PERSONAL_EXPENSE':
        return 'Personal Expense';
      default:
        return 'Purchase';
    }
  };

  const getPurchaseTypeColor = () => {
    switch (purchaseType) {
      case 'INVENTORY_RESTOCK':
        return 'primary' as const;
      case 'BUSINESS_EXPENSE':
        return 'secondary' as const;
      case 'ASSET_PURCHASE':
        return 'success' as const;
      case 'PERSONAL_EXPENSE':
        return 'warning' as const;
      default:
        return 'default' as const;
    }
  };

  return (
    <Card
      className="bg-linear-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200 dark:border-green-800"
      shadow="none"
    >
      <CardBody className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-base font-semibold flex items-center gap-2">
            <CalculatorIcon className="w-5 h-5 text-primary" />
            Purchase Summary
          </h4>

          <Chip color={getPurchaseTypeColor()} size="sm" variant="flat">
            {getPurchaseTypeLabel()}
          </Chip>
        </div>

        {/* Vendor Info */}
        {/* <div className="space-y-1 flex justify-between items-center">
          <p className="text-xs text-default-500">Vendor</p>
          <p className="text-sm font-medium">{vendorName}</p>
        </div> */}

        {/* Cost Breakdown */}
        <div className="space-y-2 pt-3 ">
          {!hasItems ? (
            <p className="text-sm text-default-500 text-center py-4">
              No items added yet
            </p>
          ) : (
            <div className="space-y-1">
              {/* --- ITEMS LIST SECTION --- */}
              <div className="space-y-1">
                {items.map((item: any, index: number) => (
                  <div
                    key={item.id || index}
                    className="flex justify-between items-center text-sm"
                  >
                    {/* Left Side: Item Name + Qty/Rate */}
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="font-medium text-foreground truncate">
                        {item.itemName}
                      </span>
                      <span className="text-default-500 whitespace-nowrap">
                        {item.quantity} x {formatCurrency(item.unitPrice)}
                      </span>
                    </div>

                    {/* Right Side: Amount */}
                    <span className="font-medium text-foreground whitespace-nowrap ml-2">
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                ))}
              </div>

              <Divider className="mt-4 mb-2" />

              {/* Items Subtotal */}
              <div className="flex justify-between items-center text-sm">
                <span className="text-default-600">Items Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>

              {/* Additional Charges */}
              {hasAdditions && (
                <div className="space-y-0.5">
                  {includeVAT && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-default-600">VAT (7.5%)</span>
                      <span className="text-sm font-medium">
                        +{formatCurrency(vatAmount)}
                      </span>
                    </div>
                  )}

                  {otherCostsTotal > 0 && (
                    <>
                      {otherCosts.map((cost: any, index: number) => (
                        <div
                          key={cost.id || index}
                          className="flex justify-between items-center text-sm"
                        >
                          <span className="text-default-600">
                            {cost.description || `Other Cost ${index + 1}`}
                          </span>
                          <span className="text-sm font-medium">
                            +{formatCurrency(cost.amount)}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              <Divider className="mt-2" />

              {/* Total Amount */}
              <div className="flex justify-between items-center pt-1">
                <span className="text-base font-semibold text-foreground">
                  Total Amount
                </span>
                <span className="text-base font-semibold text-foreground">
                  {formatCurrency(totalAmount)}
                </span>
              </div>

              {/* Payment Info */}
              {amountPaid > 0 && (
                <>
                  <Divider className="my-2" />
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-default-600">Amount Paid</span>
                    <span className="text-sm font-medium">
                      {formatCurrency(amountPaid)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-sm font-medium text-foreground">
                      Balance
                    </span>
                    <span
                      className={`text-sm font-medium ${
                        balance > 0 ? 'text-warning' : 'text-success'
                      }`}
                    >
                      {formatCurrency(balance)}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Alert for outstanding balance */}
        {/* {balance > 0 && (
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
        )} */}

        {/* Success message for fully paid */}
        {/* {balance === 0 && amountPaid > 0 && (
          <div className="flex items-start gap-2 p-3 bg-success-50 rounded-lg">
            <TrendingUp className="w-4 h-4 text-success mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-success-800">Fully Paid</p>
              <p className="text-success-700">
                This purchase has been completely paid for
              </p>
            </div>
          </div>
        )} */}
      </CardBody>
    </Card>
  );
}
