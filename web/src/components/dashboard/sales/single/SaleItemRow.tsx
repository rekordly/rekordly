'use client';

import { useState } from 'react';
import { Card, CardBody, Button } from '@heroui/react';
import { Popover, PopoverTrigger, PopoverContent } from '@heroui/popover';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from '@heroui/modal';

import { Plus, Factory, Package, AlertCircle } from 'lucide-react';

import { InventoryItem, InventoryType } from '@/types/inventory';
import { SaleItemInput } from '@/types/sales';
import { useInventoryStore } from '@/store/inventoryStore';
import { useProductionStore } from '@/store/productionStore';

interface SaleItemRowProps {
  item: SaleItemInput;
  index: number;
  onUpdate: (index: number, item: SaleItemInput) => void;
  onRemove: (index: number) => void;
}

export function SaleItemRow({
  item,
  index,
  onUpdate,
  onRemove,
}: SaleItemRowProps) {
  const { allInventory, checkStockAvailability } = useInventoryStore();

  // Find linked inventory item
  const linkedInventoryItem = item.inventoryItemId
    ? allInventory.find(inv => inv.id === item.inventoryItemId)
    : null;

  // Check stock availability
  const isStockAvailable = linkedInventoryItem
    ? checkStockAvailability(item.inventoryItemId as string, item.quantity)
    : true;

  const isLowStock =
    linkedInventoryItem && linkedInventoryItem.trackInventory
      ? linkedInventoryItem.quantityOnHand <
        (linkedInventoryItem.reorderLevel ?? 0)
      : false;

  return (
    <div className="grid grid-cols-12 gap-2 items-center p-3 bg-default-50 rounded-lg border border-default-200">
      {/* Selection Indicator */}
      <div className="col-span-1 flex items-center justify-center">
        <span className="text-xs font-medium text-default-500">
          {index + 1}
        </span>
      </div>

      {/* Item Name with inventory link */}
      <div className="col-span-3">
        {item.inventoryItemId && linkedInventoryItem ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {linkedInventoryItem.name}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                linkedInventoryItem.itemType === 'FINISHED_GOOD'
                  ? 'bg-green-100 text-green-700'
                  : linkedInventoryItem.itemType === 'SERVICE'
                    ? 'bg-blue-100 text-blue-700'
                    : linkedInventoryItem.itemType === 'RAW_MATERIAL'
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-gray-100 text-gray-700'
              }`}
            >
              {linkedInventoryItem.itemType === 'FINISHED_GOOD' && 'Product'}
              {linkedInventoryItem.itemType === 'SERVICE' && 'Service'}
              {linkedInventoryItem.itemType === 'RAW_MATERIAL' &&
                'Raw Material'}
              {linkedInventoryItem.itemType === 'PRODUCED_ITEM' &&
                'Produced Item'}
              {linkedInventoryItem.itemType === 'CONSUMABLE' && 'Consumable'}
            </span>
          </div>
        ) : (
          <input
            type="text"
            value={item.itemName}
            onChange={e =>
              onUpdate(index, { ...item, itemName: e.target.value })
            }
            className="w-full px-3 py-2 text-sm border border-default-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Item name"
          />
        )}
      </div>

      {/* Description */}
      <div className="col-span-3">
        <input
          type="text"
          value={item.description || ''}
          onChange={e =>
            onUpdate(index, { ...item, description: e.target.value })
          }
          className="w-full px-3 py-2 text-sm border border-default-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="Description"
        />
      </div>

      {/* Quantity */}
      <div className="col-span-1">
        <input
          type="number"
          min="1"
          value={item.quantity}
          onChange={e =>
            onUpdate(index, { ...item, quantity: parseFloat(e.target.value) })
          }
          className="w-full px-3 py-2 text-sm border border-default-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="Qty"
        />
      </div>

      {/* Unit */}
      <div className="col-span-1">
        <span className="text-sm text-default-500">
          {linkedInventoryItem?.unit || 'unit'}
        </span>
      </div>

      {/* Unit Price */}
      <div className="col-span-1">
        <input
          type="number"
          min="0"
          step="0.01"
          value={item.unitPrice}
          onChange={e =>
            onUpdate(index, { ...item, unitPrice: parseFloat(e.target.value) })
          }
          className="w-full px-3 py-2 text-sm border border-default-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="Price"
        />
      </div>

      {/* Amount (Read-only) */}
      <div className="col-span-1 flex items-center justify-end">
        <span className="text-sm font-medium text-foreground">
          ₦{(item.quantity * item.unitPrice).toFixed(2)}
        </span>
      </div>

      {/* Stock Indicator */}
      {item.inventoryItemId &&
        linkedInventoryItem &&
        linkedInventoryItem.trackInventory && (
          <div className="col-span-1 flex items-center justify-end">
            <Popover placement="right">
              <PopoverTrigger>
                <div className="flex items-center gap-1 cursor-help hover:text-primary-600">
                  <Package className="w-4 h-4 text-default-400" />
                  <span className="text-xs font-medium text-default-500">
                    {linkedInventoryItem.quantityOnHand}
                  </span>
                </div>
              </PopoverTrigger>
              <PopoverContent>
                <div className="space-y-2 p-3 min-w-50">
                  <div className="font-medium text-sm">Stock Information</div>
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-default-400" />
                    <div>
                      <div className="text-sm">
                        Available:{' '}
                        <span className="font-medium text-foreground">
                          {linkedInventoryItem.quantityOnHand}
                        </span>
                      </div>
                      <div className="text-xs text-default-500">
                        Reorder at: {linkedInventoryItem.reorderLevel || 'N/A'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        isLowStock
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {isLowStock ? 'Low Stock' : 'In Stock'}
                    </span>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}

      {/* Stock Warning */}
      {!isStockAvailable && (
        <div className="col-span-1 flex items-center justify-end">
          <Popover placement="right">
            <PopoverTrigger>
              <div className="flex items-center gap-1 cursor-pointer text-orange-500 hover:text-orange-600">
                <AlertCircle className="w-4 h-4" />
              </div>
            </PopoverTrigger>
            <PopoverContent>
              <div className="space-y-1 p-3">
                <div className="font-medium text-sm text-orange-500">
                  Insufficient Stock
                </div>
                <div className="text-xs text-default-600">
                  Available:{' '}
                  <span className="font-medium">
                    {linkedInventoryItem?.quantityOnHand || 0}
                  </span>
                  Required: <span className="font-medium">{item.quantity}</span>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Production Link */}
      {item.productionId && (
        <div className="col-span-1 flex items-center justify-end">
          <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full flex items-center gap-1">
            <Factory className="w-3 h-3" />
            Made
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="col-span-1 flex items-center justify-end gap-1">
        {/* Select from Inventory */}
        {!item.inventoryItemId && (
          <SelectFromInventoryButton
            onSelect={inventoryItem => {
              const updatedItem: SaleItemInput = {
                ...item,
                inventoryItemId: inventoryItem.id,
                itemName: inventoryItem.name,
                unitPrice: inventoryItem.sellingPrice || 0,
              };
              onUpdate(index, updatedItem);
            }}
            itemType="FINISHED_GOOD"
          />
        )}

        {/* Create Production */}
        {!item.productionId && (
          <CreateProductionButton
            onCreate={production => {
              const updatedItem: SaleItemInput = {
                ...item,
                productionId: production.id,
              };
              onUpdate(index, updatedItem);
            }}
          />
        )}

        {/* Remove */}
        <button
          onClick={() => onRemove(index)}
          className="text-red-500 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
        >
          <Plus className="w-4 h-4 rotate-45" />
        </button>
      </div>
    </div>
  );
}

// Sub-component: Select from Inventory Button
function SelectFromInventoryButton({
  onSelect,
  itemType,
}: {
  onSelect: (item: InventoryItem) => void;
  itemType: InventoryType;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { allInventory, fetchInventoryItems } = useInventoryStore();

  // Filter inventory by type and active
  const availableItems = allInventory.filter(
    item => item.isActive && (!itemType || item.itemType === itemType)
  );

  const handleSelect = (item: InventoryItem) => {
    onSelect(item);
    setIsOpen(false);
  };

  return (
    <>
      <Button
        color="default"
        size="sm"
        variant="flat"
        className="text-primary-600 hover:bg-primary-50"
        onPress={() => setIsOpen(true)}
      >
        <Package className="w-4 h-4" />
      </Button>

      <Modal isOpen={isOpen} onOpenChange={setIsOpen}>
        <ModalContent>
          {onClose => (
            <>
              <ModalHeader>
                <h3 className="text-lg font-medium">Select from Inventory</h3>
              </ModalHeader>
              <ModalBody className="space-y-4">
                {/* Filter by item type */}
                <div className="flex gap-2">
                  {(
                    ['ALL', 'FINISHED_GOOD', 'SERVICE', 'RAW_MATERIAL'] as const
                  ).map(type => (
                    <button
                      key={type}
                      onClick={() =>
                        fetchInventoryItems({
                          itemType: type === 'ALL' ? undefined : type,
                        })
                      }
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                        type === itemType
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-default-300 hover:border-primary-500 hover:bg-primary-50'
                      }`}
                    >
                      {type === 'ALL' && 'All'}
                      {type === 'FINISHED_GOOD' && 'Products'}
                      {type === 'SERVICE' && 'Services'}
                      {type === 'RAW_MATERIAL' && 'Materials'}
                    </button>
                  ))}
                </div>

                {/* Inventory items list */}
                <div className="max-h-100 overflow-y-auto space-y-2">
                  {availableItems.length > 0 ? (
                    availableItems.map(item => (
                      <button
                        key={item.id}
                        onClick={() => handleSelect(item)}
                        className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-primary-50 border border-default-200 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-foreground">
                              {item.name}
                            </div>
                            {item.sku && (
                              <div className="text-xs text-default-500">
                                SKU: {item.sku}
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="font-medium text-foreground">
                              ₦{item.sellingPrice?.toFixed(2) || '0.00'}
                            </div>
                            <div className="text-xs text-default-500">
                              Stock:{' '}
                              {item.trackInventory
                                ? item.quantityOnHand
                                : 'N/A'}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="text-center py-8 text-default-500">
                      No inventory items available
                    </div>
                  )}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="default" onPress={onClose}>
                  Cancel
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}

// Sub-component: Create Production Button
function CreateProductionButton({
  onCreate,
}: {
  onCreate: (production: any) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { allProductions } = useProductionStore();

  return (
    <>
      <Button
        color="default"
        size="sm"
        variant="flat"
        className="text-purple-600 hover:bg-purple-50"
        onPress={() => setIsOpen(true)}
      >
        <Factory className="w-4 h-4" />
      </Button>

      <Modal isOpen={isOpen} onOpenChange={setIsOpen}>
        <ModalContent>
          {onClose => (
            <>
              <ModalHeader>
                <h3 className="text-lg font-medium">
                  Made-to-Order Production
                </h3>
              </ModalHeader>
              <ModalBody className="space-y-4">
                <p className="text-sm text-default-600">
                  This item requires production. Select an existing production
                  or create a new one to track raw materials and costs.
                </p>

                <div className="max-h-75 overflow-y-auto space-y-2">
                  {allProductions && allProductions.length > 0 ? (
                    allProductions.map((production: any) => (
                      <button
                        key={production.id}
                        onClick={() => {
                          onCreate(production);
                          setIsOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-purple-50 border border-default-200 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-foreground">
                              {production.title || production.outputItemName}
                            </div>
                            <div className="text-xs text-default-500">
                              Qty: {production.outputQuantity} • Cost: ₦
                              {production.unitCost?.toFixed(2)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium text-foreground">
                              ₦{production.totalCost?.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="text-center py-8 text-default-500">
                      No productions available
                    </div>
                  )}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="default" onPress={onClose}>
                  Cancel
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
