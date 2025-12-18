'use client';

import { Card, CardBody, Button, Checkbox } from '@heroui/react';
import { Divider } from '@heroui/divider';
import { useForm, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { addToast } from '@heroui/react';

import { TextInput, NumberInput } from '@/components/ui/Input';
import { AddOtherCostInput, OtherCostType } from '@/types/quotations';
import { addOtherCostSchema } from '@/lib/validations/quotations';
import { formatCurrency } from '@/lib/fn';

export function AddCostSection() {
  const { setValue, watch, control } = useFormContext();
  const otherCosts = watch('otherCosts') || [];
  const [showOtherCosts, setShowOtherCosts] = useState(false);
  const [editingCostId, setEditingCostId] = useState<number | null>(null);

  const {
    control: otherCostControl,
    handleSubmit: handleAddCostSubmit,
    reset: resetCostForm,
    formState: { errors: costErrors },
  } = useForm<AddOtherCostInput>({
    resolver: zodResolver(addOtherCostSchema),
    defaultValues: {
      description: '',
      amount: 0,
    },
    mode: 'onChange',
  });

  const idCounter = useRef(1);

  // Edit cost handler
  const handleEditCost = (cost: OtherCostType) => {
    setEditingCostId(cost.id);
    resetCostForm({
      description: cost.description,
      amount: cost.amount,
    });
  };

  // Remove cost handler
  const removeCost = (id: number) => {
    const updatedCosts = otherCosts.filter(
      (cost: OtherCostType) => cost.id !== id
    );
    setValue('otherCosts', updatedCosts, { shouldValidate: true });

    const newTotal = updatedCosts.reduce(
      (sum: number, cost: OtherCostType) => sum + cost.amount,
      0
    );
    setValue('otherCostsTotal', newTotal, { shouldValidate: true });

    addToast({
      title: 'Cost Removed',
      description: 'Cost has been removed from the quotation',
      color: 'success',
    });
  };

  // Add or update cost handler
  const onAddCost = (data: AddOtherCostInput) => {
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
      setValue('otherCostsTotal', newTotal, { shouldValidate: true });

      setEditingCostId(null);

      addToast({
        title: 'Cost Updated',
        description: 'Cost has been updated successfully',
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
      setValue('otherCostsTotal', newTotal, { shouldValidate: true });

      addToast({
        title: 'Other Cost Added',
        description: 'Cost has been added to the quotation',
        color: 'success',
      });
    }

    resetCostForm({
      description: '',
      amount: 0,
    });
  };

  const handleCancelEdit = () => {
    setEditingCostId(null);
    resetCostForm({
      description: '',
      amount: 0,
    });
  };

  return (
    <Card className="w-full rounded-3xl p-4 px-2" shadow="none">
      <CardBody className="gap-4">
        <div>
          <h4 className="text-sm font-semibold text-foreground">
            Additional Costs
          </h4>
          <p className="text-xs text-default-500">
            Add workmanship and other costs to the quotation
          </p>
        </div>

        <Divider />

        <div className="space-y-2">
          <NumberInput
            control={control}
            label="Workmanship (₦)"
            min={0}
            name="workmanship"
            placeholder="0.00"
            startContent={<span className="text-default-400">₦</span>}
            step={0.01}
          />
        </div>

        <Divider />

        <Checkbox
          isSelected={showOtherCosts}
          size="sm"
          onValueChange={setShowOtherCosts}
        >
          <span className="text-sm">
            Add other costs (e.g., transportation, etc)
          </span>
        </Checkbox>

        {showOtherCosts && (
          <>
            <Divider />

            <div className="space-y-3">
              <h4 className="text-sm font-medium">Other Costs</h4>

              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-12 md:col-span-8">
                  <TextInput
                    control={otherCostControl}
                    label="Description"
                    name="description"
                    placeholder="e.g., transportation"
                  />
                </div>
                <div className="col-span-12 md:col-span-4">
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
                    color="default"
                    size="sm"
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
            </div>

            {/* Display added costs */}
            {otherCosts.length > 0 && (
              <>
                <Divider />
                <div className="space-y-2">
                  <h5 className="text-xs font-medium text-default-500 uppercase">
                    Added Costs ({otherCosts.length})
                  </h5>
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
                          <p className="text-sm font-medium text-foreground truncate">
                            {cost.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
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
              </>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
