// components/dashboard/invoice/InvoiceSummary.tsx
'use client';

import {
  Card,
  CardBody,
  Button,
  Checkbox,
  Accordion,
  AccordionItem,
} from '@heroui/react';
import { Divider } from '@heroui/divider';
import { useFormContext, Controller } from 'react-hook-form';
import { Trash2 } from 'lucide-react';
import { useEffect } from 'react';

import { InvoiceItemType } from '@/types/invoices';
import { formatCurrency } from '@/lib/fn';
import { CheckCircle } from '@phosphor-icons/react';
import { TextInput } from '@/components/ui/Input';

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
        <CardBody>
          <div className="space-y-4">
            <h4 className="text-base font-semibold flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Sale Summary
            </h4>
            {items.length === 0 ? (
              <p className="text-sm text-default-500 text-center">
                No items added yet.
              </p>
            ) : (
              <div className="space-y-1">
                <div className="space-y-1">
                  {items.map((item: InvoiceItemType) => (
                    <div
                      key={item.id}
                      className="flex justify-between items-center text-sm"
                    >
                      {/* Left Side: Item Name + Qty/Rate */}
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="font-medium text-foreground truncate">
                          {item.description}
                        </span>
                        <span className="text-default-500 whitespace-nowrap">
                          {item.quantity} x {formatCurrency(item.rate)}
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
                  <span className="font-medium">
                    {formatCurrency(subtotal)}
                  </span>
                </div>

                {includeVAT && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-default-600">VAT (7.5%)</span>
                    <span className="text-sm font-medium">
                      +{formatCurrency(vatAmount)}
                    </span>
                  </div>
                )}

                <Divider className="my-2" />

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
