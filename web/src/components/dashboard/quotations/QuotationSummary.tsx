'use client';

import { Card, CardBody, Button, Checkbox } from '@heroui/react';
import { Divider } from '@heroui/divider';
import { useFormContext, Controller } from 'react-hook-form';
import { Trash2 } from 'lucide-react';
import { useEffect } from 'react';

import { formatCurrency } from '@/lib/fn';
import { VAT_RATE } from '@/config/constant';
import { MaterialItemType, OtherCostType } from '@/types/quotations';

export function QuotationSummary() {
  const { control, setValue, watch } = useFormContext();
  const materials = watch('materials') || [];
  const otherCosts = watch('otherCosts') || [];
  const workmanship = watch('workmanship') || 0;
  const includeVAT = watch('includeVAT') ?? false;

  // Calculate totals
  const materialsTotal = materials.reduce(
    (sum: number, material: MaterialItemType) => sum + material.total,
    0
  );

  const otherCostsTotal = otherCosts.reduce(
    (sum: number, cost: OtherCostType) => sum + cost.amount,
    0
  );

  const subtotal = materialsTotal + workmanship;
  const vatAmount = includeVAT ? subtotal * VAT_RATE : 0;
  const total = subtotal + vatAmount + otherCostsTotal;

  // Update form values when they change
  useEffect(() => {
    setValue('materialsTotal', materialsTotal);
    setValue('otherCostsTotal', otherCostsTotal);
    setValue('vatAmount', vatAmount);
    setValue('totalAmount', total);
  }, [materialsTotal, otherCostsTotal, vatAmount, total, setValue]);

  const removeMaterial = (id: number) => {
    const updatedMaterials = materials.filter(
      (material: MaterialItemType) => material.id !== id
    );

    setValue('materials', updatedMaterials);
  };

  const removeCost = (id: number) => {
    const updatedCosts = otherCosts.filter(
      (cost: OtherCostType) => cost.id !== id
    );

    setValue('otherCosts', updatedCosts);
  };

  const hasItems =
    materials.length > 0 || otherCosts.length > 0 || workmanship > 0;

  return (
    <Card className="w-full rounded-3xl p-4 px-2" shadow="none">
      <CardBody>
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-foreground">
            Quotation Summary
          </h4>
          <Divider />

          {!hasItems ? (
            <p className="text-sm text-default-500 text-center">
              No items added yet.
            </p>
          ) : (
            <>
              {/* VAT Checkbox */}
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

              {/* Totals Breakdown */}
              <div className="pt-2">
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-default-600">Material Cost:</span>
                    <span className="font-semibold">
                      {formatCurrency(materialsTotal)}
                    </span>
                  </div>

                  {workmanship > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-default-600">Workmanship:</span>
                      <span className="font-semibold">
                        {formatCurrency(workmanship)}
                      </span>
                    </div>
                  )}

                  {includeVAT && (
                    <div className="flex justify-between text-sm">
                      <span className="text-default-600">VAT (7.5%):</span>
                      <span className="font-semibold">
                        {formatCurrency(vatAmount)}
                      </span>
                    </div>
                  )}

                  {otherCostsTotal > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-default-600">Other Costs:</span>
                      <span className="font-semibold">
                        {formatCurrency(otherCostsTotal)}
                      </span>
                    </div>
                  )}

                  <Divider />

                  <div className="flex justify-between text-lg font-bold">
                    <span>Total:</span>
                    <span className="text-foreground">
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
