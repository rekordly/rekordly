'use client';

import {
  Card,
  CardBody,
  Button,
  Accordion,
  AccordionItem,
} from '@heroui/react';
import { useForm, useFormContext, Controller } from 'react-hook-form';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { useRef, useState, useEffect } from 'react';
import { addToast } from '@heroui/react';
import { zodResolver } from '@hookform/resolvers/zod';

import { NumberInput, TextInput, DropdownInput } from '@/components/ui/Input';
import { formatCurrency, toTwoDecimals } from '@/lib/fn';
import { OtherCostType } from '@/types/purchases';
import { paymentMethods } from '@/config/constant';
import { OtherCostSchema } from '@/lib/validations/purchases';

export function PurchaseCostsAndPaymentSection() {
  const { setValue, watch, control } = useFormContext();
  const otherCosts: OtherCostType[] = watch('otherCosts') || [];
  const amountPaid = watch('amountPaid') || 0;
  const subtotal = watch('subtotal') || 0;
  const otherCostsTotal = watch('otherCostsTotal') || 0;
  const includeVAT = watch('includeVAT') || false;
  const vatAmount = watch('vatAmount') || 0;
  const totalAmount = watch('totalAmount') || 0;
  const balance = watch('balance') || 0;

  const [editingCostId, setEditingCostId] = useState<number | null>(null);

  const {
    control: otherCostControl,
    handleSubmit: handleAddCostSubmit,
    reset: resetCostForm,
    watch: watchCost,
  } = useForm<Omit<OtherCostType, 'id'>>({
    resolver: zodResolver(OtherCostSchema.omit({ id: true })),
    defaultValues: {
      description: '',
      amount: 0,
    },
    mode: 'onChange',
  });

  const idCounter = useRef(1);

  // Calculate and update totals whenever dependencies change
  useEffect(() => {
    const newTotalAmount =
      subtotal + otherCostsTotal + (includeVAT ? vatAmount : 0);
    const newBalance = newTotalAmount - amountPaid;

    setValue('totalAmount', toTwoDecimals(newTotalAmount), {
      shouldValidate: true,
    });
    setValue('balance', toTwoDecimals(newBalance), {
      shouldValidate: true,
    });
  }, [subtotal, otherCostsTotal, includeVAT, vatAmount, amountPaid, setValue]);

  const onAddCost = (data: Omit<OtherCostType, 'id'>) => {
    if (editingCostId !== null) {
      // Update existing cost
      const updatedCosts = otherCosts.map((cost: OtherCostType) =>
        cost.id === editingCostId
          ? {
              ...cost,
              description: data.description,
              amount: data.amount,
            }
          : cost
      );

      setValue('otherCosts', updatedCosts, { shouldValidate: true });

      const newTotal = updatedCosts.reduce(
        (sum: number, cost: OtherCostType) => sum + cost.amount,
        0
      );
      setValue('otherCostsTotal', toTwoDecimals(newTotal), {
        shouldValidate: true,
      });

      setEditingCostId(null);

      addToast({
        title: 'Cost Updated',
        description: 'Other cost has been updated successfully',
        color: 'success',
      });
    } else {
      // Add new cost
      const newCost: OtherCostType = {
        id: idCounter.current++,
        description: data.description,
        amount: data.amount,
      };

      const updatedCosts = [...otherCosts, newCost];
      setValue('otherCosts', updatedCosts, { shouldValidate: true });

      const newTotal = updatedCosts.reduce(
        (sum: number, cost: OtherCostType) => sum + cost.amount,
        0
      );
      setValue('otherCostsTotal', toTwoDecimals(newTotal), {
        shouldValidate: true,
      });

      addToast({
        title: 'Cost Added',
        description: 'Other cost has been added to the purchase',
        color: 'success',
      });
    }

    resetCostForm({
      description: '',
      amount: 0,
    });
  };

  const handleEditCost = (cost: OtherCostType) => {
    setEditingCostId(cost.id);
    resetCostForm({
      description: cost.description,
      amount: cost.amount,
    });
  };

  const handleCancelEdit = () => {
    setEditingCostId(null);
    resetCostForm({
      description: '',
      amount: 0,
    });
  };

  const removeCost = (id: number) => {
    const updatedCosts = otherCosts.filter(
      (cost: OtherCostType) => cost.id !== id
    );
    setValue('otherCosts', updatedCosts, { shouldValidate: true });

    const newTotal = updatedCosts.reduce(
      (sum: number, cost: OtherCostType) => sum + cost.amount,
      0
    );
    setValue('otherCostsTotal', toTwoDecimals(newTotal), {
      shouldValidate: true,
    });

    addToast({
      title: 'Cost Removed',
      description: 'Cost has been removed from the purchase',
      color: 'success',
    });
  };

  const handleVATToggle = (enabled: boolean) => {
    setValue('includeVAT', enabled, { shouldValidate: true });
    if (enabled) {
      const newVATAmount = toTwoDecimals(subtotal * 0.075);
      setValue('vatAmount', newVATAmount, { shouldValidate: true });
    } else {
      setValue('vatAmount', 0, { shouldValidate: true });
    }
  };

  const handleAmountPaidChange = (value: number) => {
    setValue('amountPaid', value, { shouldValidate: true });
  };

  return (
    <Card className="w-full rounded-3xl p-4 px-2" shadow="none">
      <CardBody>
        <Accordion variant="light">
          {/* Other Costs */}
          <AccordionItem
            key="other-costs"
            aria-label="Other Costs"
            title="Other Costs"
            subtitle="Add shipping, handling, etc."
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
                    placeholder="e.g., shipping, installation"
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

              <div className="flex gap-2">
                {editingCostId !== null && (
                  <Button
                    fullWidth
                    color="default"
                    type="button"
                    variant="flat"
                    onPress={handleCancelEdit}
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  fullWidth
                  color="primary"
                  startContent={
                    editingCostId !== null ? (
                      <Edit2 size={16} />
                    ) : (
                      <Plus size={16} />
                    )
                  }
                  variant="flat"
                  onPress={() => handleAddCostSubmit(onAddCost)()}
                >
                  {editingCostId !== null ? 'Update Cost' : 'Add Cost'}
                </Button>
              </div>

              {otherCosts.length > 0 && (
                <div className="space-y-2 mt-4">
                  <p className="text-xs font-medium text-default-500 uppercase">
                    Added Costs ({otherCosts.length})
                  </p>
                  <div className="space-y-2">
                    {otherCosts.map((cost: OtherCostType) => (
                      <div
                        key={cost.id}
                        className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                          editingCostId === cost.id
                            ? 'bg-primary-50 border border-primary'
                            : 'bg-default-50 hover:bg-default-100'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {cost.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-sm font-medium">
                            {formatCurrency(cost.amount)}
                          </span>
                          <div className="flex gap-1">
                            <Button
                              isIconOnly
                              color={
                                editingCostId === cost.id
                                  ? 'primary'
                                  : 'default'
                              }
                              size="sm"
                              type="button"
                              variant="light"
                              onPress={() => handleEditCost(cost)}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
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
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </AccordionItem>

          {/* VAT */}
          <AccordionItem
            key="vat"
            aria-label="VAT"
            title="VAT (7.5%)"
            subtitle="Include VAT in purchase"
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
                      onChange={e => {
                        field.onChange(e);
                        handleVATToggle(e.target.checked);
                      }}
                    />
                    <span className="text-sm">
                      Include VAT (7.5%) in this purchase
                    </span>
                  </label>
                )}
              />

              {includeVAT && (
                <div className="flex justify-between mt-2">
                  <span className="text-sm">VAT Amount:</span>
                  <span className="text-sm font-medium">
                    {formatCurrency(vatAmount)}
                  </span>
                </div>
              )}
            </div>
          </AccordionItem>

          {/* Payment */}
          <AccordionItem
            key="payment"
            aria-label="Payment"
            title="Payment"
            subtitle="Record payment made"
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

              <div className="space-y-2 pt-2 border-t border-divider">
                <div className="flex justify-between">
                  <span className="text-sm">Total Amount:</span>
                  <span className="text-sm font-bold">
                    {formatCurrency(totalAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Amount Paid:</span>
                  <span className="text-sm font-medium">
                    {formatCurrency(amountPaid)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Balance:</span>
                  <span
                    className={`text-sm font-bold ${balance > 0 ? 'text-danger' : 'text-success'}`}
                  >
                    {formatCurrency(balance)}
                  </span>
                </div>
              </div>
            </div>
          </AccordionItem>
        </Accordion>
      </CardBody>
    </Card>
  );
}
