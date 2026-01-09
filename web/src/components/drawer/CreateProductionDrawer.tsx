'use client';

import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  Card,
  CardBody,
  Tabs,
  Tab,
  addToast,
  Button,
  Chip,
  Spinner,
} from '@heroui/react';
import { TextInput, DropdownInput, NumberInput } from '@/components/ui/Input';
import {
  Save,
  Factory,
  X,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle,
  Package,
  Zap,
} from 'lucide-react';

import {
  useProductionStore,
  checkMaterialAvailability,
} from '@/store/productionStore';
import { useRecipeStore } from '@/store/recipeStore';
import { useInventoryStore } from '@/store/inventoryStore';
import {
  Production,
  ProductionFormInput,
  RecipeWithDetails,
} from '@/types/production';
import { CreateProductionSchema } from '@/lib/validations/production';
import {
  BATCH_MULTIPLIER_PRESETS,
  PRODUCTION_STATUS_OPTIONS,
} from '@/config/production-constants';
import { formatCurrency } from '@/lib/fn';

interface CreateProductionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  production?: Production | null;
  preselectedTemplateId?: string; // New prop to preselect template
  preselectedOutputItemId?: string; // New prop to preselect output product
}

export function CreateProductionDrawer({
  isOpen,
  onClose,
  production,
  preselectedTemplateId,
  preselectedOutputItemId,
}: CreateProductionDrawerProps) {
  const { createProduction, updateProduction } = useProductionStore();
  const { allRecipes, fetchRecipeById } = useRecipeStore();
  const { allInventory, fetchInventoryItems } = useInventoryStore();

  const [mode, setMode] = useState<'template' | 'onetime'>('template');
  const [selectedTemplate, setSelectedTemplate] =
    useState<RecipeWithDetails | null>(null);
  const [materialAvailability, setMaterialAvailability] = useState<any[]>([]);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);

  const isEditMode = !!production;
  const isPreselectedMode = !!(
    preselectedTemplateId || preselectedOutputItemId
  );

  // Filter inventory
  const activeTemplates = allRecipes.filter(r => r.isActive);
  const producedItems = allInventory.filter(
    item => item.itemType === 'PRODUCED_ITEM' && item.isActive
  );
  const materialItems = allInventory.filter(
    item =>
      (item.itemType === 'RAW_MATERIAL' || item.itemType === 'CONSUMABLE') &&
      item.isActive
  );

  // Form
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
    watch,
    setValue,
  } = useForm<ProductionFormInput>({
    resolver: zodResolver(CreateProductionSchema) as any,
    defaultValues: {
      recipeId: undefined,
      title: '',
      description: '',
      productionDate: new Date(),
      outputItemName: '',
      outputQuantity: 0,
      outputSellingPrice: 0,
      outputInventoryItemId: '',
      outputImage: '',
      batchMultiplier: 1,
      laborCost: 0,
      overheadCost: 0,
      status: 'COMPLETED',
      notes: '',
      inputs: [],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: 'inputs',
  });

  const recipeId = watch('recipeId');
  const outputItemId = watch('outputInventoryItemId');
  const batchMultiplier = watch('batchMultiplier') || 1;
  const inputs = watch('inputs');
  const laborCost = watch('laborCost');
  const overheadCost = watch('overheadCost');
  const outputQuantity = watch('outputQuantity');

  // Calculate costs - Fixed: Labor cost should NOT be multiplied by batch size
  const materialsCost = inputs.reduce((sum, input) => sum + input.totalCost, 0);
  const totalCost = materialsCost + laborCost + overheadCost;
  const unitCost = outputQuantity > 0 ? totalCost / outputQuantity : 0;

  // Fetch inventory on mount
  useEffect(() => {
    fetchInventoryItems();
  }, []);

  // Set mode based on preselected props
  useEffect(() => {
    if (preselectedTemplateId) {
      setMode('template');
    } else if (preselectedOutputItemId) {
      setMode('onetime');
    }
  }, [preselectedTemplateId, preselectedOutputItemId]);

  // Load template when selected or preselected
  useEffect(() => {
    if (mode === 'template' && recipeId) {
      loadTemplate(recipeId);
    }
  }, [recipeId, mode]);

  // Set preselected values
  useEffect(() => {
    if (isOpen && !production) {
      if (preselectedTemplateId) {
        setValue('recipeId', preselectedTemplateId);
      }
      if (preselectedOutputItemId) {
        setValue('outputInventoryItemId', preselectedOutputItemId);
        const outputItem = producedItems.find(
          i => i.id === preselectedOutputItemId
        );
        if (outputItem) {
          setValue('outputItemName', outputItem.name);
        }
      }
    }
  }, [isOpen, preselectedTemplateId, preselectedOutputItemId, production]);

  // Apply batch multiplier
  useEffect(() => {
    if (selectedTemplate && mode === 'template') {
      applyBatchMultiplier();
    }
  }, [batchMultiplier, selectedTemplate]);

  // Watch for material quantity/unitCost changes and update totalCost
  useEffect(() => {
    inputs.forEach((input, index) => {
      if (input) {
        const total = input.quantity * input.unitCost;
        if (input.totalCost !== total) {
          setValue(`inputs.${index}.totalCost`, total);
        }
      }
    });
  }, [inputs.map(i => `${i?.quantity}-${i?.unitCost}`).join(',')]);

  const loadTemplate = async (templateId: string) => {
    setIsLoadingTemplate(true);
    try {
      const template = await fetchRecipeById(templateId);
      setSelectedTemplate(template);

      // Set output details
      setValue('outputInventoryItemId', template.outputInventoryItemId);
      setValue('outputItemName', template.outputInventory.name);
      setValue('laborCost', template.defaultLaborCost);
      setValue('overheadCost', template.defaultOverheadCost);

      applyBatchMultiplier(template);
    } catch (error) {
      addToast({
        title: 'Error',
        description: 'Failed to load template',
        color: 'danger',
      });
    } finally {
      setIsLoadingTemplate(false);
    }
  };

  const applyBatchMultiplier = (template = selectedTemplate) => {
    if (!template) return;

    const multipliedQuantity = template.outputQuantity * batchMultiplier;
    setValue('outputQuantity', multipliedQuantity);

    const multipliedInputs = template.ingredients.map(ing => ({
      inventoryItemId: ing.inventoryItemId,
      quantity: ing.quantity * batchMultiplier,
      unitCost: ing.inventoryItem.averageCost,
      totalCost: ing.quantity * batchMultiplier * ing.inventoryItem.averageCost,
      notes: ing.notes || '',
    }));

    replace(multipliedInputs);
    checkAvailability(multipliedInputs);
  };

  const checkAvailability = async (materials: any[]) => {
    try {
      const availability = await checkMaterialAvailability(
        materials.map(m => ({
          inventoryItemId: m.inventoryItemId,
          requiredQuantity: m.quantity,
        }))
      );
      setMaterialAvailability(availability);
    } catch (error) {
      console.error('Failed to check availability:', error);
    }
  };

  // Add material (one-time mode) - Auto-populate unit cost
  const handleAddMaterial = () => {
    append({
      inventoryItemId: '',
      quantity: 0,
      unitCost: 0,
      totalCost: 0,
      notes: '',
    });
  };

  // Watch for material selection and auto-populate unit cost
  useEffect(() => {
    inputs.forEach((input, index) => {
      if (input?.inventoryItemId && input.unitCost === 0) {
        const material = materialItems.find(
          i => i.id === input.inventoryItemId
        );
        if (material) {
          setValue(`inputs.${index}.unitCost`, material.averageCost);
        }
      }
    });
  }, [inputs.map(i => i?.inventoryItemId).join(',')]);

  // Reset form
  useEffect(() => {
    if (isOpen && !production) {
      reset({
        recipeId: preselectedTemplateId || undefined,
        title: '',
        description: '',
        productionDate: new Date(),
        outputItemName: '',
        outputQuantity: 0,
        outputSellingPrice: 0,
        outputInventoryItemId: preselectedOutputItemId || '',
        outputImage: '',
        batchMultiplier: 1,
        laborCost: 0,
        overheadCost: 0,
        status: 'COMPLETED',
        notes: '',
        inputs: [],
      });
      if (!preselectedTemplateId && !preselectedOutputItemId) {
        setMode('template');
      }
      setSelectedTemplate(null);
      setMaterialAvailability([]);
    }
  }, [
    isOpen,
    production,
    reset,
    preselectedTemplateId,
    preselectedOutputItemId,
  ]);

  // Submit
  const onSubmit = async (data: ProductionFormInput) => {
    try {
      // Check if all materials are available
      const insufficientMaterials = materialAvailability.filter(
        m => !m.isAvailable
      );
      if (insufficientMaterials.length > 0) {
        const proceed = confirm(
          `Warning: ${insufficientMaterials.length} material(s) have insufficient stock. Proceed anyway?`
        );
        if (!proceed) return;
      }

      const formData = new FormData();

      const payload = {
        recipeId: mode === 'template' ? data.recipeId : undefined,
        title: data.title || undefined,
        description: data.description || undefined,
        productionDate: data.productionDate,
        outputItemName: data.outputItemName,
        outputQuantity: data.outputQuantity,
        outputSellingPrice: data.outputSellingPrice || undefined,
        outputInventoryItemId: data.outputInventoryItemId,
        batchMultiplier: mode === 'template' ? data.batchMultiplier : 1,
        laborCost: data.laborCost,
        overheadCost: data.overheadCost,
        status: data.status,
        notes: data.notes || undefined,
        inputs: data.inputs,
      };

      formData.append('data', JSON.stringify(payload));

      if (isEditMode && production) {
        await updateProduction(production.id, formData);
        addToast({
          title: 'Success',
          description: 'Production updated successfully',
          color: 'success',
        });
      } else {
        await createProduction(formData);
        addToast({
          title: 'Success',
          description: 'Production created successfully',
          color: 'success',
        });
      }
      onClose();
    } catch (error: any) {
      addToast({
        title: 'Error',
        description: error?.message || 'Failed to save production',
        color: 'danger',
      });
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSubmit(onSubmit)(e);
  };

  return (
    <Drawer
      backdrop="blur"
      className="bg-background"
      isOpen={isOpen}
      placement="right"
      size="lg"
      onOpenChange={onClose}
    >
      <DrawerContent>
        <div onSubmit={handleFormSubmit}>
          <DrawerHeader>
            <div className="flex items-center gap-2">
              <Factory className="w-5 h-5 text-blue-600" />
              <h3 className="text-xl font-bold">
                {isEditMode ? 'Edit Production' : 'New Production'}
              </h3>
            </div>
          </DrawerHeader>

          <DrawerBody className="space-y-4">
            {/* Mode Selection - Hidden if preselected */}
            {!isEditMode && !preselectedTemplateId && (
              <Tabs
                selectedKey={mode}
                onSelectionChange={key =>
                  setMode(key as 'template' | 'onetime')
                }
                variant="bordered"
                fullWidth
              >
                <Tab
                  key="template"
                  title={
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      <span>Use Template</span>
                    </div>
                  }
                />
                <Tab
                  key="onetime"
                  title={
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      <span>One-Time Production</span>
                    </div>
                  }
                />
              </Tabs>
            )}

            {/* Template Mode */}
            {mode === 'template' && (
              <>
                {/* Select Template - Hidden if preselected */}
                {!preselectedTemplateId && (
                  <Card
                    className="w-full rounded-2xl p-3 bg-transparent border border-default-200"
                    shadow="none"
                  >
                    <CardBody className="p-0 space-y-3">
                      <h4 className="text-base font-semibold text-foreground">
                        Select Template
                      </h4>

                      {isLoadingTemplate ? (
                        <div className="flex justify-center py-4">
                          <Spinner size="lg" />
                        </div>
                      ) : (
                        <>
                          <DropdownInput
                            isRequired
                            label="Product Template"
                            control={control as any}
                            name="recipeId"
                            items={activeTemplates.map(t => ({
                              value: t.id,
                              label: t.name,
                            }))}
                            placeholder="Choose a template..."
                          />

                          {selectedTemplate && (
                            <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg border border-blue-200 dark:border-blue-800 space-y-2">
                              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                                📋 {selectedTemplate.name}
                              </p>
                              <div className="grid grid-cols-2 gap-2 text-xs text-blue-700 dark:text-blue-300">
                                <div>
                                  Makes: {selectedTemplate.outputQuantity} units
                                </div>
                                <div>
                                  Materials:{' '}
                                  {selectedTemplate.ingredients.length}
                                </div>
                                <div>
                                  Est. Cost: ₦
                                  {selectedTemplate.totalCostPerBatch.toLocaleString()}
                                </div>
                                <div>
                                  Unit Cost: ₦
                                  {selectedTemplate.unitCost.toLocaleString()}
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </CardBody>
                  </Card>
                )}

                {/* Batch Size */}
                {selectedTemplate && (
                  <Card
                    className="w-full rounded-2xl p-3 bg-transparent border border-default-200"
                    shadow="none"
                  >
                    <CardBody className="p-0 space-y-3">
                      <h4 className="text-base font-semibold text-foreground">
                        Batch Size
                      </h4>

                      <NumberInput
                        label="Batch Multiplier"
                        control={control as any}
                        name="batchMultiplier"
                        min={0.1}
                        step={0.5}
                        placeholder="1"
                        description="1x = standard batch, 2x = double batch"
                      />

                      <div className="flex flex-wrap gap-2">
                        {BATCH_MULTIPLIER_PRESETS.map(preset => (
                          <Button
                            key={preset.value}
                            size="sm"
                            variant={
                              batchMultiplier === preset.value
                                ? 'solid'
                                : 'flat'
                            }
                            color={
                              batchMultiplier === preset.value
                                ? 'primary'
                                : 'default'
                            }
                            onPress={() =>
                              setValue('batchMultiplier', preset.value)
                            }
                            type="button"
                          >
                            {preset.label}
                          </Button>
                        ))}
                      </div>

                      <div className="bg-purple-50 dark:bg-purple-950/30 p-3 rounded-lg border border-purple-200 dark:border-purple-800">
                        <p className="text-sm text-purple-900 dark:text-purple-100">
                          Will produce: <strong>{outputQuantity}</strong>{' '}
                          {selectedTemplate.outputInventory.unit}(s)
                        </p>
                      </div>
                    </CardBody>
                  </Card>
                )}
              </>
            )}

            {/* One-Time Mode - Output Product */}
            {mode === 'onetime' && (
              <Card
                className="w-full rounded-2xl p-3 bg-transparent border border-default-200"
                shadow="none"
              >
                <CardBody className="p-0 space-y-3">
                  <h4 className="text-base font-semibold text-foreground">
                    Product Details
                  </h4>

                  {/* Hidden if preselected */}
                  {!preselectedOutputItemId && (
                    <DropdownInput
                      isRequired
                      label="Output Product"
                      control={control as any}
                      name="outputInventoryItemId"
                      items={producedItems.map(item => ({
                        value: item.id,
                        label: `${item.name} (${item.unit})`,
                      }))}
                      placeholder="What are you making?"
                    />
                  )}

                  <TextInput
                    label="Product Name"
                    control={control as any}
                    name="outputItemName"
                    description="Custom name for this production"
                    placeholder="Custom name for this batch"
                  />

                  <NumberInput
                    isRequired
                    label="Output Quantity"
                    control={control as any}
                    name="outputQuantity"
                    min={0.01}
                    step={1}
                    placeholder="How many?"
                  />

                  <NumberInput
                    label="Selling Price (Optional)"
                    control={control as any}
                    name="outputSellingPrice"
                    min={0}
                    step={100}
                    placeholder="0.00"
                    startContent={<span className="text-default-400">₦</span>}
                  />
                </CardBody>
              </Card>
            )}

            {/* Production Details */}
            <Card
              className="w-full rounded-2xl p-3 bg-transparent border border-default-200"
              shadow="none"
            >
              <CardBody className="p-0 space-y-3">
                <h4 className="text-base font-semibold text-foreground">
                  Production Details
                </h4>

                <TextInput
                  label="Production Date"
                  control={control as any}
                  name="productionDate"
                  type="date"
                />

                <TextInput
                  label="Title (Optional)"
                  control={control as any}
                  name="title"
                  placeholder="e.g., Birthday order #123"
                />

                <TextInput
                  label="Description (Optional)"
                  control={control as any}
                  name="description"
                  placeholder="Additional notes about this production..."
                />
              </CardBody>
            </Card>

            {/* Materials */}
            <Card
              className="w-full rounded-2xl p-3 bg-transparent border border-default-200"
              shadow="none"
            >
              <CardBody className="p-0 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-base font-semibold text-foreground">
                      Materials Used
                    </h4>
                    <p className="text-xs text-default-500">
                      {mode === 'template'
                        ? 'Auto-filled from template - you can adjust'
                        : 'Add materials manually'}
                    </p>
                  </div>
                  {mode === 'onetime' && (
                    <Button
                      size="sm"
                      color="primary"
                      variant="flat"
                      startContent={<Plus className="w-4 h-4" />}
                      onPress={handleAddMaterial}
                      type="button"
                    >
                      Add Material
                    </Button>
                  )}
                </div>

                {fields.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <AlertCircle className="w-12 h-12 text-default-300 mb-3" />
                    <p className="text-sm text-default-500">
                      No materials added
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {fields.map((field, index) => {
                      const material = materialItems.find(
                        i => i.id === inputs[index]?.inventoryItemId
                      );
                      const availability = materialAvailability.find(
                        a =>
                          a.inventoryItemId === inputs[index]?.inventoryItemId
                      );

                      return (
                        <div
                          key={field.id}
                          className="p-3 border border-default-200 rounded-lg space-y-3"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {material?.name || `Material #${index + 1}`}
                              </span>
                              {availability && (
                                <Chip
                                  size="sm"
                                  color={
                                    availability.isAvailable
                                      ? 'success'
                                      : 'danger'
                                  }
                                  variant="flat"
                                >
                                  {availability.isAvailable
                                    ? '✓ Available'
                                    : '⚠ Low Stock'}
                                </Chip>
                              )}
                            </div>
                            {mode === 'onetime' && (
                              <button
                                type="button"
                                onClick={() => remove(index)}
                                className="p-1 text-danger-500 hover:bg-danger-50 rounded"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          {mode === 'onetime' && (
                            <DropdownInput
                              isRequired
                              label="Material"
                              control={control as any}
                              name={`inputs.${index}.inventoryItemId`}
                              items={materialItems.map(item => ({
                                value: item.id,
                                label: `${item.name} (${item.unit})`,
                              }))}
                              placeholder="Select material..."
                            />
                          )}

                          <div className="grid grid-cols-3 gap-3">
                            <NumberInput
                              isRequired
                              label="Quantity"
                              control={control as any}
                              name={`inputs.${index}.quantity`}
                              min={0.01}
                              step={0.5}
                              placeholder="0"
                            />

                            <NumberInput
                              isRequired
                              label="Unit Cost"
                              control={control as any}
                              name={`inputs.${index}.unitCost`}
                              min={0}
                              step={0.01}
                              placeholder="0"
                              startContent={<span className="text-xs">₦</span>}
                              isDisabled
                            />

                            <div>
                              <label className="text-xs text-default-500">
                                Total
                              </label>
                              <div className="mt-2">
                                <p className="text-sm font-bold">
                                  ₦
                                  {inputs[index]?.totalCost?.toLocaleString() ||
                                    0}
                                </p>
                              </div>
                            </div>
                          </div>

                          {material &&
                            availability &&
                            !availability.isAvailable && (
                              <div className="bg-danger-50 dark:bg-danger-950/30 px-3 py-2 rounded border border-danger-200">
                                <p className="text-xs text-danger-700 dark:text-danger-300">
                                  ⚠ Available: {availability.availableQuantity}{' '}
                                  {material.unit} | Short:{' '}
                                  {availability.shortfall} {material.unit}
                                </p>
                              </div>
                            )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {fields.length > 0 && (
                  <div className="pt-3 border-t border-default-200">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">
                        Materials Total:
                      </span>
                      <span className="text-lg font-bold text-primary">
                        ₦{materialsCost.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Additional Costs */}
            <Card
              className="w-full rounded-2xl p-3 bg-transparent border border-default-200"
              shadow="none"
            >
              <CardBody className="p-0 space-y-3">
                <h4 className="text-base font-semibold text-foreground">
                  Additional Costs
                </h4>

                <NumberInput
                  label="Labor Cost"
                  control={control as any}
                  name="laborCost"
                  min={0}
                  step={100}
                  placeholder="0.00"
                  startContent={<span className="text-default-400">₦</span>}
                  description="Total labor cost (not multiplied by batch size)"
                />

                <NumberInput
                  label="Overhead Cost"
                  control={control as any}
                  name="overheadCost"
                  min={0}
                  step={100}
                  placeholder="0.00"
                  startContent={<span className="text-default-400">₦</span>}
                />
              </CardBody>
            </Card>

            {/* Cost Summary */}
            {fields.length > 0 && outputQuantity > 0 && (
              <Card
                className="bg-linear-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200 dark:border-green-800"
                shadow="none"
              >
                <CardBody className="p-3 space-y-2">
                  <h4 className="text-base font-semibold flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    Cost Summary
                  </h4>

                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-default-600">Materials:</span>
                      <span className="font-medium">
                        {formatCurrency(materialsCost)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-default-600">Labor:</span>
                      <span className="font-medium">
                        ₦{laborCost.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-default-600">Overhead:</span>
                      <span className="font-medium">
                        ₦{overheadCost.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-px bg-default-200 my-2" />
                    <div className="flex justify-between text-base font-bold">
                      <span>Total Cost:</span>
                      <span className="text-green-600">
                        ₦{totalCost.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-default-600">Unit Cost:</span>
                      <span className="font-semibold text-primary">
                        ₦{unitCost.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </CardBody>
              </Card>
            )}

            {/* Status & Notes */}
            <Card
              className="w-full rounded-2xl p-3 bg-transparent border border-default-200"
              shadow="none"
            >
              <CardBody className="p-0 space-y-3">
                <DropdownInput
                  label="Status"
                  control={control as any}
                  name="status"
                  items={PRODUCTION_STATUS_OPTIONS.map(s => ({
                    value: s.value,
                    label: s.label,
                  }))}
                />

                <TextInput
                  label="Notes (Optional)"
                  control={control as any}
                  name="notes"
                  placeholder="Any additional notes..."
                />
              </CardBody>
            </Card>
          </DrawerBody>

          <DrawerFooter className="flex justify-between gap-2">
            <Button
              color="default"
              variant="flat"
              onPress={onClose}
              type="button"
            >
              Cancel
            </Button>
            <Button
              color="primary"
              startContent={<Save className="w-4 h-4" />}
              onClick={handleFormSubmit}
              isLoading={isSubmitting}
              isDisabled={
                fields.length === 0 || !outputItemId || outputQuantity <= 0
              }
            >
              {isEditMode ? 'Update Production' : 'Start Production'}
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
