'use client';

import { Card, CardBody, Button, Checkbox } from '@heroui/react';
import { Divider } from '@heroui/divider';
import { useForm, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { addToast } from '@heroui/react';
import { TextInput, NumberInput } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/fn';
import { AddOtherCostInput, OtherCostType } from '@/types/quotations';
import { addOtherCostSchema } from '@/lib/validations/quotations';

export function AddCostSection() {
  const { setValue, watch, control } = useFormContext();
  const otherCosts = watch('otherCosts') || [];
  const [showOtherCosts, setShowOtherCosts] = useState(false);

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

  const onAddCost = (data: AddOtherCostInput) => {
    const newCost: OtherCostType = {
      id: idCounter.current++,
      description: data.description,
      amount: data.amount,
    };

    const updatedCosts = [...otherCosts, newCost];
    setValue('otherCosts', updatedCosts);

    const newTotal = updatedCosts.reduce((sum, cost) => sum + cost.amount, 0);
    setValue('otherCostsTotal', newTotal);

    resetCostForm({
      description: '',
      amount: 0,
    });

    addToast({
      title: 'Other Cost Added',
      description: 'Cost has been added to the quotation',
      color: 'success',
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
            name="workmanship"
            control={control}
            label="Workmanship (₦)"
            placeholder="0.00"
            min={0}
            step={0.01}
            startContent={<span className="text-default-400">₦</span>}
          />
        </div>

        <Divider />

        <Checkbox
          isSelected={showOtherCosts}
          onValueChange={setShowOtherCosts}
          size="sm"
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
                    name="description"
                    control={otherCostControl}
                    label="Description"
                    placeholder="e.g., transportation"
                  />
                </div>
                <div className="col-span-12 md:col-span-4">
                  <NumberInput
                    name="amount"
                    control={otherCostControl}
                    label="Amount (₦)"
                    placeholder="0.00"
                    min={0}
                    step={0.01}
                    startContent={<span className="text-default-400">₦</span>}
                  />
                </div>
              </div>

              <Button
                color="primary"
                variant="flat"
                fullWidth
                className="mt-auto"
                startContent={<Plus size={16} />}
                onPress={() => handleAddCostSubmit(onAddCost)()}
              >
                Add Cost
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
