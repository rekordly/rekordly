// components/dashboard/invoice/InvoiceSummary.tsx
'use client';

import { Card, CardBody, Button, Checkbox } from '@heroui/react';
import { Divider } from '@heroui/divider';
import { useFormContext, Controller } from 'react-hook-form';
import { Trash2 } from 'lucide-react';
import { useEffect } from 'react';

import { InvoiceItemType } from '@/types/invoices';
import { formatCurrency } from '@/lib/fn';

const VAT_RATE = 0.075; // 7.5%

export function InvoiceSummary() {
  const { control, setValue, watch } = useFormContext();
  const items = watch('items') || [];
  const includeVAT = watch('includeVAT') ?? false;

  // totals with proper typing
  const subtotal = items.reduce(
    (sum: number, item: InvoiceItemType) => sum + item.amount,
    0
  );
  const vatAmount = includeVAT ? subtotal * VAT_RATE : 0;
  const total = subtotal + vatAmount;

  // Update vatAmount and totalAmount in form when they change
  useEffect(() => {
    setValue('vatAmount', vatAmount);
    setValue('totalAmount', total);
    setValue('amount', subtotal);
  }, [vatAmount, total, subtotal, setValue]);

  const removeItem = (id: number) => {
    const updatedItems = items.filter(
      (item: InvoiceItemType) => item.id !== id
    );

    setValue('items', updatedItems);
  };

  return (
    <Card className="w-full rounded-3xl p-4 px-2" shadow="none">
      <CardBody>
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-foreground">
            Invoice Summary
          </h4>
          <Divider />

          {items.length === 0 ? (
            <p className="text-sm text-default-500 text-center">
              No items added yet.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                {items.map((item: InvoiceItemType) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-default-50 rounded-xl"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-default-500">
                          #{item.id}
                        </span>
                        <span className="text-sm font-medium text-foreground">
                          {item.description}
                        </span>
                      </div>
                      <div className="text-xs text-default-500 mt-1">
                        {item.quantity} × {formatCurrency(item.rate)}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold">
                        {formatCurrency(item.amount)}
                      </span>
                      <Button
                        isIconOnly
                        color="danger"
                        size="sm"
                        type="button"
                        variant="light"
                        onPress={() => removeItem(item.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <Controller
                  control={control}
                  name="includeVAT"
                  render={({ field }) => (
                    <Checkbox
                      isSelected={field.value}
                      onValueChange={field.onChange}
                    >
                      <span className="text-sm">Include VAT (7.5%)</span>
                    </Checkbox>
                  )}
                />
              </div>

              <div className="flex justify-end pt-2">
                <div className="w-full md:w-1/3 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-default-600">Subtotal:</span>
                    <span className="font-semibold">
                      {formatCurrency(subtotal)}
                    </span>
                  </div>

                  {includeVAT && (
                    <div className="flex justify-between text-sm">
                      <span className="text-default-600">VAT (7.5%):</span>
                      <span className="font-semibold">
                        {formatCurrency(vatAmount)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between text-sm">
                    <span className="text-default-600">
                      Amount (incl. VAT):
                    </span>
                    <span className="font-semibold">
                      {formatCurrency(total)}
                    </span>
                  </div>

                  <Divider />

                  <div className="flex justify-between text-lg font-bold">
                    <span>Total:</span>
                    <span className="text-primary">
                      {formatCurrency(total)}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
