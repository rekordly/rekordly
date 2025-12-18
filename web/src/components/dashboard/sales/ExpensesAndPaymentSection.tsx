'use client';

import {
  Card,
  CardBody,
  Button,
  Accordion,
  AccordionItem,
} from '@heroui/react';
import { useForm, useFormContext, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { addToast } from '@heroui/react';
import type { Resolver } from 'react-hook-form';

import { TextInput, NumberInput, DropdownInput } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/fn';
import { OtherExpensesSchema } from '@/lib/validations/sales';
import { OtherCostType } from '@/types/sales';
import { paymentMethods } from '@/config/constant';

export function ExpensesAndPaymentSection() {
  const { setValue, watch, control } = useFormContext();
  const otherCosts: OtherCostType[] = watch('otherSaleExpenses') || [];
  const amountPaid = watch('amountPaid') || 0;
  const discountType = watch('discountType');

  const {
    control: otherCostControl,
    handleSubmit: handleAddCostSubmit,
    reset: resetCostForm,
  } = useForm<Omit<OtherCostType, 'id'>>({
    resolver: zodResolver(OtherExpensesSchema.omit({ id: true })) as Resolver<
      Omit<OtherCostType, 'id'>
    >,
    defaultValues: {
      description: '',
      amount: 0,
    },
    mode: 'onChange',
  });

  const idCounter = useRef(1);

  const onAddCost = (data: Omit<OtherCostType, 'id'>) => {
    const newCost: OtherCostType = {
      id: idCounter.current++,
      description: data.description,
      amount: data.amount,
    };

    const updatedCosts = [...otherCosts, newCost];
    setValue('otherSaleExpenses', updatedCosts, { shouldValidate: true });

    const newTotal = updatedCosts.reduce(
      (sum: number, cost: OtherCostType) => sum + cost.amount,
      0
    );
    const deliveryCost = watch('deliveryCost') || 0;
    setValue('totalSaleExpenses', deliveryCost + newTotal, {
      shouldValidate: true,
    });

    resetCostForm({
      description: '',
      amount: 0,
    });

    addToast({
      title: 'Cost Added',
      description: 'Other cost has been added to the sale',
      color: 'success',
    });
  };

  const removeCost = (id: number) => {
    const updatedCosts = otherCosts.filter(
      (cost: OtherCostType) => cost.id !== id
    );
    setValue('otherSaleExpenses', updatedCosts, { shouldValidate: true });

    const newTotal = updatedCosts.reduce(
      (sum: number, cost: OtherCostType) => sum + cost.amount,
      0
    );
    const deliveryCost = watch('deliveryCost') || 0;
    setValue('totalSaleExpenses', deliveryCost + newTotal, {
      shouldValidate: true,
    });

    addToast({
      title: 'Cost Removed',
      description: 'Cost has been removed from the sale',
      color: 'success',
    });
  };

  return (
    <Card className="w-full rounded-3xl p-4 px-2" shadow="none">
      <CardBody>
        <Accordion variant="light">
          {/* Delivery Cost */}
          <AccordionItem
            key="delivery"
            aria-label="Delivery Cost"
            title="Delivery Cost"
            subtitle="Add delivery charges"
            classNames={{
              title: 'font-semibold',
              subtitle: 'text-xs',
            }}
          >
            <div className="pb-4">
              <NumberInput
                control={control}
                label="Delivery Cost (₦)"
                min={0}
                name="deliveryCost"
                placeholder="0.00"
                startContent={<span className="text-default-400">₦</span>}
                step={0.01}
              />
            </div>
          </AccordionItem>

          {/* Other Costs */}
          <AccordionItem
            key="other-costs"
            aria-label="Other Costs"
            title="Other Costs"
            subtitle="Add packaging, handling, etc."
            classNames={{
              title: 'font-semibold',
              subtitle: 'text-xs',
            }}
          >
            <div className="space-y-4 pb-4">
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-12 md:col-span-7">
                  <TextInput
                    control={otherCostControl}
                    label="Description"
                    name="description"
                    placeholder="e.g., packaging"
                  />
                </div>
                <div className="col-span-12 md:col-span-5">
                  <NumberInput
                    control={otherCostControl}
                    label="Amount (₦)"
                    min={0}
                    name="amount"
                    placeholder="0.00"
                    startContent={<span className="text-default-400">₦</span>}
                    step={0.01}
                  />
                </div>
              </div>

              <Button
                fullWidth
                color="primary"
                startContent={<Plus size={16} />}
                variant="flat"
                onPress={() => handleAddCostSubmit(onAddCost)()}
              >
                Add Cost
              </Button>

              {/* Display added costs */}
              {otherCosts.length > 0 && (
                <div className="space-y-2 mt-4">
                  <p className="text-xs font-medium text-default-500 uppercase">
                    Added Costs ({otherCosts.length})
                  </p>
                  <div className="space-y-2">
                    {otherCosts.map((cost: OtherCostType) => (
                      <div
                        key={cost.id}
                        className="flex items-center justify-between p-2 bg-default-50 rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {cost.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-medium">
                            {formatCurrency(cost.amount)}
                          </span>
                          <Button
                            isIconOnly
                            color="danger"
                            size="sm"
                            type="button"
                            variant="light"
                            onPress={() => removeCost(cost.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </AccordionItem>

          {/* Discount */}
          <AccordionItem
            key="discount"
            aria-label="Discount"
            title="Discount"
            subtitle="Apply discount to sale"
            classNames={{
              title: 'font-semibold',
              subtitle: 'text-xs',
            }}
          >
            <div className="space-y-4 pb-4">
              <div className="grid grid-cols-1 gap-3">
                <div className="col-span-1">
                  <Controller
                    control={control}
                    name="discountType"
                    render={({ field }) => (
                      <DropdownInput
                        control={control}
                        items={[
                          { label: 'Percentage (%)', value: 'PERCENTAGE' },
                          { label: 'Fixed Amount (₦)', value: 'FIXED_AMOUNT' },
                        ]}
                        label="Discount Type"
                        name="discountType"
                        placeholder="Select type"
                      />
                    )}
                  />
                </div>

                {discountType && (
                  <div className="col-span-1">
                    <NumberInput
                      control={control}
                      label={
                        discountType === 'PERCENTAGE'
                          ? 'Discount (%)'
                          : 'Discount Amount (₦)'
                      }
                      min={0}
                      max={discountType === 'PERCENTAGE' ? 100 : undefined}
                      name="discountValue"
                      placeholder={
                        discountType === 'PERCENTAGE' ? '0%' : '₦0.00'
                      }
                      startContent={
                        discountType === 'FIXED_AMOUNT' ? (
                          <span className="text-default-400">₦</span>
                        ) : undefined
                      }
                      step={discountType === 'PERCENTAGE' ? 1 : 0.01}
                    />
                  </div>
                )}
              </div>
            </div>
          </AccordionItem>

          {/* VAT */}
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

          {/* Payment */}
          <AccordionItem
            key="payment"
            aria-label="Payment"
            title="Payment"
            subtitle="Record payment received"
            classNames={{
              title: 'font-semibold',
              subtitle: 'text-xs',
            }}
          >
            <div className="space-y-4 pb-4">
              <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                <NumberInput
                  control={control}
                  label="Amount Paid (₦)"
                  min={0}
                  name="amountPaid"
                  placeholder="0.00"
                  startContent={<span className="text-default-400">₦</span>}
                  step={0.01}
                />

                {amountPaid > 0 && (
                  <DropdownInput
                    isRequired
                    control={control}
                    items={paymentMethods}
                    label="Payment Method"
                    name="paymentMethod"
                    placeholder="Select method"
                  />
                )}
              </div>
            </div>
          </AccordionItem>
        </Accordion>
      </CardBody>
    </Card>
  );
}
