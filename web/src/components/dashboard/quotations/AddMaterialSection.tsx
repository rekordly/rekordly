'use client';
import { Card, CardBody, Button } from '@heroui/react';
import { Divider } from '@heroui/divider';
import { useForm, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useRef } from 'react';
import { addToast } from '@heroui/react';
import { TextInput, NumberInput } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/fn';
import { addMaterialItemSchema } from '@/lib/validations/quotations';
import { AddMaterialItemType, MaterialItemType } from '@/types/quotations';

export function AddMaterialSection() {
  const { setValue, watch } = useFormContext();
  const materials = watch('materials') || [];

  const {
    control: materialControl,
    handleSubmit: handleAddMaterialSubmit,
    watch: watchItem,
    reset: resetItemForm,
  } = useForm<AddMaterialItemType>({
    resolver: zodResolver(addMaterialItemSchema),
    defaultValues: {
      name: '',
      // materialQuantity: 1,
      // materialRate: 0,
    },
    mode: 'onChange',
  });

  const materialQuantity = watchItem('qty') ?? 0;
  const materialRate = watchItem('unitPrice') ?? 0;
  const idCounter = useRef(1);

  // add item handler
  const onAddMaterial = (data: AddMaterialItemType) => {
    const newItem: MaterialItemType = {
      id: idCounter.current++,
      name: data.name,
      qty: data.qty,
      unitPrice: data.unitPrice,
      total: data.qty * data.unitPrice,
    };

    // Update the materials in the main form
    setValue('materials', [...materials, newItem]);

    // Reset the item form
    resetItemForm({
      name: '',
      qty: 1,
      unitPrice: 0,
    });

    addToast({
      title: 'Material Added',
      description: 'Material has been added to the invoice',
      color: 'success',
    });
  };

  return (
    <Card className="w-full rounded-3xl p-4 px-2" shadow="none">
      <CardBody>
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-foreground">
            Add Quotation Materials
          </h4>
          <Divider />

          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <TextInput<AddMaterialItemType>
                  name="name"
                  control={materialControl}
                  label="Description"
                  placeholder="e.g. Wire"
                />
              </div>

              <div className="md:col-span-2 grid grid-cols-2 gap-3">
                <div className="col-span-1">
                  <NumberInput<AddMaterialItemType>
                    name="qty"
                    control={materialControl}
                    label="Qty"
                    placeholder="0"
                    min={1}
                  />
                </div>

                <div className="col-span-1">
                  <NumberInput<AddMaterialItemType>
                    name="unitPrice"
                    control={materialControl}
                    label="Rate (₦)"
                    placeholder="0.00"
                    min={0}
                    step={0.01}
                    startContent={
                      <span className="text-default-400 text-sm">₦</span>
                    }
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="text-default-500">Amount: </span>
                <span className="font-semibold text-lg">
                  {formatCurrency(materialQuantity * materialRate)}
                </span>
              </div>

              <Button
                type="button"
                color="primary"
                variant="flat"
                startContent={<Plus className="w-4 h-4" />}
                onPress={() => handleAddMaterialSubmit(onAddMaterial)()}
              >
                Add Material
              </Button>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
