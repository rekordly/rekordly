'use client';
import { Card, CardBody, Button } from '@heroui/react';
import { Divider } from '@heroui/divider';
import { useForm, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { addToast } from '@heroui/react';

import { TextInput, NumberInput } from '@/components/ui/Input';
import { AddItemFormType, InvoiceItemType } from '@/types/invoices';
import { addItemSchema } from '@/lib/validations/invoices';
import { formatCurrency } from '@/lib/fn';

export function AddItemSection() {
  const { setValue, watch } = useFormContext();
  const items = watch('items') || [];
  const [editingItemId, setEditingItemId] = useState<number | null>(null);

  const {
    control: itemControl,
    handleSubmit: handleAddItemSubmit,
    watch: watchItem,
    reset: resetItemForm,
  } = useForm<AddItemFormType>({
    resolver: zodResolver(addItemSchema),
    defaultValues: {
      itemDescription: '',
    },
    mode: 'onChange',
  });

  const itemQuantity = watchItem('itemQuantity') ?? 0;
  const itemRate = watchItem('itemRate') ?? 0;
  const idCounter = useRef(1);

  // Edit item handler
  const handleEditItem = (item: InvoiceItemType) => {
    setEditingItemId(item.id);
    resetItemForm({
      itemDescription: item.description,
      itemQuantity: item.quantity,
      itemRate: item.rate,
    });
  };

  // Remove item handler
  const removeItem = (id: number) => {
    const updatedItems = items.filter(
      (item: InvoiceItemType) => item.id !== id
    );
    setValue('items', updatedItems, { shouldValidate: true });

    addToast({
      title: 'Item Removed',
      description: 'Item has been removed from the invoice',
      color: 'success',
    });
  };

  // Add or update item handler
  const onAddItem = (data: AddItemFormType) => {
    if (editingItemId !== null) {
      // Update existing item
      const updatedItems = items.map((item: InvoiceItemType) =>
        item.id === editingItemId
          ? {
              ...item,
              description: data.itemDescription,
              quantity: data.itemQuantity,
              rate: data.itemRate,
              amount: data.itemQuantity * data.itemRate,
            }
          : item
      );

      setValue('items', updatedItems, { shouldValidate: true });
      setEditingItemId(null);

      addToast({
        title: 'Item Updated',
        description: 'Item has been updated successfully',
        color: 'success',
      });
    } else {
      // Add new item
      const newItem: InvoiceItemType = {
        id: idCounter.current++,
        description: data.itemDescription,
        quantity: data.itemQuantity,
        rate: data.itemRate,
        amount: data.itemQuantity * data.itemRate,
      };

      setValue('items', [...items, newItem]);

      addToast({
        title: 'Item Added',
        description: 'Item has been added to the invoice',
        color: 'success',
      });
    }

    resetItemForm({
      itemDescription: '',
      itemQuantity: 1,
      itemRate: 0,
    });
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    resetItemForm({
      itemDescription: '',
      itemQuantity: 1,
      itemRate: 0,
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

              <div className="flex gap-2">
                {editingItemId !== null && (
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
                  color="primary"
                  startContent={
                    editingItemId !== null ? (
                      <Edit2 className="w-4 h-4" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )
                  }
                  type="button"
                  variant="flat"
                  onPress={() => handleAddItemSubmit(onAddItem)()}
                >
                  {editingItemId !== null ? 'Update Item' : 'Add Item'}
                </Button>
              </div>
            </div>
          </div>

          {/* Display added items */}
          {items.length > 0 && (
            <>
              <Divider />
              <div className="space-y-2">
                <h5 className="text-xs font-medium text-default-500 uppercase">
                  Added Items ({items.length})
                </h5>
                <div className="space-y-2">
                  {items.map((item: InvoiceItemType) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                        editingItemId === item.id
                          ? 'bg-primary-50 border border-primary'
                          : 'bg-default-50 hover:bg-default-100'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {item.description}
                        </p>
                        <p className="text-xs text-default-500">
                          {item.quantity} × {formatCurrency(item.rate)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-medium">
                          {formatCurrency(item.amount)}
                        </span>
                        <div className="flex gap-1">
                          <Button
                            isIconOnly
                            color={
                              editingItemId === item.id ? 'primary' : 'default'
                            }
                            size="sm"
                            type="button"
                            variant="light"
                            onPress={() => handleEditItem(item)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
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
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
