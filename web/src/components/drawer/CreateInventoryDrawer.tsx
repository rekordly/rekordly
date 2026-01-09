'use client';

import { useForm, Controller, Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
} from '@heroui/react';
import { Button } from '@heroui/button';
import { TextInput, DropdownInput, NumberInput } from '@/components/ui/Input';
import { Card, CardBody, Switch, addToast } from '@heroui/react';
import { Save, Package, Upload, X, Image as ImageIcon } from 'lucide-react';

import { useInventoryStore } from '@/store/inventoryStore';
import { InventoryItem, InventoryItemInput } from '@/types/inventory';
import { CreateInventoryItemSchema } from '@/lib/validations/inventory';
import { INVENTORY_CATEGORIES, UNIT_OPTIONS } from '@/config/constant';

interface CreateInventoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  inventoryItem?: InventoryItem | null;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function CreateInventoryDrawer({
  isOpen,
  onClose,
  inventoryItem,
}: CreateInventoryDrawerProps) {
  const { createInventoryItem, updateInventoryItem } = useInventoryStore();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [removeImage, setRemoveImage] = useState(false);

  const isEditMode = !!inventoryItem;

  // Form
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
    watch,
    setValue,
  } = useForm<InventoryItemInput>({
    resolver: zodResolver(
      CreateInventoryItemSchema
    ) as Resolver<InventoryItemInput>,
    defaultValues: {
      itemType: 'RAW_MATERIAL',
      name: '',
      description: '',
      category: '',
      sku: '',
      unit: 'unit',
      trackInventory: true,
      reorderLevel: 0,
      sellingPrice: 0,
      reorderQuantity: 0,
      showOnStorefront: false,
      isActive: true,
    },
  });

  const trackInventory = watch('trackInventory');
  const showOnStorefront = watch('showOnStorefront');
  const itemType = watch('itemType');

  // Raw materials cannot be shown on storefront
  const canShowOnStorefront = itemType !== 'RAW_MATERIAL';

  // Handle image upload
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        addToast({
          title: 'File too large',
          description: 'Please select an image smaller than 5MB',
          color: 'danger',
        });
        return;
      }

      const allowedTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
      ];
      if (!allowedTypes.includes(file.type)) {
        addToast({
          title: 'Invalid file type',
          description: 'Only JPEG, PNG, and WebP images are allowed',
          color: 'danger',
        });
        return;
      }

      setImageFile(file);
      setRemoveImage(false);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview('');
    setRemoveImage(true);
  };

  // Reset form when opening with inventory data
  useEffect(() => {
    if (isOpen && inventoryItem) {
      reset({
        itemType: inventoryItem.itemType as any,
        name: inventoryItem.name,
        description: inventoryItem.description || '',
        category: inventoryItem.category || '',
        sku: inventoryItem.sku || '',
        unit: inventoryItem.unit,
        trackInventory: inventoryItem.trackInventory,
        reorderLevel: inventoryItem.reorderLevel || 0,
        sellingPrice: inventoryItem.sellingPrice || 0,
        reorderQuantity: inventoryItem.reorderQuantity || 0,
        showOnStorefront: inventoryItem.showOnStorefront,
        isActive: inventoryItem.isActive,
      });

      if (inventoryItem.storefrontImage) {
        setImagePreview(inventoryItem.storefrontImage);
      }
      setImageFile(null);
      setRemoveImage(false);
    } else if (isOpen && !inventoryItem) {
      reset({
        itemType: 'RAW_MATERIAL',
        name: '',
        description: '',
        category: '',
        sku: '',
        unit: 'unit',
        trackInventory: true,
        sellingPrice: 0,
        reorderLevel: 0,
        reorderQuantity: 0,
        showOnStorefront: false,
        isActive: true,
      });
      setImageFile(null);
      setImagePreview('');
      setRemoveImage(false);
    }
  }, [isOpen, inventoryItem, reset]);

  // Handle submit
  const onSubmit = async (data: InventoryItemInput) => {
    try {
      // Create FormData
      const formData = new FormData();

      // Prepare payload
      const payload = {
        itemType: data.itemType,
        name: data.name,
        description: data.description || undefined,
        category: data.category || undefined,
        sku: data.sku || undefined,
        unit: data.unit,
        sellingPrice: data.sellingPrice,
        trackInventory: data.trackInventory,
        reorderLevel: data.reorderLevel || undefined,
        reorderQuantity: data.reorderQuantity || undefined,
        showOnStorefront:
          data.itemType === 'RAW_MATERIAL' ? false : data.showOnStorefront,
        isActive: data.isActive,
      };

      // Add JSON data
      formData.append('data', JSON.stringify(payload));

      // Add image if present
      if (imageFile) {
        formData.append('file', imageFile);
      }

      // Add remove image flag
      if (removeImage && isEditMode) {
        formData.append('removeImage', 'true');
      }

      if (isEditMode && inventoryItem) {
        await updateInventoryItem(inventoryItem.id, formData);
        addToast({
          title: 'Success',
          description: 'Inventory item updated successfully',
          color: 'success',
        });
      } else {
        await createInventoryItem(formData);
        addToast({
          title: 'Success',
          description: 'Inventory item created successfully',
          color: 'success',
        });
      }
      onClose();
    } catch (error: any) {
      addToast({
        title: 'Error',
        description: error?.message || 'Failed to save inventory item',
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
              <Package className="w-5 h-5 text-blue-600" />
              <h3 className="text-xl font-bold">
                {isEditMode
                  ? 'Edit Inventory Item'
                  : 'Create New Inventory Item'}
              </h3>
            </div>
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

                <DropdownInput
                  isRequired
                  label="Item Type"
                  control={control as any}
                  name="itemType"
                  items={INVENTORY_CATEGORIES}
                  placeholder="Select item type"
                />

                <TextInput
                  isRequired
                  label="Item Name"
                  control={control as any}
                  name="name"
                  placeholder="e.g., Wheat Flour, Finished Cake"
                />

                <TextInput
                  label="Description"
                  control={control as any}
                  name="description"
                  placeholder="Additional details about this item..."
                />

                <div className="grid grid-cols-2 gap-3">
                  <TextInput
                    label="SKU"
                    control={control as any}
                    name="sku"
                    placeholder="Auto-generated if blank"
                  />
                  <DropdownInput
                    isRequired
                    label="Unit of Measurement"
                    control={control as any}
                    name="unit"
                    items={UNIT_OPTIONS}
                    placeholder="Select unit"
                  />
                </div>

                <NumberInput
                  label="Selling Price"
                  control={control as any}
                  name="sellingPrice"
                  min={0}
                  step={10}
                  placeholder="0.00"
                  startContent={<span className="text-default-400">₦</span>}
                  isRequired
                />

                {/* Image Upload */}
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Item Image
                  </label>

                  {imagePreview ? (
                    <div className="relative w-full h-48 rounded-lg overflow-hidden border border-default-200">
                      <img
                        src={imagePreview}
                        alt="Item preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute top-2 right-2 p-1.5 bg-danger-500 text-white rounded-full hover:bg-danger-600 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-default-300 rounded-lg cursor-pointer hover:border-primary transition-colors">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-10 h-10 mb-3 text-default-400" />
                        <p className="mb-2 text-sm text-default-600">
                          <span className="font-semibold">Click to upload</span>{' '}
                          or drag and drop
                        </p>
                        <p className="text-xs text-default-500">
                          PNG, JPG or WEBP (MAX. 5MB)
                        </p>
                        <p className="text-xs text-default-400 mt-1">
                          Image will be compressed to ~100KB
                        </p>
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        onChange={handleImageChange}
                      />
                    </label>
                  )}
                  <p className="text-xs text-default-500 mt-1">
                    {canShowOnStorefront
                      ? 'Used for storefront display (if enabled)'
                      : 'For your reference only'}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-default-200">
                  <div>
                    <label className="text-sm font-medium text-foreground">
                      Active Status
                    </label>
                    <p className="text-xs text-default-500">
                      {"Inactive items won't appear in selections"}
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

            {/* Inventory Tracking */}
            <Card
              className="w-full rounded-2xl p-3 bg-transparent border border-default-200"
              shadow="none"
            >
              <CardBody className="p-0 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-base font-semibold text-foreground">
                      Inventory Tracking
                    </h4>
                    <p className="text-xs text-default-500">
                      Enable to track stock levels
                    </p>
                  </div>
                  <Controller
                    control={control}
                    name="trackInventory"
                    render={({ field }) => (
                      <Switch
                        isSelected={field.value}
                        onValueChange={field.onChange}
                        size="sm"
                      >
                        {field.value ? 'On' : 'Off'}
                      </Switch>
                    )}
                  />
                </div>

                {trackInventory && (
                  <div className="space-y-3 pt-3 border-t border-default-200">
                    <div className="grid grid-cols-2 gap-3">
                      <NumberInput
                        label="Reorder Level"
                        control={control as any}
                        name="reorderLevel"
                        min={0}
                        step={1}
                        placeholder="0"
                      />

                      <NumberInput
                        label="Reorder Quantity"
                        control={control as any}
                        name="reorderQuantity"
                        min={0}
                        step={1}
                        placeholder="0"
                      />
                    </div>
                    <p className="text-xs text-default-500">
                      {
                        "You'll be alerted when stock falls below the reorder level"
                      }
                    </p>

                    {isEditMode && inventoryItem && (
                      <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                        <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                          Current Stock: {inventoryItem.quantityOnHand}{' '}
                          {inventoryItem.unit}
                        </p>
                        <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                          Use Stock Adjustment to modify quantity
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Current Pricing (View Only in Edit Mode) */}
            {isEditMode && inventoryItem && (
              <Card
                className="w-full rounded-2xl p-3 bg-linear-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200 dark:border-green-800"
                shadow="none"
              >
                <CardBody className="p-0 space-y-3">
                  <h4 className="text-base font-semibold text-foreground">
                    Current Pricing (Read Only)
                  </h4>
                  <p className="text-xs text-default-600">
                    Prices are calculated from purchase history. Use purchases
                    to update costs.
                  </p>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-xs text-default-500">Average Cost</p>
                      <p className="text-sm font-bold text-foreground">
                        ₦{inventoryItem.averageCost.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-default-500">Last Purchase</p>
                      <p className="text-sm font-bold text-foreground">
                        {inventoryItem.lastPurchaseCost
                          ? `₦${inventoryItem.lastPurchaseCost.toLocaleString()}`
                          : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-default-500">Selling Price</p>
                      <p className="text-sm font-bold text-foreground">
                        {inventoryItem.sellingPrice
                          ? `₦${inventoryItem.sellingPrice.toLocaleString()}`
                          : '-'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-white/50 dark:bg-default-900/50 p-2 rounded border border-green-300 dark:border-green-700">
                    <p className="text-xs text-green-800 dark:text-green-200">
                      💡 <strong>Tip:</strong> Costs update automatically from
                      purchases. Update selling price separately if needed.
                    </p>
                  </div>
                </CardBody>
              </Card>
            )}

            {/* Storefront Display */}
            {canShowOnStorefront && (
              <Card
                className="w-full rounded-2xl p-3 bg-transparent border border-default-200"
                shadow="none"
              >
                <CardBody className="p-0 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-base font-semibold text-foreground">
                        Storefront Display
                      </h4>
                      <p className="text-xs text-default-500">
                        Show this item on your public storefront
                      </p>
                    </div>
                    <Controller
                      control={control}
                      name="showOnStorefront"
                      render={({ field }) => (
                        <Switch
                          isSelected={field.value}
                          onValueChange={field.onChange}
                          size="sm"
                        >
                          {field.value ? 'Visible' : 'Hidden'}
                        </Switch>
                      )}
                    />
                  </div>

                  {showOnStorefront && (
                    <div className="bg-purple-50 dark:bg-purple-950/30 p-3 rounded-lg border border-purple-200 dark:border-purple-800">
                      <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
                        ✨ Storefront Preview
                      </p>
                      <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
                        This item will be visible to customers with your selling
                        price and image
                      </p>
                    </div>
                  )}
                </CardBody>
              </Card>
            )}

            {!canShowOnStorefront && (
              <div className="bg-yellow-50 dark:bg-yellow-950/30 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  ℹ️ Raw materials cannot be displayed on storefront
                </p>
              </div>
            )}

            {/* Summary Card */}
            {isEditMode && inventoryItem && (
              <Card
                className="bg-linear-to-br from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 border border-blue-200 dark:border-blue-800"
                shadow="none"
              >
                <CardBody className="p-3 space-y-2">
                  <h4 className="text-base font-semibold">Current Status</h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-default-500">
                        Quantity on Hand
                      </div>
                      <div className="text-lg font-bold">
                        {inventoryItem.quantityOnHand} {inventoryItem.unit}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-default-500">
                        Total Value
                      </div>
                      <div className="text-lg font-bold">
                        ₦
                        {(
                          inventoryItem.quantityOnHand *
                          inventoryItem.averageCost
                        ).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {inventoryItem.reorderLevel &&
                    inventoryItem.quantityOnHand <=
                      inventoryItem.reorderLevel && (
                      <div className="pt-2 border-t border-default-200 dark:border-default-700">
                        <div className="bg-danger-50 dark:bg-danger-950/30 px-3 py-2 rounded-lg border border-danger-200 dark:border-danger-800">
                          <p className="text-sm font-medium text-danger-700 dark:text-danger-300">
                            ⚠️ Low Stock Alert
                          </p>
                          <p className="text-xs text-danger-600 dark:text-danger-400 mt-1">
                            Stock is at or below reorder level (
                            {inventoryItem.reorderLevel})
                          </p>
                        </div>
                      </div>
                    )}
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
            >
              {isEditMode ? 'Update Item' : 'Create Item'}
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
