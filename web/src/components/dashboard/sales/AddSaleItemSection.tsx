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
import { SaleItemBaseSchema } from '@/lib/validations/sales';
import { SaleItemType } from '@/types/sales';

export function AddSaleItemSection() {
  const { setValue, watch } = useFormContext();
  const items: SaleItemType[] = watch('items') || [];
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const {
    control: itemControl,
    handleSubmit: handleAddItemSubmit,
    watch: watchItem,
    reset: resetItemForm,
    formState: { errors: itemErrors },
  } = useForm<Omit<SaleItemType, 'id' | 'amount'>>({
    resolver: zodResolver(
      SaleItemBaseSchema.omit({ id: true, amount: true })
    ) as Resolver<Omit<SaleItemType, 'id' | 'amount'>>,
    defaultValues: {
      itemName: '',
      description: '',
      quantity: 1,
      unitPrice: 0,
    },
    mode: 'onChange',
  });

  const itemQuantity = watchItem('quantity') ?? 0;
  const itemRate = watchItem('unitPrice') ?? 0;
  const idCounter = useRef(1);

  // Generate unique string ID
  const generateId = () =>
    `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Edit item handler
  const handleEditItem = (item: SaleItemType) => {
    setEditingItemId(item.id);
    resetItemForm({
      itemName: item.itemName,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      inventoryItemId: item.inventoryItemId,
      productionId: item.productionId,
      costPrice: item.costPrice,
      profit: item.profit,
    });
  };

  // Remove item handler
  const removeItem = (id: string) => {
    const updatedItems = items.filter((item: SaleItemType) => item.id !== id);
    setValue('items', updatedItems, { shouldValidate: true });

    // Update subtotal
    const newSubtotal = updatedItems.reduce(
      (sum: number, item: SaleItemType) => sum + item.amount,
      0
    );
    setValue('subtotal', newSubtotal, { shouldValidate: true });

    addToast({
      title: 'Item Removed',
      description: 'Item has been removed from the sale',
      color: 'success',
    });
  };

  // Add or update item handler
  const onAddItem = (data: Omit<SaleItemType, 'id' | 'amount'>) => {
    console.log('Form data:', data); // Debug log
    const amount = data.quantity * data.unitPrice;

    if (editingItemId !== null) {
      // Update existing item
      const updatedItems = items.map((item: SaleItemType) =>
        item.id === editingItemId
          ? {
              ...item,
              itemName: data.itemName,
              description: data.description,
              quantity: data.quantity,
              unitPrice: data.unitPrice,
              inventoryItemId: data.inventoryItemId,
              productionId: data.productionId,
              amount,
              costPrice: data.costPrice,
              profit: data.profit,
            }
          : item
      );

      setValue('items', updatedItems, { shouldValidate: true });

      // Update subtotal
      const newSubtotal = updatedItems.reduce(
        (sum: number, item: SaleItemType) => sum + item.amount,
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
      const newItem: SaleItemType = {
        id: generateId(),
        itemName: data.itemName,
        description: data.description,
        quantity: data.quantity,
        unitPrice: data.unitPrice,
        amount,
        inventoryItemId: data.inventoryItemId,
        productionId: data.productionId,
        costPrice: data.costPrice,
        profit: data.profit,
      };

      console.log('Complete item:', newItem);

      const updatedItems = [...items, newItem];
      setValue('items', updatedItems, { shouldValidate: true });

      // Update subtotal
      const newSubtotal = updatedItems.reduce(
        (sum: number, item: SaleItemType) => sum + item.amount,
        0
      );
      setValue('subtotal', newSubtotal, { shouldValidate: true });

      addToast({
        title: 'Item Added',
        description: 'Item has been added to the sale',
        color: 'success',
      });
    }

    // Reset the item form
    resetItemForm({
      itemName: '',
      description: '',
      quantity: 1,
      unitPrice: 0,
      inventoryItemId: undefined,
      productionId: undefined,
    });
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    resetItemForm({
      itemName: '',
      description: '',
      quantity: 1,
      unitPrice: 0,
      inventoryItemId: undefined,
      productionId: undefined,
    });
  };

  // Debug: Log form errors
  console.log('Item form errors:', itemErrors);

  return (
    <Card
      className="w-full rounded-2xl p-3 bg-transparent border border-default-200"
      shadow="none"
    >
      <CardBody className="p-0">
        <div className="space-y-3">
          <h4 className="text-base font-semibold text-foreground">
            Sale Items
          </h4>
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <TextInput
                  control={itemControl}
                  label="Item Name"
                  name="itemName"
                  placeholder="e.g. Web Development Service"
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
                <span className="text-default-500">Amount: </span>
                <span className="font-medium">
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
                  {items.map((item: SaleItemType) => (
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
                          {item.itemName}
                        </p>
                        <p className="text-xs text-default-500">
                          {item.quantity} × {formatCurrency(item.unitPrice)}
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
