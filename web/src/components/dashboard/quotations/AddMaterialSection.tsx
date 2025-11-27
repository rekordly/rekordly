'use client';
import { Card, CardBody, Button } from '@heroui/react';
import { Divider } from '@heroui/divider';
import { useForm, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { addToast } from '@heroui/react';

import { TextInput, NumberInput } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/fn';
import { addMaterialItemSchema } from '@/lib/validations/quotations';
import { AddMaterialItemType, MaterialItemType } from '@/types/quotations';

export function AddMaterialSection() {
  const { setValue, watch } = useFormContext();
  const materials = watch('materials') || [];
  const [editingMaterialId, setEditingMaterialId] = useState<number | null>(
    null
  );

  const {
    control: materialControl,
    handleSubmit: handleAddMaterialSubmit,
    watch: watchItem,
    reset: resetItemForm,
  } = useForm<AddMaterialItemType>({
    resolver: zodResolver(addMaterialItemSchema),
    defaultValues: {
      name: '',
    },
    mode: 'onChange',
  });

  const materialQuantity = watchItem('qty') ?? 0;
  const materialRate = watchItem('unitPrice') ?? 0;
  const idCounter = useRef(1);

  // Edit material handler
  const handleEditMaterial = (material: MaterialItemType) => {
    setEditingMaterialId(material.id);
    resetItemForm({
      name: material.name,
      qty: material.qty,
      unitPrice: material.unitPrice,
    });
  };

  // Remove material handler
  const removeMaterial = (id: number) => {
    const updatedMaterials = materials.filter(
      (material: MaterialItemType) => material.id !== id
    );
    setValue('materials', updatedMaterials, { shouldValidate: true });

    addToast({
      title: 'Material Removed',
      description: 'Material has been removed from the quotation',
      color: 'success',
    });
  };

  // Add or update material handler
  const onAddMaterial = (data: AddMaterialItemType) => {
    if (editingMaterialId !== null) {
      // Update existing material
      const updatedMaterials = materials.map((material: MaterialItemType) =>
        material.id === editingMaterialId
          ? {
              ...material,
              name: data.name,
              qty: data.qty,
              unitPrice: data.unitPrice,
              total: data.qty * data.unitPrice,
            }
          : material
      );

      setValue('materials', updatedMaterials, { shouldValidate: true });
      setEditingMaterialId(null);

      addToast({
        title: 'Material Updated',
        description: 'Material has been updated successfully',
        color: 'success',
      });
    } else {
      // Add new material
      const newItem: MaterialItemType = {
        id: idCounter.current++,
        name: data.name,
        qty: data.qty,
        unitPrice: data.unitPrice,
        total: data.qty * data.unitPrice,
      };

      setValue('materials', [...materials, newItem]);

      addToast({
        title: 'Material Added',
        description: 'Material has been added to the quotation',
        color: 'success',
      });
    }

    resetItemForm({
      name: '',
      qty: 1,
      unitPrice: 0,
    });
  };

  const handleCancelEdit = () => {
    setEditingMaterialId(null);
    resetItemForm({
      name: '',
      qty: 1,
      unitPrice: 0,
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
                  control={materialControl}
                  label="Description"
                  name="name"
                  placeholder="e.g. Wire"
                />
              </div>

              <div className="md:col-span-2 grid grid-cols-2 gap-3">
                <div className="col-span-1">
                  <NumberInput<AddMaterialItemType>
                    control={materialControl}
                    label="Qty"
                    min={1}
                    name="qty"
                    placeholder="0"
                  />
                </div>

                <div className="col-span-1">
                  <NumberInput<AddMaterialItemType>
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
                {editingMaterialId !== null && (
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
                    editingMaterialId !== null ? (
                      <Edit2 className="w-4 h-4" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )
                  }
                  type="button"
                  variant="flat"
                  onPress={() => handleAddMaterialSubmit(onAddMaterial)()}
                >
                  {editingMaterialId !== null
                    ? 'Update Material'
                    : 'Add Material'}
                </Button>
              </div>
            </div>
          </div>

          {/* Display added materials */}
          {materials.length > 0 && (
            <>
              <Divider />
              <div className="space-y-2">
                <h5 className="text-xs font-medium text-default-500 uppercase">
                  Added Materials ({materials.length})
                </h5>
                <div className="space-y-2">
                  {materials.map((material: MaterialItemType) => (
                    <div
                      key={material.id}
                      className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                        editingMaterialId === material.id
                          ? 'bg-primary-50 border border-primary'
                          : 'bg-default-50 hover:bg-default-100'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {material.name}
                        </p>
                        <p className="text-xs text-default-500">
                          {material.qty} × {formatCurrency(material.unitPrice)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-sm font-medium">
                          {formatCurrency(material.total)}
                        </span>
                        <div className="flex gap-1">
                          <Button
                            isIconOnly
                            color={
                              editingMaterialId === material.id
                                ? 'primary'
                                : 'default'
                            }
                            size="sm"
                            type="button"
                            variant="light"
                            onPress={() => handleEditMaterial(material)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            isIconOnly
                            color="danger"
                            size="sm"
                            type="button"
                            variant="light"
                            onPress={() => removeMaterial(material.id)}
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
