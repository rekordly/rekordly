'use client';

import { Card, CardBody, Button } from '@heroui/react';
import { Divider } from '@heroui/divider';
import { useForm, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';

import type { Resolver } from 'react-hook-form';

import { addToast } from '@heroui/react';

import { TextInput, NumberInput } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/fn';
import { PurchaseItemSchema } from '@/lib/validations/purchases';
import { PurchaseItemType } from '@/types/purchases';

export function AddPurchaseItemSection() {
  const { setValue, watch } = useFormContext();
  const items: PurchaseItemType[] = watch('items') || [];
  const [editingItemId, setEditingItemId] = useState<number | null>(null);

  const {
    control: itemControl,
    handleSubmit: handleAddItemSubmit,
    watch: watchItem,
    reset: resetItemForm,
  } = useForm<Omit<PurchaseItemType, 'id' | 'total'>>({
    resolver: zodResolver(
      PurchaseItemSchema.omit({ id: true, total: true })
    ) as Resolver<Omit<PurchaseItemType, 'id' | 'total'>>,
    defaultValues: {
      description: '',
      quantity: undefined,
      unitPrice: undefined,
    },
    mode: 'onChange',
  });

  const itemQuantity = watchItem('quantity') ?? 0;
  const itemUnitPrice = watchItem('unitPrice') ?? 0;
  const idCounter = useRef(1);

  // Edit item handler
  const handleEditItem = (item: PurchaseItemType) => {
    setEditingItemId(item.id);
    resetItemForm({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    });
  };

  // Remove item handler
  const removeItem = (id: number) => {
    const updatedItems = items.filter(
      (item: PurchaseItemType) => item.id !== id
    );
    setValue('items', updatedItems, { shouldValidate: true });

    // Update subtotal
    const newSubtotal = updatedItems.reduce(
      (sum: number, item: PurchaseItemType) => sum + item.total,
      0
    );
    setValue('subtotal', newSubtotal, { shouldValidate: true });

    addToast({
      title: 'Item Removed',
      description: 'Item has been removed from purchase',
      color: 'success',
    });
  };

  // Add or update item handler
  const onAddItem = (data: Omit<PurchaseItemType, 'id' | 'total'>) => {
    if (editingItemId !== null) {
      // Update existing item
      const updatedItems = items.map((item: PurchaseItemType) =>
        item.id === editingItemId
          ? {
              ...item,
              description: data.description,
              quantity: data.quantity,
              unitPrice: data.unitPrice,
              total: data.quantity * data.unitPrice,
            }
          : item
      );

      setValue('items', updatedItems, { shouldValidate: true });

      // Update subtotal
      const newSubtotal = updatedItems.reduce(
        (sum: number, item: PurchaseItemType) => sum + item.total,
        0
      );
      setValue('subtotal', newSubtotal, { shouldValidate: true });

      setEditingItemId(null);

      addToast({
        title: 'Item Updated',
        description: 'Item has been updated successfully',
        color: 'success',
      });
    } else {
      // Add new item
      const newItem: PurchaseItemType = {
        id: idCounter.current++,
        description: data.description,
        quantity: data.quantity,
        unitPrice: data.unitPrice,
        total: data.quantity * data.unitPrice,
      };

      const updatedItems = [...items, newItem];
      setValue('items', updatedItems, { shouldValidate: true });

      // Update subtotal
      const newSubtotal = updatedItems.reduce(
        (sum: number, item: PurchaseItemType) => sum + item.total,
        0
      );
      setValue('subtotal', newSubtotal, { shouldValidate: true });

      addToast({
        title: 'Item Added',
        description: 'Item has been added to purchase',
        color: 'success',
      });
    }

    // Reset item form
    resetItemForm({
      description: '',
      quantity: undefined,
      unitPrice: undefined,
    });
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    resetItemForm({
      description: '',
      quantity: undefined,
      unitPrice: undefined,
    });
  };

  return (
    <Card className="w-full rounded-3xl p-4 px-2" shadow="none">
      <CardBody>
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-lg font-semibold">Purchase Items</h3>
          </div>

          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <TextInput
                  control={itemControl}
                  label="Item Description"
                  name="description"
                  placeholder="e.g., Office Chairs, Laptop, Raw Materials"
                />
              </div>

              <div className="md:col-span-2 grid grid-cols-2 gap-3">
                <div className="col-span-1">
                  <NumberInput
                    control={itemControl}
                    label="Quantity"
                    min={1}
                    name="quantity"
                    placeholder="0"
                  />
                </div>

                <div className="col-span-1">
                  <NumberInput
                    control={itemControl}
                    label="Unit Price (₦)"
                    min={0}
                    name="unitPrice"
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
                <span className="text-default-500">Total: </span>
                <span className="font-medium">
                  {formatCurrency(itemQuantity * itemUnitPrice)}
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
                  {items.map((item: PurchaseItemType) => (
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
                          {item.quantity} × {formatCurrency(item.unitPrice)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-medium">
                          {formatCurrency(item.total)}
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
