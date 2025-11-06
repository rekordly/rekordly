'use client';
import { Card, CardBody, Button } from '@heroui/react';
import { Divider } from '@heroui/divider';
import { useForm, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useRef } from 'react';
import { addToast } from '@heroui/react';

import { TextInput, NumberInput } from '@/components/ui/Input';
import { AddItemFormType, InvoiceItemType } from '@/types/invoices';
import { addItemSchema } from '@/lib/validations/invoices';
import { formatCurrency } from '@/lib/fn';

export function AddItemSection() {
  const { setValue, watch } = useFormContext();
  const items = watch('items') || [];

  const {
    control: itemControl,
    handleSubmit: handleAddItemSubmit,
    watch: watchItem,
    reset: resetItemForm,
  } = useForm<AddItemFormType>({
    resolver: zodResolver(addItemSchema),
    defaultValues: {
      itemDescription: '',
      // itemQuantity: 1,
      // itemRate: 0,
    },
    mode: 'onChange',
  });

  const itemQuantity = watchItem('itemQuantity') ?? 0;
  const itemRate = watchItem('itemRate') ?? 0;
  const idCounter = useRef(1);

  // add item handler
  const onAddItem = (data: AddItemFormType) => {
    const newItem: InvoiceItemType = {
      id: idCounter.current++,
      description: data.itemDescription,
      quantity: data.itemQuantity,
      rate: data.itemRate,
      amount: data.itemQuantity * data.itemRate,
    };

    setValue('items', [...items, newItem]);

    resetItemForm({
      itemDescription: '',
      itemQuantity: 1,
      itemRate: 0,
    });

    addToast({
      title: 'Item Added',
      description: 'Item has been added to the invoice',
      color: 'success',
    });
  };

  return (
    <Card className="w-full rounded-3xl p-4 px-2" shadow="none">
      <CardBody>
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-foreground">
            Add Invoice Items
          </h4>
          <Divider />

          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <TextInput<AddItemFormType>
                  control={itemControl}
                  label="Description"
                  name="itemDescription"
                  placeholder="Item description"
                />
              </div>

              <div className="md:col-span-2 grid grid-cols-2 gap-3">
                <div className="col-span-1">
                  <NumberInput<AddItemFormType>
                    control={itemControl}
                    label="Qty"
                    min={1}
                    name="itemQuantity"
                    placeholder="0"
                  />
                </div>

                <div className="col-span-1">
                  <NumberInput<AddItemFormType>
                    control={itemControl}
                    label="Rate (₦)"
                    min={0}
                    name="itemRate"
                    placeholder="0.00"
                    startContent={
                      <span className="text-default-400 text-sm">₦</span>
                    }
                    step={0.01}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="text-default-500">Amount: </span>
                <span className="font-semibold text-lg">
                  {formatCurrency(itemQuantity * itemRate)}
                </span>
              </div>

              <Button
                color="primary"
                startContent={<Plus className="w-4 h-4" />}
                type="button"
                variant="flat"
                onPress={() => handleAddItemSubmit(onAddItem)()}
              >
                Add Item
              </Button>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
