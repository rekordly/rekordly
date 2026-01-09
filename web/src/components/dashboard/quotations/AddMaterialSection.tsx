'use client';
import { Card, CardBody, Button } from '@heroui/react';
import { Divider } from '@heroui/divider';
import { useForm, useFormContext, Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { addToast } from '@heroui/react';
import { z } from 'zod';

import { TextInput, NumberInput, DropdownInput } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/fn';
import { UNIT_OPTIONS } from '@/config/constant';
import { QuotationLineItemType as LineItem } from '@/types/quotations';
import { QuotationLineItemSchema as LineItemSchema } from '@/lib/validations/quotations';

// Define the line item type based on schema
const TYPE_OPTIONS = [
  { value: 'MATERIAL', label: 'Material' },
  { value: 'SERVICE', label: 'Service' },
  { value: 'PRODUCT', label: 'Product' },
  { value: 'OTHER', label: 'Other' },
];

export function AddMaterialSection() {
  const { setValue, watch } = useFormContext();
  const lineItems = watch('lineItems') || [];
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const {
    control: materialControl,
    handleSubmit: handleAddMaterialSubmit,
    watch: watchItem,
    reset: resetItemForm,
  } = useForm<LineItem>({
    resolver: zodResolver(LineItemSchema) as Resolver<LineItem>,
    defaultValues: {
      type: 'MATERIAL',
      name: '',
      description: '',
      quantity: 1,
      unit: '',
      unitPrice: 0,
      amount: 0,
      inventoryItemId: '',
    },
    mode: 'onChange',
  });

  const materialQuantity = watchItem('quantity') ?? 0;
  const materialRate = watchItem('unitPrice') ?? 0;
  const idCounter = useRef(1);

  // Edit material handler
  const handleEditMaterial = (item: LineItem) => {
    setEditingItemId(item.id ?? null);
    resetItemForm({
      type: item.type,
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      amount: item.amount,
      inventoryItemId: '',
    });
  };

  // Remove material handler
  const removeMaterial = (id: string) => {
    const updatedItems = lineItems.filter((item: LineItem) => item.id !== id);
    setValue('lineItems', updatedItems, { shouldValidate: true });

    // Recalculate subtotal
    const newSubtotal = updatedItems.reduce(
      (sum: number, item: LineItem) => sum + item.amount,
      0
    );
    setValue('subtotal', newSubtotal, { shouldValidate: true });

    addToast({
      title: 'Item Removed',
      description: 'Item has been removed from the quotation',
      color: 'success',
    });
  };

  // Add or update material handler
  const onAddMaterial = (data: LineItem) => {
    const amount = data.quantity * data.unitPrice;

    if (editingItemId !== null) {
      // Update existing material
      const updatedItems = lineItems.map((item: LineItem) =>
        item.id === editingItemId
          ? {
              ...item,
              type: data.type,
              name: data.name,
              description: data.description,
              quantity: data.quantity,
              unit: data.unit,
              unitPrice: data.unitPrice,
              amount: amount,
              inventoryItemId: '',
            }
          : item
      );

      setValue('lineItems', updatedItems, { shouldValidate: true });

      // Recalculate subtotal
      const newSubtotal = updatedItems.reduce(
        (sum: number, item: LineItem) => sum + item.amount,
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
      // Add new material
      const newItem: LineItem = {
        id: `temp-${Date.now()}-${idCounter.current++}`,
        type: data.type,
        name: data.name,
        description: data.description || '',
        quantity: data.quantity,
        unit: data.unit,
        unitPrice: data.unitPrice,
        amount: amount,
        inventoryItemId: '',
      };

      const updatedItems = [...lineItems, newItem];
      setValue('lineItems', updatedItems, { shouldValidate: true });

      // Recalculate subtotal
      const newSubtotal = updatedItems.reduce(
        (sum: number, item: LineItem) => sum + item.amount,
        0
      );
      setValue('subtotal', newSubtotal, { shouldValidate: true });

      addToast({
        title: 'Item Added',
        description: 'Item has been added to the quotation',
        color: 'success',
      });
    }

    resetItemForm({
      type: 'MATERIAL',
      name: '',
      description: '',
      quantity: 1,
      unit: '',
      unitPrice: 0,
      amount: 0,
      inventoryItemId: '',
    });
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    resetItemForm({
      type: 'MATERIAL',
      name: '',
      description: '',
      quantity: 1,
      unit: '',
      unitPrice: 0,
      amount: 0,
      inventoryItemId: '',
    });
  };

  return (
    <Card
      className="w-full rounded-2xl p-3 bg-transparent border border-default-200"
      shadow="none"
    >
      <CardBody className="p-0">
        <div className="space-y-4">
          <h4 className="text-base font-semibold text-foreground">
            Add Quotation Items
          </h4>
          <Divider />

          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <DropdownInput
                  control={materialControl as any}
                  isRequired
                  items={TYPE_OPTIONS}
                  label="Type"
                  name="type"
                  placeholder="Select type"
                />
              </div>

              <div className="md:col-span-2">
                <TextInput<LineItem>
                  control={materialControl}
                  label="Item Name"
                  name="name"
                  placeholder="e.g. Wire"
                  isRequired
                />
              </div>

              <div className="md:col-span-2">
                <TextInput<LineItem>
                  control={materialControl}
                  label="Description"
                  name="description"
                  placeholder=""
                />
              </div>

              <div className="md:col-span-2 grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <NumberInput<LineItem>
                    control={materialControl}
                    label="Qty"
                    min={1}
                    name="quantity"
                    placeholder="0"
                  />
                </div>

                <div className="col-span-1">
                  <DropdownInput
                    control={materialControl as any}
                    isRequired
                    items={UNIT_OPTIONS}
                    label="Unit"
                    name="unit"
                    placeholder="Select unit"
                  />
                </div>

                <div className="col-span-1">
                  <NumberInput<LineItem>
                    control={materialControl}
                    label="Rate (₦)"
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
                <span className="font-semibold text-lg">
                  {formatCurrency(materialQuantity * materialRate)}
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
                  onPress={() => handleAddMaterialSubmit(onAddMaterial)()}
                >
                  {editingItemId !== null ? 'Update Item' : 'Add Item'}
                </Button>
              </div>
            </div>
          </div>

          {/* Display added materials */}
          {lineItems.length > 0 && (
            <>
              <Divider />
              <div className="space-y-2">
                <h5 className="text-xs font-medium text-default-500 uppercase">
                  Added Items ({lineItems.length})
                </h5>
                <div className="space-y-2">
                  {lineItems.map((item: LineItem) => (
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
                          {item.name}
                        </p>
                        <p className="text-xs text-default-500">
                          {item.quantity} {item.unit} ×{' '}
                          {formatCurrency(item.unitPrice)}
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
                            onPress={() => handleEditMaterial(item)}
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
                              item.id !== undefined && removeMaterial(item.id)
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
        </div>
      </CardBody>
    </Card>
  );
}
