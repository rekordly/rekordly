'use client';

import React, { useState } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Divider,
  Chip,
} from '@heroui/react';
import {
  Package,
  Edit,
  Trash2,
  Boxes,
  DollarSign,
  Factory,
  CheckCircle,
} from 'lucide-react';
import { ProductRecipe } from '@/types/production';
import { formatCurrency } from '@/lib/fn';
import { CreateProductionDrawer } from '@/components/drawer/CreateProductionDrawer';

interface TemplateDetailsModalProps {
  template:
    | (ProductRecipe & {
        totalMaterialCost?: number;
        totalCostPerBatch?: number;
        unitCost?: number;
      })
    | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (template: ProductRecipe) => void;
  onDelete: (template: ProductRecipe) => void;
}

const formatCategory = (category: string | null | undefined): string => {
  if (!category) return 'Uncategorized';
  return category
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
};

export function TemplateDetailsModal({
  template,
  isOpen,
  onClose,
  onEdit,
  onDelete,
}: TemplateDetailsModalProps) {
  const [isProductionDrawerOpen, setIsProductionDrawerOpen] = useState(false);

  if (!template) return null;

  const materialCost = template.totalMaterialCost || 0;
  const unitCost = template.unitCost || 0;

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
                        {formatCategory(template.category)}
                      </span>
                    </Chip>

                    <Chip
                      className="h-6"
                      color={template.isActive ? 'success' : 'default'}
                      size="sm"
                      variant="flat"
                    >
                      <span className="text-xs font-medium">
                        {template.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </Chip>
                  </div>
                  <h3 className="text-lg font-semibold">{template.name}</h3>
                  <p className="text-sm text-default-500 font-normal mt-0.5">
                    {template.ingredients?.length || 0} materials
                  </p>
                </div>

                {/* Action Icons */}
                <div className="flex items-center gap-2">
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    onPress={() => {
                      onEdit(template);
                      onClose();
                    }}
                    aria-label="Edit template"
                  >
                    <Edit size={18} />
                  </Button>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    color="danger"
                    onPress={() => {
                      onDelete(template);
                      onClose();
                    }}
                    aria-label="Delete template"
                  >
                    <Trash2 size={18} />
                  </Button>
                </div>
              </ModalHeader>

              <ModalBody>
                {/* Image */}
                {template.recipeImage && (
                  <div className="mb-4">
                    <div className="w-full h-48 rounded-lg overflow-hidden bg-default-100">
                      <img
                        src={template.recipeImage}
                        alt={template.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                )}

                {/* Description */}
                {template.description && (
                  <>
                    <div className="mb-4">
                      <p className="text-sm text-default-500 mb-1">
                        Description
                      </p>
                      <p className="text-sm leading-relaxed">
                        {template.description}
                      </p>
                    </div>
                    <Divider className="mb-4" />
                  </>
                )}

                {/* Details Grid */}
                <div className="space-y-4">
                  {/* Output Product */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                      <Package size={18} className="text-default-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-default-500">Output Product</p>
                      <p className="text-sm font-medium">
                        {(template as any).outputInventory?.name || 'N/A'}
                      </p>
                    </div>
                  </div>

                  {/* Output Quantity */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                      <Boxes size={18} className="text-default-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-default-500">
                        Makes per Batch
                      </p>
                      <p className="text-sm font-medium">
                        {template.outputQuantity}{' '}
                        {(template as any).outputInventory?.unit || 'unit'}(s)
                      </p>
                    </div>
                  </div>

                  {/* Unit Cost */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                      <DollarSign size={18} className="text-default-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-default-500">Cost per Unit</p>
                      <p className="text-sm font-medium text-primary">
                        {formatCurrency(unitCost)}
                      </p>
                    </div>
                  </div>
                </div>

                <Divider className="my-4" />

                {/* Materials List */}
                <div>
                  <p className="text-sm text-default-500 mb-3">
                    Materials ({template.ingredients?.length || 0})
                  </p>
                  <div className="space-y-2">
                    {template.ingredients?.map((ing: any) => (
                      <div
                        key={ing.id}
                        className="flex justify-between items-center p-3 bg-default-50 dark:bg-default-100/50 rounded-lg"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            {ing.inventoryItem?.name}
                          </p>
                          {ing.notes && (
                            <p className="text-xs text-default-500 mt-0.5">
                              {ing.notes}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            {ing.quantity} {ing.inventoryItem?.unit}
                          </p>
                          <p className="text-xs text-default-500">
                            {formatCurrency(
                              ing.quantity *
                                (ing.inventoryItem?.averageCost || 0)
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cost Summary */}
                <Divider className="my-4" />
                <div className="bg-linear-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <h4 className="text-base font-semibold flex items-center gap-2 mb-3">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    Cost Summary
                  </h4>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-default-600">Materials:</span>
                      <span className="font-medium">
                        {formatCurrency(materialCost)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-default-600">Labor:</span>
                      <span className="font-medium">
                        {formatCurrency(template.defaultLaborCost)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-default-600">Overhead:</span>
                      <span className="font-medium">
                        {formatCurrency(template.defaultOverheadCost)}
                      </span>
                    </div>
                    <div className="h-px bg-default-200 my-2" />
                    <div className="flex justify-between text-base font-bold">
                      <span>Total Cost/Batch:</span>
                      <span className="text-green-600">
                        {formatCurrency(template.totalCostPerBatch || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-default-600">Cost/Unit:</span>
                      <span className="font-semibold text-primary">
                        {formatCurrency(unitCost)}
                      </span>
                    </div>
                  </div>
                </div>
              </ModalBody>

              <ModalFooter>
                <Button
                  fullWidth
                  color="primary"
                  size="lg"
                  startContent={<Factory size={18} />}
                  onPress={() => setIsProductionDrawerOpen(true)}
                >
                  Start Production
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Production Drawer */}
      <CreateProductionDrawer
        isOpen={isProductionDrawerOpen}
        onClose={() => setIsProductionDrawerOpen(false)}
        preselectedTemplateId={template.id}
      />
    </>
  );
}
