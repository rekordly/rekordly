'use client';

import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  Card,
  CardBody,
  Switch,
  addToast,
  Button,
} from '@heroui/react';
import { TextInput, DropdownInput, NumberInput } from '@/components/ui/Input';
import {
  Save,
  Package,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

import { useRecipeStore } from '@/store/recipeStore';
import { useInventoryStore } from '@/store/inventoryStore';
import { ProductRecipe, RecipeFormInput } from '@/types/production';
import { CreateRecipeSchema } from '@/lib/validations/production';
import { TEMPLATE_CATEGORIES } from '@/config/production-constants';

interface CreateProductTemplateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  template?: ProductRecipe | null;
}

export function CreateProductTemplateDrawer({
  isOpen,
  onClose,
  template,
}: CreateProductTemplateDrawerProps) {
  const { createRecipe, updateRecipe } = useRecipeStore();
  const { allInventory, fetchInventoryItems } = useInventoryStore();

  const isEditMode = !!template;

  // Filter inventory for products (output) and materials (ingredients)
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
  } = useForm<RecipeFormInput>({
    resolver: zodResolver(CreateRecipeSchema) as any,
    defaultValues: {
      name: '',
      description: '',
      category: '',
      outputInventoryItemId: '',
      outputQuantity: 1,
      defaultLaborCost: 0,
      defaultOverheadCost: 0,
      isActive: true,
      ingredients: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'ingredients',
  });

  const outputItemId = watch('outputInventoryItemId');
  const outputQuantity = watch('outputQuantity');
  const ingredients = watch('ingredients');
  const laborCost = watch('defaultLaborCost');
  const overheadCost = watch('defaultOverheadCost');

  // Calculate costs
  const totalMaterialCost = ingredients.reduce((sum, ing) => {
    const item = materialItems.find(i => i.id === ing.inventoryItemId);
    if (!item) return sum;
    return sum + ing.quantity * item.averageCost;
  }, 0);

  const totalCostPerBatch = totalMaterialCost + laborCost + overheadCost;
  const unitCost = outputQuantity > 0 ? totalCostPerBatch / outputQuantity : 0;

  // Fetch inventory on mount
  useEffect(() => {
    fetchInventoryItems();
  }, []);

  // Add ingredient
  const handleAddIngredient = () => {
    append({
      inventoryItemId: '',
      quantity: 0,
      notes: '',
    });
  };

  // Reset form
  useEffect(() => {
    if (isOpen && template) {
      reset({
        name: template.name,
        description: template.description || '',
        category: template.category || '',
        outputInventoryItemId: template.outputInventoryItemId,
        outputQuantity: template.outputQuantity,
        defaultLaborCost: template.defaultLaborCost,
        defaultOverheadCost: template.defaultOverheadCost,
        isActive: template.isActive,
        ingredients:
          template.ingredients?.map(ing => ({
            inventoryItemId: ing.inventoryItemId,
            quantity: ing.quantity,
            notes: ing.notes || '',
          })) || [],
      });
    } else if (isOpen && !template) {
      reset({
        name: '',
        description: '',
        category: '',
        outputInventoryItemId: '',
        outputQuantity: 1,
        defaultLaborCost: 0,
        defaultOverheadCost: 0,
        isActive: true,
        ingredients: [],
      });
    }
  }, [isOpen, template, reset]);

  // Submit
  const onSubmit = async (data: any) => {
    try {
      const payload = {
        name: data.name,
        description: data.description || undefined,
        category: data.category || undefined,
        outputInventoryItemId: data.outputInventoryItemId,
        outputQuantity: data.outputQuantity,
        defaultLaborCost: data.defaultLaborCost,
        defaultOverheadCost: data.defaultOverheadCost,
        isActive: data.isActive,
        ingredients: data.ingredients,
      };

      if (isEditMode && template) {
        await updateRecipe(template.id, payload);
        addToast({
          title: 'Success',
          description: 'Product template updated successfully',
          color: 'success',
        });
      } else {
        await createRecipe(payload);
        addToast({
          title: 'Success',
          description: 'Product template created successfully',
          color: 'success',
        });
      }
      onClose();
    } catch (error: any) {
      addToast({
        title: 'Error',
        description: error?.message || 'Failed to save product template',
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
        <form onSubmit={handleFormSubmit}>
          <DrawerHeader>
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-600" />
              <h3 className="text-xl font-bold">
                {isEditMode
                  ? 'Edit Product Template'
                  : 'Create New Product Template'}
              </h3>
            </div>
            <p className="text-sm text-default-500 mt-1">
              Templates help you produce the same items quickly and consistently
            </p>
          </DrawerHeader>

          <DrawerBody className="space-y-4">
            {/* Basic Information */}
            <Card
              className="w-full rounded-2xl p-3 bg-transparent border border-default-200"
              shadow="none"
            >
              <CardBody className="p-0 space-y-3">
                <h4 className="text-base font-semibold text-foreground">
                  Basic Information
                </h4>

                <TextInput
                  isRequired
                  label="Template Name"
                  control={control as any}
                  name="name"
                  placeholder="e.g., Chocolate Cupcake, Leather Boot Model A"
                />

                <TextInput
                  label="Description"
                  control={control as any}
                  name="description"
                  placeholder="What makes this product special..."
                />

                <DropdownInput
                  label="Category"
                  control={control as any}
                  name="category"
                  items={TEMPLATE_CATEGORIES as any}
                  placeholder="Select category"
                />

                <div className="flex items-center justify-between pt-2 border-t border-default-200">
                  <div>
                    <label className="text-sm font-medium text-foreground">
                      Active Status
                    </label>
                    <p className="text-xs text-default-500">
                      {"Inactive templates won't appear in production"}
                    </p>
                  </div>
                  <Controller
                    control={control}
                    name="isActive"
                    render={({ field }) => (
                      <Switch
                        isSelected={field.value}
                        onValueChange={field.onChange}
                        size="sm"
                      >
                        {field.value ? 'Active' : 'Inactive'}
                      </Switch>
                    )}
                  />
                </div>
              </CardBody>
            </Card>

            {/* Output Product */}
            <Card
              className="w-full rounded-2xl p-3 bg-transparent border border-default-200"
              shadow="none"
            >
              <CardBody className="p-0 space-y-3">
                <h4 className="text-base font-semibold text-foreground">
                  What This Template Produces
                </h4>

                <DropdownInput
                  isRequired
                  label="Output Product"
                  control={control as any}
                  name="outputInventoryItemId"
                  items={producedItems.map(item => ({
                    value: item.id,
                    label: `${item.name} (${item.unit})`,
                  }))}
                  placeholder="Select product..."
                />

                <NumberInput
                  isRequired
                  label="Quantity Per Batch"
                  control={control as any}
                  name="outputQuantity"
                  min={0.01}
                  step={1}
                  placeholder="How many units does this template make?"
                  description="e.g., 12 cupcakes, 1 pair of shoes"
                />

                {outputItemId && (
                  <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-blue-900 dark:text-blue-100">
                      💡 Each production will make {outputQuantity}{' '}
                      {producedItems.find(i => i.id === outputItemId)?.unit ||
                        'unit'}
                      (s) by default
                    </p>
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Ingredients/Materials */}
            <Card
              className="w-full rounded-2xl p-3 bg-transparent border border-default-200"
              shadow="none"
            >
              <CardBody className="p-0 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-base font-semibold text-foreground">
                      Materials Needed
                    </h4>
                    <p className="text-xs text-default-500">
                      What goes into making this product
                    </p>
                  </div>
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    startContent={<Plus className="w-4 h-4" />}
                    onPress={handleAddIngredient}
                    type="button"
                  >
                    Add Material
                  </Button>
                </div>

                {fields.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <AlertCircle className="w-12 h-12 text-default-300 mb-3" />
                    <p className="text-sm text-default-500">
                      No materials added yet
                    </p>
                    <p className="text-xs text-default-400 mt-1">
                      {`Click "Add Material" to get started`}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {fields.map((field, index) => {
                      const selectedItem = materialItems.find(
                        i => i.id === ingredients[index]?.inventoryItemId
                      );
                      const quantity = ingredients[index]?.quantity || 0;
                      const cost = selectedItem
                        ? quantity * selectedItem.averageCost
                        : 0;

                      return (
                        <div
                          key={field.id}
                          className="p-3 border border-default-200 rounded-lg space-y-3"
                        >
                          <div className="flex items-start justify-between">
                            <span className="text-sm font-medium text-foreground">
                              Material #{index + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => remove(index)}
                              className="p-1 text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-950/30 rounded transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <DropdownInput
                            isRequired
                            label="Material"
                            control={control as any}
                            name={`ingredients.${index}.inventoryItemId`}
                            items={materialItems.map(item => ({
                              value: item.id,
                              label: `${item.name} (${item.unit})`,
                            }))}
                            placeholder="Select material..."
                          />

                          <div className="grid grid-cols-2 gap-3">
                            <NumberInput
                              isRequired
                              label="Quantity"
                              control={control as any}
                              name={`ingredients.${index}.quantity`}
                              min={0.01}
                              step={0.01}
                              placeholder="0"
                            />

                            {selectedItem && (
                              <div>
                                <label className="text-xs text-default-500">
                                  Cost
                                </label>
                                <div className="mt-2">
                                  <p className="text-sm font-medium">
                                    ₦{cost.toLocaleString()}
                                  </p>
                                  <p className="text-xs text-default-400">
                                    @ ₦
                                    {selectedItem.averageCost.toLocaleString()}/
                                    {selectedItem.unit}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>

                          <TextInput
                            label="Notes (Optional)"
                            control={control as any}
                            name={`ingredients.${index}.notes`}
                            placeholder="e.g., Use premium quality"
                          />

                          {selectedItem &&
                            selectedItem.quantityOnHand < quantity && (
                              <div className="bg-warning-50 dark:bg-warning-950/30 px-3 py-2 rounded-lg border border-warning-200 dark:border-warning-800">
                                <p className="text-xs text-warning-700 dark:text-warning-300">
                                  ⚠️ Current stock:{' '}
                                  {selectedItem.quantityOnHand}{' '}
                                  {selectedItem.unit}
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
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-foreground">
                        Total Materials Cost:
                      </span>
                      <span className="text-lg font-bold text-primary">
                        ₦{totalMaterialCost.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Default Costs */}
            <Card
              className="w-full rounded-2xl p-3 bg-transparent border border-default-200"
              shadow="none"
            >
              <CardBody className="p-0 space-y-3">
                <h4 className="text-base font-semibold text-foreground">
                  Default Additional Costs
                </h4>
                <p className="text-xs text-default-500">
                  These can be adjusted during each production
                </p>

                <NumberInput
                  label="Labor Cost"
                  control={control as any}
                  name="defaultLaborCost"
                  min={0}
                  step={100}
                  placeholder="0.00"
                  startContent={<span className="text-default-400">₦</span>}
                  description="Wages, salaries for this production"
                />

                <NumberInput
                  label="Overhead Cost"
                  control={control as any}
                  name="defaultOverheadCost"
                  min={0}
                  step={100}
                  placeholder="0.00"
                  startContent={<span className="text-default-400">₦</span>}
                  description="Utilities, rent, equipment usage"
                />
              </CardBody>
            </Card>

            {/* Cost Summary */}
            {fields.length > 0 && outputQuantity > 0 && (
              <Card
                className="bg-linear-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200 dark:border-green-800"
                shadow="none"
              >
                <CardBody className="p-3 space-y-3">
                  <h4 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    Cost Breakdown (Per Batch)
                  </h4>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-default-600">Materials:</span>
                      <span className="font-medium">
                        ₦{totalMaterialCost.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-default-600">Labor:</span>
                      <span className="font-medium">
                        ₦{laborCost.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-default-600">Overhead:</span>
                      <span className="font-medium">
                        ₦{overheadCost.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-px bg-default-200 my-2" />
                    <div className="flex justify-between text-base font-bold">
                      <span className="text-foreground">Total Cost:</span>
                      <span className="text-green-600">
                        ₦{totalCostPerBatch.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-default-600">Cost Per Unit:</span>
                      <span className="font-semibold text-primary">
                        ₦{unitCost.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-default-600">Output:</span>
                      <span className="font-medium">
                        {outputQuantity}{' '}
                        {producedItems.find(i => i.id === outputItemId)?.unit ||
                          'unit'}
                        (s)
                      </span>
                    </div>
                  </div>

                  <div className="bg-white/50 dark:bg-default-900/50 p-2 rounded border border-green-300 dark:border-green-700">
                    <p className="text-xs text-green-800 dark:text-green-200">
                      💡 <strong>Tip:</strong> This template will save you time
                      on future productions with consistent quality and costs.
                    </p>
                  </div>
                </CardBody>
              </Card>
            )}
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
              isDisabled={fields.length === 0}
            >
              {isEditMode ? 'Update Template' : 'Create Template'}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
