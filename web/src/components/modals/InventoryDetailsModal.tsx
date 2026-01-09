'use client';

import React, { useState } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Button,
  Divider,
  Chip,
} from '@heroui/react';
import {
  Package,
  Edit,
  Trash2,
  AlertTriangle,
  Tag,
  Boxes,
  DollarSign,
  TrendingUp,
  Factory,
} from 'lucide-react';
import { InventoryItem } from '@/types/inventory';
import { formatCurrency } from '@/lib/fn';
import { CreateProductionDrawer } from '@/components/drawer/CreateProductionDrawer';

interface InventoryDetailsModalProps {
  item: InventoryItem | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
}

const getStatusColor = (
  item: InventoryItem
): 'default' | 'primary' | 'success' | 'warning' | 'danger' => {
  if (!item.isActive) return 'default';
  if (item.trackInventory && item.quantityOnHand <= 0) {
    return 'danger';
  }
  if (
    item.trackInventory &&
    item.reorderLevel &&
    item.quantityOnHand <= item.reorderLevel
  ) {
    return 'danger';
  }
  if (
    item.trackInventory &&
    item.reorderLevel &&
    item.quantityOnHand <= item.reorderLevel * 1.5
  ) {
    return 'warning';
  }
  return 'success';
};

const getStatusText = (item: InventoryItem): string => {
  if (!item.isActive) return 'Inactive';
  if (item.trackInventory && item.quantityOnHand <= 0) {
    return 'Out of Stock';
  }
  if (
    item.trackInventory &&
    item.reorderLevel &&
    item.quantityOnHand <= item.reorderLevel
  ) {
    return 'Low Stock';
  }
  if (
    item.trackInventory &&
    item.reorderLevel &&
    item.quantityOnHand <= item.reorderLevel * 1.5
  ) {
    return 'Warning';
  }
  return 'In Stock';
};

const formatItemType = (type: string): string => {
  return type
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
};

