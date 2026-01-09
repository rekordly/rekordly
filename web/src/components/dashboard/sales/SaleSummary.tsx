'use client';

import { Card, CardBody } from '@heroui/react';
import { Divider } from '@heroui/divider';
import { useFormContext } from 'react-hook-form';
import { useEffect } from 'react';

import { formatCurrency } from '@/lib/fn';
import { VAT_RATE } from '@/config/constant';
import { SaleItemType, OtherCostType } from '@/types/sales';
import { CheckCircle } from 'lucide-react';

export function SaleSummary() {
  const { setValue, watch } = useFormContext();
  const items: SaleItemType[] = watch('items') || [];
  const otherCosts: OtherCostType[] = watch('otherSaleExpenses') || [];
  const deliveryCost = watch('deliveryCost') || 0;
  const includeVAT = watch('includeVAT') ?? false;
  const discountType = watch('discountType');
  const discountValue = watch('discountValue') || 0;
  const amountPaid = watch('amountPaid') || 0;

  // Calculate totals
  const itemsTotal = items.reduce(
    (sum: number, item: SaleItemType) => sum + (item.amount || 0),
    0
  );

  const otherCostsTotal = otherCosts.reduce(
    (sum: number, cost: OtherCostType) => sum + cost.amount,
    0
  );

  const subtotal = itemsTotal;
  const vatAmount = includeVAT ? subtotal * VAT_RATE : 0;
  const subtotalWithVAT = subtotal + vatAmount;

  // Calculate discount amount
  let discountAmount = 0;
  if (discountType && discountValue > 0) {
    if (discountType === 'PERCENTAGE') {
      discountAmount = subtotalWithVAT * (discountValue / 100);
    } else {
      discountAmount = discountValue;
    }
  }

  const totalSaleExpenses = deliveryCost + otherCostsTotal;
  const totalAmount = subtotalWithVAT - discountAmount + totalSaleExpenses;
  const balance = totalAmount - amountPaid;

  // Update form values when they change
  useEffect(() => {
    setValue('subtotal', subtotal, { shouldValidate: false });
    setValue('discountAmount', discountAmount, { shouldValidate: false });
    setValue('totalSaleExpenses', totalSaleExpenses, { shouldValidate: false });
    setValue('vatAmount', vatAmount, { shouldValidate: false });
    setValue('totalAmount', totalAmount, { shouldValidate: false });
    setValue('balance', balance, { shouldValidate: false });
  }, [
    subtotal,
    discountAmount,
    totalSaleExpenses,
    vatAmount,
    totalAmount,
    balance,
    setValue,
  ]);

  const hasItems = items.length > 0;
  const hasAdditions =
    otherCosts.length > 0 ||
    deliveryCost > 0 ||
    includeVAT ||
    discountAmount > 0;

  return (
    <Card
      className="bg-linear-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200 dark:border-green-800"
      shadow="none"
    >
      <CardBody className="p-3">
        <div className="space-y-2">
          <h4 className="text-base font-semibold flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            Sale Summary
          </h4>

          {!hasItems ? (
            <p className="text-sm text-default-500 text-center py-4">
              No items added yet
            </p>
          ) : (
            <div className="space-y-1">
              {/* --- ITEMS LIST SECTION --- */}
              <div className="space-y-1">
                {items.map((item, index) => (
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

              <Divider className="my-2" />

              {/* Items Subtotal */}
              <div className="flex justify-between items-center text-sm">
                <span className="text-default-600">Items Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>

              {/* Additional Charges/Deductions */}
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

                  {discountAmount > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-default-600">Discount</span>
                      <span className="text-sm font-medium text-danger">
                        -{formatCurrency(discountAmount)}
                      </span>
                    </div>
                  )}

                  {deliveryCost > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-default-600">Delivery</span>
                      <span className="text-sm font-medium">
                        +{formatCurrency(deliveryCost)}
                      </span>
                    </div>
                  )}

                  {otherCostsTotal > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-default-600">
                        Other Costs ({otherCosts.length})
                      </span>
                      <span className="text-sm font-medium">
                        +{formatCurrency(otherCostsTotal)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <Divider className="my-2" />

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
      </CardBody>
    </Card>
  );
}
