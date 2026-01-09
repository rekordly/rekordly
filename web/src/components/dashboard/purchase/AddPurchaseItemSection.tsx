'use client';

import { Card, CardBody, Button } from '@heroui/react';
import { Divider } from '@heroui/divider';
import { useForm, useFormContext, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Edit2, Trash2, Package } from 'lucide-react';
import { useRef, useState, useEffect } from 'react';
import { PurchaseType } from '@prisma/client';

import type { Resolver } from 'react-hook-form';

import { addToast } from '@heroui/react';

import {
  TextInput,
  NumberInput,
  DropdownInput,
  AutocompleteInput,
} from '@/components/ui/Input';
import { formatCurrency } from '@/lib/fn';
import { PurchaseItemSchema } from '@/lib/validations/purchases';
import { PurchaseItemType } from '@/types/purchases';
import { useInventoryStore } from '@/store/inventoryStore';
import { Switch } from '@heroui/react';
import {
  ASSET_CATEGORIES,
  INVENTORY_CATEGORIES,
  UNIT_OPTIONS,
} from '@/config/constant';

interface AddPurchaseItemSectionProps {
  purchaseType: PurchaseType;
}

// Expense Categories
const EXPENSE_CATEGORIES = [
  { label: 'Cost of Goods', value: 'COST_OF_GOODS' },
  { label: 'Rent & Rates', value: 'RENT_RATES' },
  { label: 'Utilities', value: 'UTILITIES' },
  { label: 'Salaries & Wages', value: 'SALARIES_WAGES' },
  { label: 'Repairs & Maintenance', value: 'REPAIRS_MAINTENANCE' },
  { label: 'Office Supplies', value: 'OFFICE_SUPPLIES' },
  { label: 'Software Subscriptions', value: 'SOFTWARE_SUBSCRIPTIONS' },
  { label: 'Professional Fees', value: 'PROFESSIONAL_FEES' },
  { label: 'Insurance', value: 'INSURANCE' },
  { label: 'Licenses & Permits', value: 'LICENSES_PERMITS' },
  { label: 'Advertising', value: 'ADVERTISING' },
  { label: 'Bank Charges', value: 'BANK_CHARGES' },
  { label: 'Training', value: 'TRAINING' },
  { label: 'Interest on Debt', value: 'INTEREST_ON_DEBT' },
  { label: 'Other', value: 'OTHER' },
];

// Inventory Item Categories