export function InventoryDetailsModal({
  item,
  isOpen,
  onClose,
  onEdit,
  onDelete,
}: InventoryDetailsModalProps) {
  const [isProductionDrawerOpen, setIsProductionDrawerOpen] = useState(false);

  if (!item) return null;

  const statusColor = getStatusColor(item);
  const statusText = getStatusText(item);
  const isProducedItem = item.itemType === 'PRODUCED_ITEM';

  return (
    <>
      <Modal
        backdrop="blur"
        isOpen={isOpen}
        size="lg"
        onClose={onClose}
        scrollBehavior="inside"
        classNames={{
          base: 'max-h-[90vh]',
          body: 'py-6',
        }}
      >
        <ModalContent>
          {() => (
            <>
              {/* Header */}
              <ModalHeader className="flex items-center justify-between pb-4 border-b border-divider">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Chip className="h-6" size="sm" variant="flat">
                      <span className="text-xs font-medium">
                        {formatItemType(item.itemType)}
                      </span>
                    </Chip>

                    <Chip
                      className="h-6"
                      color={statusColor}
                      size="sm"
                      variant="flat"
                    >
                      <span className="text-xs font-medium">{statusText}</span>
                    </Chip>
                  </div>
                  <h3 className="text-lg font-semibold">{item.name}</h3>
                  {item.sku && (
                    <p className="text-sm text-default-500 font-normal mt-0.5">
                      SKU: {item.sku}
                    </p>
                  )}
                </div>

                {/* Action Icons */}
                <div className="flex items-center gap-2">
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    onPress={() => {
                      onEdit(item);
                      onClose();
                    }}
                    aria-label="Edit item"
                  >
                    <Edit size={18} />
                  </Button>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    color="danger"
                    onPress={() => {
                      onDelete(item);
                      onClose();
                    }}
                    aria-label="Delete item"
                  >
                    <Trash2 size={18} />
                  </Button>
                </div>
              </ModalHeader>

              <ModalBody>
                {/* Image */}
                {item.storefrontImage && (
                  <div className="mb-4">
                    <div className="w-full h-48 rounded-lg overflow-hidden bg-default-100">
                      <img
                        src={item.storefrontImage}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                )}

                {/* Description */}
                {item.description && (
                  <>
                    <div className="mb-4">
                      <p className="text-sm text-default-500 mb-1">
                        Description
                      </p>
                      <p className="text-sm leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                    <Divider className="mb-4" />
                  </>
                )}

                {/* Details Grid */}
                <div className="space-y-4">
                  {/* Category & Unit */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                      <Tag size={18} className="text-default-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-default-500">Category</p>
                      <p className="text-sm font-medium">
                        {item.category || '-'}
                      </p>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-default-500">Unit</p>
                      <p className="text-sm font-medium">{item.unit}</p>
                    </div>
                  </div>

                  {/* Stock Information */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                      <Boxes size={18} className="text-default-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-default-500">
                        Quantity on Hand
                      </p>
                      <p className="text-sm font-medium">
                        {item.quantityOnHand} {item.unit}
                      </p>
                    </div>
                  </div>

                  {/* Reorder Levels */}
                  {(item.reorderLevel || item.reorderQuantity) && (
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                        <AlertTriangle size={18} className="text-default-600" />
                      </div>
                      <div className="flex-1 grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-default-500">
                            Reorder Level
                          </p>
                          <p className="text-sm font-medium">
                            {item.reorderLevel || '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-default-500">
                            Reorder Quantity
                          </p>
                          <p className="text-sm font-medium">
                            {item.reorderQuantity || '-'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Pricing Information */}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                      <DollarSign size={18} className="text-default-600" />
                    </div>
                    <div className="flex-1 grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-xs text-default-500">Average Cost</p>
                        <p className="text-sm font-medium">
                          {formatCurrency(item.averageCost)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-default-500">
                          Last Purchase
                        </p>
                        <p className="text-sm font-medium">
                          {item.lastPurchaseCost
                            ? formatCurrency(item.lastPurchaseCost)
                            : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-default-500">
                          Selling Price
                        </p>
                        <p className="text-sm font-medium">
                          {item.sellingPrice
                            ? formatCurrency(item.sellingPrice)
                            : '-'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Total Value */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                      <TrendingUp size={18} className="text-default-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-default-500">
                        Total Inventory Value
                      </p>
                      <p className="text-sm font-medium">
                        {formatCurrency(item.quantityOnHand * item.averageCost)}
                      </p>
                    </div>
                  </div>

                  {/* Settings */}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                      <Package size={18} className="text-default-600" />
                    </div>
                    <div className="flex-1 grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-default-500">
                          Track Inventory
                        </p>
                        <Chip
                          size="sm"
                          color={item.trackInventory ? 'success' : 'default'}
                          variant="flat"
                        >
                          {item.trackInventory ? 'Yes' : 'No'}
                        </Chip>
                      </div>
                      <div>
                        <p className="text-xs text-default-500">
                          Show on Storefront
                        </p>
                        <Chip
                          size="sm"
                          color={item.showOnStorefront ? 'primary' : 'default'}
                          variant="flat"
                        >
                          {item.showOnStorefront ? 'Yes' : 'No'}
                        </Chip>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Low Stock Warning */}
                {item.trackInventory &&
                  item.reorderLevel &&
                  item.quantityOnHand <= item.reorderLevel &&
                  item.quantityOnHand > 0 && (
                    <>
                      <Divider className="my-4" />
                      <div className="bg-danger-50 dark:bg-danger-950/30 rounded-lg p-3">
                        <div className="flex items-center gap-2">
                          <AlertTriangle
                            size={16}
                            className="text-danger-500"
                          />
                          <p className="text-sm text-danger-700 dark:text-danger-300 font-medium">
                            Low Stock Warning
                          </p>
                        </div>
                        <p className="text-xs text-danger-600 dark:text-danger-400 mt-1">
                          Current stock ({item.quantityOnHand} {item.unit}) is
                          at or below the reorder level ({item.reorderLevel}{' '}
                          {item.unit})
                        </p>
                      </div>
                    </>
                  )}

                {/* Out of Stock Warning */}
                {item.trackInventory && item.quantityOnHand <= 0 && (
                  <>
                    <Divider className="my-4" />
                    <div className="bg-danger-50 dark:bg-danger-950/30 rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={16} className="text-danger-500" />
                        <p className="text-sm text-danger-700 dark:text-danger-300 font-medium">
                          Out of Stock
                        </p>
                      </div>
                      <p className="text-xs text-danger-600 dark:text-danger-400 mt-1">
                        This item is currently out of stock and needs to be
                        restocked
                      </p>
                    </div>
                  </>
                )}

                {/* Production Action for Produced Items */}
                {isProducedItem && (
                  <>
                    <Divider className="my-4" />
                    <Button
                      fullWidth
                      color="primary"
                      variant="flat"
                      startContent={<Factory size={16} />}
                      onPress={() => setIsProductionDrawerOpen(true)}
                    >
                      Create Production
                    </Button>
                  </>
                )}
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Production Drawer - Shows both template and one-time tabs */}
      {isProducedItem && (
        <CreateProductionDrawer
          isOpen={isProductionDrawerOpen}
          onClose={() => setIsProductionDrawerOpen(false)}
          preselectedOutputItemId={item.id}
        />
      )}
    </>
  );
}
