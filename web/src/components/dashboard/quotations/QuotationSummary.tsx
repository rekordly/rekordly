'use client';

import {
  Card,
  CardBody,
  Checkbox,
  Divider,
  Accordion,
  AccordionItem,
} from '@heroui/react';
import { useFormContext, Controller } from 'react-hook-form';
import { useEffect } from 'react';
import { CalculatorIcon } from '@phosphor-icons/react';

import { formatCurrency } from '@/lib/fn';
import { VAT_RATE } from '@/config/constant';

type LineItem = {
  id?: string;
  type: 'MATERIAL' | 'SERVICE' | 'PRODUCT' | 'OTHER';
  name: string;
  description?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  inventoryItemId?: string;
};

type OtherCost = {
  id?: number;
  description: string;
  amount: number;
};

export function QuotationSummary() {
  const { control, setValue, watch } = useFormContext();
  const lineItems: LineItem[] = watch('lineItems') || [];
  const otherCosts: OtherCost[] = watch('otherCosts') || [];
  const includeVAT = watch('includeVAT') ?? false;

  // Calculate totals
  const subtotal = lineItems.reduce(
    (sum: number, item: LineItem) => sum + item.amount,
    0
  );

  const otherCostsTotal = otherCosts.reduce(
    (sum: number, cost: OtherCost) => sum + cost.amount,
    0
  );

  const vatAmount = includeVAT ? subtotal * VAT_RATE : 0;
  const total = subtotal + vatAmount + otherCostsTotal;

  // Update form values when they change
  useEffect(() => {
    setValue('subtotal', subtotal);
    setValue('vatAmount', vatAmount);
    setValue('totalAmount', total);
  }, [subtotal, vatAmount, total, setValue]);

  const hasItems = lineItems.length > 0;
  const hasAdditions = includeVAT || otherCostsTotal > 0;

  return (
    <>
      <Card
        className="w-full rounded-2xl p-3 bg-transparent border border-default-200"
        shadow="none"
      >
        <CardBody className="p-0">
          <div className="space-y-3">
            <Accordion variant="light">
              <AccordionItem
                key="vat"
                aria-label="VAT"
                title="VAT (7.5%)"
                subtitle="Include VAT in sale"
                classNames={{
                  title: 'font-semibold',
                  subtitle: 'text-xs',
                  trigger: 'py-0',
                }}
              >
                <div className="pb-4">
                  <Controller
                    control={control}
                    name="includeVAT"
                    render={({ field }) => (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          checked={field.value}
                          className="w-4 h-4 text-primary bg-default-100 border-default-300 rounded focus:ring-primary"
                          type="checkbox"
                          onChange={field.onChange}
                        />
                        <span className="text-sm">
                          Include VAT (7.5%) in this sale
                        </span>
                      </label>
                    )}
                  />
                </div>
              </AccordionItem>
            </Accordion>
          </div>
        </CardBody>
      </Card>

      <Card
        className="bg-linear-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200 dark:border-green-800"
        shadow="none"
      >
        <CardBody className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-semibold flex items-center gap-2">
              <CalculatorIcon className="w-5 h-5 text-primary" />
              Quotation Summary
            </h4>
          </div>

          {/* Cost Breakdown */}
          <div className="space-y-2 pt-2">
            {!hasItems ? (
              <p className="text-sm text-default-500 text-center py-4">
                No items added yet
              </p>
            ) : (
              <div className="space-y-1">
                {/* Line Items List */}
                {lineItems.length > 0 && (
                  <div className="space-y-1">
                    {lineItems.map((item: LineItem) => (
                      <div
                        key={item.id}
                        className="flex justify-between items-center text-sm"
                      >
                        {/* Left Side: Item Name + Qty/Rate */}
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="font-medium text-foreground truncate">
                            {item.name}
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
                )}

                {lineItems.length > 0 && (
                  <>
                    <Divider className="mt-3 mb-2" />

                    {/* Items Subtotal */}
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-default-600">Items Subtotal</span>
                      <span className="font-medium">
                        {formatCurrency(subtotal)}
                      </span>
                    </div>
                  </>
                )}

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
                        {otherCosts.map((cost: OtherCost) => (
                          <div
                            key={cost.id}
                            className="flex justify-between items-center text-sm"
                          >
                            <span className="text-default-600">
                              {cost.description || 'Other Cost'}
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
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </>
  );
}
