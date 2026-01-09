'use client';

import React from 'react';
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
  Calendar,
  Tag,
  Boxes,
  DollarSign,
  Factory,
  CheckCircle,
} from 'lucide-react';
import { Production } from '@/types/production';
import { formatCurrency } from '@/lib/fn';
import { PRODUCTION_STATUS_COLORS } from '@/config/production-constants';

interface ProductionDetailsModalProps {
  production: Production | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (production: Production) => void;
  onDelete: (production: Production) => void;
}

const getStatusColor = (
  status: string
): 'default' | 'primary' | 'success' | 'warning' | 'danger' => {
  return (PRODUCTION_STATUS_COLORS as any)[status] || 'default';
};

const formatDate = (date: Date | string): string => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatStatus = (status: string): string => {
  return status
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
};

export function ProductionDetailsModal({
  production,
  isOpen,
  onClose,
  onEdit,
  onDelete,
}: ProductionDetailsModalProps) {
  if (!production) return null;

  const canEdit = production.status !== 'COMPLETED';
  const canDelete = production.status !== 'COMPLETED';

  return (
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
                  <Chip
                    className="h-6"
                    color={getStatusColor(production.status)}
                    size="sm"
                    variant="flat"
                  >
                    <span className="text-xs font-medium">
                      {formatStatus(production.status)}
                    </span>
                  </Chip>

                  {production.recipeId && (
                    <Chip
                      className="h-6"
                      color="primary"
                      size="sm"
                      variant="flat"
                    >
                      <span className="text-xs font-medium">From Template</span>
                    </Chip>
                  )}
                </div>
                <h3 className="text-lg font-semibold">
                  {production.outputItemName}
                </h3>
                <p className="text-sm text-default-500 font-normal mt-0.5">
                  {production.productionNumber}
                </p>
              </div>

              {/* Action Icons */}
              <div className="flex items-center gap-2">
                {canEdit && (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    onPress={() => {
                      onEdit(production);
                      onClose();
                    }}
                    aria-label="Edit production"
                  >
                    <Edit size={18} />
                  </Button>
                )}
                {canDelete && (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    color="danger"
                    onPress={() => {
                      onDelete(production);
                      onClose();
                    }}
                    aria-label="Delete production"
                  >
                    <Trash2 size={18} />
                  </Button>
                )}
              </div>
            </ModalHeader>

            <ModalBody>
              {/* Image */}
              {production.outputImage && (
                <div className="mb-4">
                  <div className="w-full h-48 rounded-lg overflow-hidden bg-default-100">
                    <img
                      src={production.outputImage}
                      alt={production.outputItemName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}

              {/* Title & Description */}
              {production.title && (
                <>
                  <div className="mb-4">
                    <p className="text-sm text-default-500 mb-1">Title</p>
                    <p className="text-sm font-medium">{production.title}</p>
                  </div>
                </>
              )}

              {production.description && (
                <>
                  <div className="mb-4">
                    <p className="text-sm text-default-500 mb-1">Description</p>
                    <p className="text-sm leading-relaxed">
                      {production.description}
                    </p>
                  </div>
                  <Divider className="mb-4" />
                </>
              )}

              {/* Details Grid */}
              <div className="space-y-4">
                {/* Production Date */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                    <Calendar size={18} className="text-default-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-default-500">Production Date</p>
                    <p className="text-sm font-medium">
                      {formatDate(production.productionDate)}
                    </p>
                  </div>
                </div>

                {/* Template Used */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-default-100 dark:bg-default-50 flex items-center justify-center shrink-0">
                    <Factory size={18} className="text-default-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-default-500">Template Used</p>
                    <p className="text-sm font-medium">
                      {production.recipeId ? (
                        (production as any).recipe?.name || 'Yes'
                      ) : (
                        <span className="text-default-400">
                          One-time Production
                        </span>
                      )}
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
                      Quantity Produced
                    </p>
                    <p className="text-sm font-medium">
                      {production.outputQuantity}{' '}
                      {(production as any).outputInventory?.unit || 'unit'}(s)
                    </p>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-default-500">Batch Multiplier</p>
                    <p className="text-sm font-medium">
                      {production.batchMultiplier}x
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
                      {formatCurrency(production.unitCost)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Materials Used */}
              {production.inputs && production.inputs.length > 0 && (
                <>
                  <Divider className="my-4" />
                  <div>
                    <p className="text-sm text-default-500 mb-3">
                      Materials Used ({production.inputs.length})
                    </p>
                    <div className="space-y-2">
                      {production.inputs.map((input: any) => (
                        <div
                          key={input.id}
                          className="flex justify-between items-center p-3 bg-default-50 dark:bg-default-100/50 rounded-lg"
                        >
                          <div className="flex-1">
                            <p className="text-sm font-medium">
                              {input.inventoryItem?.name || 'Material'}
                            </p>
                            {input.notes && (
                              <p className="text-xs text-default-500 mt-0.5">
                                {input.notes}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">
                              {input.quantity}{' '}
                              {input.inventoryItem?.unit || 'unit'}
                            </p>
                            <p className="text-xs text-default-500">
                              {formatCurrency(input.totalCost)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Cost Summary - Like Production Drawer */}
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
                      {formatCurrency(production.materialsCost)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-default-600">Labor:</span>
                    <span className="font-medium">
                      {formatCurrency(production.laborCost)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-default-600">Overhead:</span>
                    <span className="font-medium">
                      {formatCurrency(production.overheadCost)}
                    </span>
                  </div>
                  <div className="h-px bg-default-200 my-2" />
                  <div className="flex justify-between text-base font-bold">
                    <span>Total Cost:</span>
                    <span className="text-green-600">
                      {formatCurrency(production.totalCost)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-default-600">Cost/Unit:</span>
                    <span className="font-semibold text-primary">
                      {formatCurrency(production.unitCost)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {production.notes && (
                <>
                  <Divider className="my-4" />
                  <div>
                    <p className="text-xs text-default-500 mb-2">Notes</p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {production.notes}
                    </p>
                  </div>
                </>
              )}

              {/* Cannot Edit Warning */}
              {!canEdit && (
                <>
                  <Divider className="my-4" />
                  <div className="bg-warning-50 dark:bg-warning-950/30 rounded-lg p-3">
                    <p className="text-sm text-warning-700 dark:text-warning-300">
                      ℹ️ Completed productions cannot be edited or deleted as
                      inventory has already been adjusted.
                    </p>
                  </div>
                </>
              )}
            </ModalBody>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
