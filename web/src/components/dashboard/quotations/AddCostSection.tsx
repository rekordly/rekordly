'use client';

import { Card, CardBody, Button } from '@heroui/react';
import { Divider } from '@heroui/divider';
import { useForm, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { addToast } from '@heroui/react';

import { TextInput, NumberInput } from '@/components/ui/Input';
import { AddOtherCostInput, OtherCostType } from '@/types/quotations';
import { OtherCostSchema } from '@/lib/validations/quotations';
import { formatCurrency } from '@/lib/fn';

export function AddCostSection() {
  const { setValue, watch } = useFormContext();
  const otherCosts = watch('otherCosts') || [];
  const [editingCostId, setEditingCostId] = useState<number | null>(null);

  const {
    control: otherCostControl,
    handleSubmit: handleAddCostSubmit,
    watch: watchCost,
    reset: resetCostForm,
  } = useForm<AddOtherCostInput>({
    resolver: zodResolver(OtherCostSchema),
    defaultValues: {
      description: '',
      amount: 0,
    },
    mode: 'onChange',
  });

  const costAmount = Number(watchCost('amount')) || 0;
  const idCounter = useRef(1);

  const handleEditCost = (cost: OtherCostType) => {
    setEditingCostId(cost.id ?? null);
    resetCostForm({
      description: cost.description,
      amount: cost.amount,
    });
  };

  const removeCost = (id: number) => {
    const updatedCosts = otherCosts.filter(
      (cost: OtherCostType) => cost.id !== id
    );
    setValue('otherCosts', updatedCosts, { shouldValidate: true });

    addToast({
      title: 'Cost Removed',
      description: 'Cost has been removed from the quotation',
      color: 'success',
    });
  };

  const onAddCost = (data: AddOtherCostInput) => {
    if (editingCostId !== null) {
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
      setEditingCostId(null);

      addToast({
        title: 'Cost Updated',
        description: 'Cost has been updated successfully',
        color: 'success',
      });
    } else {
      const newCost: OtherCostType = {
        id: idCounter.current++,
        description: data.description,
        amount: data.amount,
      };

      const updatedCosts = [...otherCosts, newCost];
      setValue('otherCosts', updatedCosts, { shouldValidate: true });

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
    <Card
      className="w-full rounded-2xl p-3 bg-transparent border border-default-200"
      shadow="none"
    >
      <CardBody className="p-0 space-y-3">
        <div className="space-y-2 px-2">
          <h4 className="text-base font-semibold text-foreground">
            Other Costs
          </h4>
          <p className="text-xs text-default-500">
            Add transportation, handling, and other miscellaneous costs
          </p>
        </div>

        <TextInput
          control={otherCostControl}
          label="Description"
          name="description"
          placeholder="e.g., Transportation, Handling fee"
        />

        <div className="flex items-end gap-2">
          <div className="flex-1">
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

          <div className="flex gap-2 shrink-0">
            {editingCostId !== null && (
              <Button
                color="default"
                size="lg"
                type="button"
                variant="flat"
                onPress={handleCancelEdit}
              >
                Cancel
              </Button>
            )}
            <Button
              color="primary"
              size="lg"
              startContent={
                editingCostId !== null ? (
                  <Edit2 className="w-4 h-4" />
                ) : (
                  <Plus className="w-4 h-4" />
                )
              }
              type="button"
              variant="flat"
              onPress={() => handleAddCostSubmit(onAddCost)()}
            >
              {editingCostId !== null ? 'Update' : 'Add'}
            </Button>
          </div>
        </div>

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
                            editingCostId === cost.id ? 'primary' : 'default'
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
                          onPress={() =>
                            cost.id !== undefined && removeCost(cost.id)
                          }
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
      </CardBody>
    </Card>
  );
}