export function AddPurchaseItemSection({
  purchaseType,
}: AddPurchaseItemSectionProps) {
  const { setValue, watch } = useFormContext();
  const items: PurchaseItemType[] = watch('items') || [];
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const { allInventory, fetchInventoryItems } = useInventoryStore();

  useEffect(() => {
    if (purchaseType === 'INVENTORY_RESTOCK') {
      fetchInventoryItems();
    }
  }, [purchaseType, fetchInventoryItems]);

  const {
    control: itemControl,
    handleSubmit: handleAddItemSubmit,
    watch: watchItem,
    reset: resetItemForm,
    setValue: setItemValue,
    formState: { errors: itemErrors },
  } = useForm<Omit<PurchaseItemType, 'id' | 'amount'>>({
    resolver: zodResolver(
      PurchaseItemSchema.omit({ id: true, amount: true })
    ) as Resolver<Omit<PurchaseItemType, 'id' | 'amount'>>,
    defaultValues: getDefaultValues(purchaseType),
    mode: 'onChange',
  });

  const itemQuantity = watchItem('quantity') ?? 0;
  const itemUnitPrice = watchItem('unitPrice') ?? 0;
  const addToInventory = watchItem('addToInventory') ?? true;
  const inventoryItemId = watchItem('inventoryItemId');
  const selectedCategory = watchItem('category');
  const idCounter = useRef(1);

  // Inventory items for autocomplete
  const inventoryItemsOptions = allInventory.map(item => ({
    label: `${item.name}${item.sku ? ` (${item.sku})` : ''}`,
    value: item.id,
    data: item,
  }));

  // Handle inventory item selection
  const handleInventorySelection = (itemId: string) => {
    const selectedItem = allInventory.find(item => item.id === itemId);
    if (selectedItem) {
      setItemValue('inventoryItemId', selectedItem.id); // ✅ Use ID
      setItemValue('itemName', selectedItem.name);
      setItemValue('description', selectedItem.description || '');
      setItemValue('unit', selectedItem.unit || 'unit');
      setItemValue('category', selectedItem.category || '');
      setItemValue('sku', selectedItem.sku || '');
      setItemValue('sellingPrice', selectedItem.sellingPrice || undefined);
      setItemValue('reorderLevel', selectedItem.reorderLevel || undefined);
    }
  };

  // Edit item handler
  const handleEditItem = (item: PurchaseItemType) => {
    setEditingItemId(item.id || null);
    resetItemForm({
      itemName: item.itemName,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unit: item.unit || 'unit',
      inventoryItemId: item.inventoryItemId,
      sku: item.sku,
      category: item.category,
      reorderLevel: item.reorderLevel,
      sellingPrice: item.sellingPrice,
      addToInventory: item.addToInventory || true,
      showOnStorefront:
        item.showOnStorefront ?? item.category !== 'RAW_MATERIAL',
      expenseCategory: item.expenseCategory,
      isDeductible: item.isDeductible ?? true,
      deductionPercentage: item.deductionPercentage ?? 100,
      assetCategory: item.assetCategory,
      depreciationRate: item.depreciationRate,
      residualValue: item.residualValue,
      acquisitionDate: item.acquisitionDate,
    });
  };

  // Remove item handler
  const removeItem = (id: string) => {
    const updatedItems = items.filter(
      (item: PurchaseItemType) => item.id !== id
    );
    setValue('items', updatedItems, { shouldValidate: true });

    const newSubtotal = updatedItems.reduce(
      (sum: number, item: PurchaseItemType) => sum + item.amount,
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
  const onAddItem = (data: Omit<PurchaseItemType, 'id' | 'amount'>) => {
    if (editingItemId !== null) {
      const updatedItems = items.map((item: PurchaseItemType) =>
        item.id === editingItemId
          ? {
              ...item,
              itemName: data.itemName,
              description: data.description,
              quantity: data.quantity,
              unitPrice: data.unitPrice,
              amount: data.quantity * data.unitPrice,
              unit: data.unit || 'unit',
              inventoryItemId: data.inventoryItemId,
              sku: data.sku,
              category: data.category,
              reorderLevel: data.reorderLevel,
              sellingPrice: data.sellingPrice,
              addToInventory: data.addToInventory,
              showOnStorefront: data.showOnStorefront,
              expenseCategory: data.expenseCategory,
              isDeductible: data.isDeductible,
              deductionPercentage: data.deductionPercentage,
              assetCategory: data.assetCategory,
              depreciationRate: data.depreciationRate,
              residualValue: data.residualValue,
              acquisitionDate: data.acquisitionDate,
            }
          : item
      );

      setValue('items', updatedItems, { shouldValidate: true });

      const newSubtotal = updatedItems.reduce(
        (sum: number, item: PurchaseItemType) => sum + item.amount,
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
      const newItem: PurchaseItemType = {
        id: `temp-${idCounter.current++}`,
        itemName: data.itemName,
        description: data.description,
        quantity: data.quantity,
        unitPrice: data.unitPrice,
        amount: data.quantity * data.unitPrice,
        unit: data.unit || 'unit',
        inventoryItemId: data.inventoryItemId,
        sku: data.sku,
        category: data.category,
        reorderLevel: data.reorderLevel,
        sellingPrice: data.sellingPrice,
        addToInventory: data.addToInventory || true,
        showOnStorefront:
          data.showOnStorefront ?? data.category !== 'RAW_MATERIAL',
        expenseCategory: data.expenseCategory,
        isDeductible: data.isDeductible ?? true,
        deductionPercentage: data.deductionPercentage ?? 100,
        assetCategory: data.assetCategory,
        depreciationRate: data.depreciationRate,
        residualValue: data.residualValue,
        acquisitionDate: data.acquisitionDate,
      };

      const updatedItems = [...items, newItem];
      setValue('items', updatedItems, { shouldValidate: true });

      const newSubtotal = updatedItems.reduce(
        (sum: number, item: PurchaseItemType) => sum + item.amount,
        0
      );
      setValue('subtotal', newSubtotal, { shouldValidate: true });

      addToast({
        title: 'Item Added',
        description: 'Item has been added to purchase',
        color: 'success',
      });
    }

    resetItemForm(getDefaultValues(purchaseType));
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    resetItemForm(getDefaultValues(purchaseType));
  };

  const getItemTypeLabel = () => {
    switch (purchaseType) {
      case 'INVENTORY_RESTOCK':
        return 'Inventory Items';
      case 'BUSINESS_EXPENSE':
        return 'Expense Items';
      case 'ASSET_PURCHASE':
        return 'Asset Items';
      case 'PERSONAL_EXPENSE':
        return 'Personal Expense Items';
      default:
        return 'Purchase Items';
    }
  };

  const getItemPlaceholder = () => {
    switch (purchaseType) {
      case 'INVENTORY_RESTOCK':
        return 'e.g., Raw Materials, Products, Components';
      case 'BUSINESS_EXPENSE':
        return 'e.g., Office Supplies, Utilities, Services';
      case 'ASSET_PURCHASE':
        return 'e.g., Laptop, Vehicle, Machinery';
      case 'PERSONAL_EXPENSE':
        return 'e.g., Personal Purchase';
      default:
        return 'e.g., Item name';
    }
  };

  const shouldShowStorefrontSwitch =
    selectedCategory && selectedCategory !== 'RAW_MATERIAL';

  return (
    <>
      <Card
        className="w-full rounded-2xl p-3 bg-transparent border border-default-200"
        shadow="none"
      >
        <CardBody className="p-0 space-y-3">
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <Package className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">{getItemTypeLabel()}</h3>
            </div>
          </div>

          {/* INVENTORY RESTOCK FIELDS */}
          {purchaseType === 'INVENTORY_RESTOCK' && (
            <>
              <AutocompleteInput
                control={itemControl as any}
                getOptionLabel={item => item.label}
                getOptionValue={item => item.value}
                items={inventoryItemsOptions}
                description="Search and link to existing inventory item"
                label="Select Inventory Item (Optional)"
                name="inventoryItemId"
                placeholder="Search by name or SKU"
                disallowTyping={false}
                onSelectionChange={value => {
                  // value should be the ID (item.value)
                  if (value) {
                    handleInventorySelection(value);
                  } else {
                    // Clear the fields when deselected
                    setItemValue('inventoryItemId', undefined);
                    setItemValue('itemName', '');
                    setItemValue('description', '');
                    setItemValue('sku', '');
                    setItemValue('category', '');
                  }
                }}
              />

              {!inventoryItemId && (
                <div className="space-y-3 pt-3 ">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium text-foreground">
                        Add as New Inventory Item
                      </label>
                      <p className="text-xs text-default-500">
                        Create new inventory item from this purchase
                      </p>
                    </div>
                    <Controller
                      control={itemControl}
                      name="addToInventory"
                      render={({ field }) => (
                        <Switch
                          isSelected={field.value}
                          onValueChange={field.onChange}
                          size="sm"
                        >
                          {field.value ? 'Yes' : 'No'}
                        </Switch>
                      )}
                    />
                  </div>
                </div>
              )}

              <TextInput
                isRequired
                isDisabled={!!inventoryItemId}
                label="Item Name"
                control={itemControl as any}
                name="itemName"
                placeholder={getItemPlaceholder()}
              />

              <TextInput
                isDisabled={!!inventoryItemId}
                label="Description"
                control={itemControl as any}
                name="description"
                placeholder="Additional details about the item"
              />

              {(addToInventory || inventoryItemId) && (
                <>
                  <p className="text-xs font-medium text-default-600 uppercase tracking-wide">
                    Inventory Details
                  </p>

                  <DropdownInput
                    isRequired
                    isDisabled={!!inventoryItemId} // ✅ Add this
                    label="Item Category"
                    control={itemControl as any}
                    name="category"
                    items={INVENTORY_CATEGORIES}
                    placeholder="Select category"
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <TextInput
                      isDisabled={!!inventoryItemId}
                      label="SKU"
                      control={itemControl as any}
                      name="sku"
                      placeholder="Auto-generated if blank"
                      description="Stock Keeping Unit"
                    />
                    <NumberInput
                      label="Selling Price"
                      control={itemControl as any}
                      name="sellingPrice"
                      min={0}
                      step={0.01}
                      placeholder="0.00"
                      startContent={<span className="text-default-400">₦</span>}
                    />
                  </div>

                  {shouldShowStorefrontSwitch && (
                    <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <div>
                        <label className="text-sm font-medium text-foreground">
                          Show on Storefront
                        </label>
                        <p className="text-xs text-default-500">
                          Display this item for customer orders
                        </p>
                      </div>
                      <Controller
                        control={itemControl}
                        name="showOnStorefront"
                        render={({ field }) => (
                          <Switch
                            isSelected={field.value}
                            onValueChange={field.onChange}
                            size="sm"
                          >
                            {field.value ? 'Yes' : 'No'}
                          </Switch>
                        )}
                      />
                    </div>
                  )}
                </>
              )}

              <Divider className="my-2" />
              <p className="text-xs font-medium text-default-600 uppercase tracking-wide">
                Purchase Details
              </p>

              <div className="grid grid-cols-2 gap-3">
                <NumberInput
                  isRequired
                  label="Quantity"
                  control={itemControl as any}
                  name="quantity"
                  min={0.01}
                  placeholder="0"
                  step={0.01}
                />

                <DropdownInput
                  isRequired
                  isDisabled={!!inventoryItemId}
                  label="Unit"
                  control={itemControl as any}
                  name="unit"
                  items={UNIT_OPTIONS}
                  placeholder="Select unit"
                />
              </div>

              <NumberInput
                isRequired
                label="Unit Price (₦)"
                control={itemControl as any}
                name="unitPrice"
                min={0}
                placeholder="0.00"
                startContent={
                  <span className="text-default-400 text-sm">₦</span>
                }
                step={0.01}
              />
            </>
          )}

          {/* BUSINESS EXPENSE FIELDS */}
          {purchaseType === 'BUSINESS_EXPENSE' && (
            <>
              <DropdownInput
                isRequired
                label="Expense Category"
                control={itemControl as any}
                name="expenseCategory"
                items={EXPENSE_CATEGORIES}
                placeholder="Select expense category"
              />

              <TextInput
                isRequired
                label="Expense Description"
                control={itemControl as any}
                name="itemName"
                placeholder={getItemPlaceholder()}
              />

              <TextInput
                label="Additional Notes"
                control={itemControl as any}
                name="description"
                placeholder="Additional details about the expense"
              />

              <div className="grid grid-cols-2 gap-3">
                <NumberInput
                  isRequired
                  label="Quantity"
                  control={itemControl as any}
                  name="quantity"
                  min={0.01}
                  placeholder="1"
                  step={0.01}
                />

                <NumberInput
                  isRequired
                  label="Unit Price (₦)"
                  control={itemControl as any}
                  name="unitPrice"
                  min={0}
                  placeholder="0.00"
                  startContent={
                    <span className="text-default-400 text-sm">₦</span>
                  }
                  step={0.01}
                />
              </div>

              <div className="space-y-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-foreground">
                      Tax Deductible
                    </label>
                    <p className="text-xs text-default-500">
                      Is this expense tax deductible?
                    </p>
                  </div>
                  <Controller
                    control={itemControl}
                    name="isDeductible"
                    render={({ field }) => (
                      <Switch
                        isSelected={field.value}
                        onValueChange={field.onChange}
                        size="sm"
                      >
                        {field.value ? 'Yes' : 'No'}
                      </Switch>
                    )}
                  />
                </div>

                {watchItem('isDeductible') && (
                  <NumberInput
                    label="Deduction Percentage (%)"
                    control={itemControl as any}
                    name="deductionPercentage"
                    min={0}
                    max={100}
                    placeholder="100"
                  />
                )}
              </div>
            </>
          )}

          {/* ASSET PURCHASE FIELDS */}
          {purchaseType === 'ASSET_PURCHASE' && (
            <>
              <DropdownInput
                isRequired
                label="Asset Category"
                control={itemControl as any}
                name="assetCategory"
                items={ASSET_CATEGORIES}
                placeholder="Select asset category"
              />

              <TextInput
                isRequired
                label="Asset Name"
                control={itemControl as any}
                name="itemName"
                placeholder={getItemPlaceholder()}
              />

              <TextInput
                label="Description"
                control={itemControl as any}
                name="description"
                placeholder="Additional details about the asset"
              />

              <div className="grid grid-cols-2 gap-3">
                <NumberInput
                  isRequired
                  label="Quantity"
                  control={itemControl as any}
                  name="quantity"
                  min={1}
                  placeholder="1"
                  step={1}
                />

                <NumberInput
                  isRequired
                  label="Unit Price (₦)"
                  control={itemControl as any}
                  name="unitPrice"
                  min={0}
                  placeholder="0.00"
                  startContent={
                    <span className="text-default-400 text-sm">₦</span>
                  }
                  step={0.01}
                />
              </div>

              <div className="space-y-3 p-3 bg-green-50 rounded-lg border border-green-200">
                <p className="text-xs font-medium text-green-900">
                  Asset Depreciation Details
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <NumberInput
                    label="Depreciation Rate (%)"
                    control={itemControl as any}
                    name="depreciationRate"
                    min={0}
                    max={100}
                    placeholder="0"
                    step={0.1}
                  />
                  <NumberInput
                    label="Residual Value (₦)"
                    control={itemControl as any}
                    name="residualValue"
                    min={0}
                    placeholder="0.00"
                    startContent={<span className="text-default-400">₦</span>}
                    step={0.01}
                  />
                </div>

                <TextInput
                  label="Acquisition Date"
                  control={itemControl as any}
                  name="acquisitionDate"
                  type="date"
                />
              </div>
            </>
          )}

          {/* PERSONAL EXPENSE FIELDS */}
          {purchaseType === 'PERSONAL_EXPENSE' && (
            <>
              <TextInput
                isRequired
                label="Expense Description"
                control={itemControl as any}
                name="itemName"
                placeholder={getItemPlaceholder()}
              />

              <TextInput
                label="Additional Notes"
                control={itemControl as any}
                name="description"
                placeholder="Additional details"
              />

              <div className="grid grid-cols-2 gap-3">
                <NumberInput
                  isRequired
                  label="Quantity"
                  control={itemControl as any}
                  name="quantity"
                  min={0.01}
                  placeholder="1"
                  step={0.01}
                />

                <NumberInput
                  isRequired
                  label="Unit Price (₦)"
                  control={itemControl as any}
                  name="unitPrice"
                  min={0}
                  placeholder="0.00"
                  startContent={
                    <span className="text-default-400 text-sm">₦</span>
                  }
                  step={0.01}
                />
              </div>

              <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
                <p className="text-sm text-orange-800">
                  ℹ️ Personal expenses will be recorded as owner drawings
                </p>
              </div>
            </>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-default-200">
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
                          {item.itemName}
                        </p>
                        <p className="text-xs text-default-500">
                          {item.quantity} {item.unit || 'unit'} ×{' '}
                          {formatCurrency(item.unitPrice)}
                        </p>
                        {item.description && (
                          <p className="text-xs text-default-400 truncate mt-1">
                            {item.description}
                          </p>
                        )}
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
                            onPress={() => removeItem(item.id!)}
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
        </CardBody>
      </Card>
    </>
  );
}

// Helper function to get default values based on purchase type
function getDefaultValues(purchaseType: PurchaseType) {
  const baseDefaults = {
    itemName: '',
    description: '',
    quantity: undefined,
    unitPrice: undefined,
    unit: 'unit',
  };

  switch (purchaseType) {
    case 'INVENTORY_RESTOCK':
      return {
        ...baseDefaults,
        inventoryItemId: undefined,
        sku: '',
        category: '',
        reorderLevel: undefined,
        sellingPrice: undefined,
        addToInventory: true,
        showOnStorefront: true,
      };
    case 'BUSINESS_EXPENSE':
      return {
        ...baseDefaults,
        expenseCategory: undefined,
        isDeductible: true,
        deductionPercentage: 100,
      };
    case 'ASSET_PURCHASE':
      return {
        ...baseDefaults,
        assetCategory: undefined,
        depreciationRate: undefined,
        residualValue: undefined,
        acquisitionDate: undefined,
      };
    case 'PERSONAL_EXPENSE':
      return baseDefaults;
    default:
      return baseDefaults;
  }
}
