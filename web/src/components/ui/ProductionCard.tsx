'use client';

import { Edit, Calendar, Package } from 'lucide-react';
import {
  Chip,
  Button,
  useDisclosure,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  addToast,
} from '@heroui/react';
import { useState } from 'react';
import { Production } from '@/types/production';
import { formatCurrency } from '@/lib/fn';
import { PRODUCTION_STATUS_COLORS } from '@/config/production-constants';
import { ProductionDetailsModal } from '@/components/modals/ProductionDetailsModal';

interface ProductionCardProps {
  production: Production;
  onEdit: (production: Production) => void;
  onDelete: (id: string) => Promise<void>;
  isDeleting: boolean;
}

const getStatusColor = (
  status: string
): 'default' | 'primary' | 'success' | 'warning' | 'danger' => {
  return (PRODUCTION_STATUS_COLORS as any)[status] || 'default';
};

const formatDate = (date: Date | string): string => {
  return new Date(date).toLocaleDateString('en-US', {
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

export function ProductionCard({
  production,
  onEdit,
  onDelete,
  isDeleting,
}: ProductionCardProps) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [viewModalOpen, setViewModalOpen] = useState(false);

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (production.status !== 'COMPLETED') {
      onEdit(production);
    } else {
      addToast({
        title: 'Cannot Edit',
        description: 'Completed productions cannot be edited',
        color: 'warning',
      });
    }
  };

  const handleCardClick = () => {
    setViewModalOpen(true);
  };

  const handleDeleteClick = () => {
    if (production.status === 'COMPLETED') {
      addToast({
        title: 'Cannot Delete',
        description:
          'Cannot delete completed production. Inventory has already been adjusted.',
        color: 'warning',
      });
      return;
    }
    setViewModalOpen(false);
    onOpen();
  };

  const handleDeleteConfirm = async () => {
    try {
      await onDelete(production.id);
      onClose();
    } catch (error: any) {
      addToast({
        title: 'Error',
        description:
          error?.response?.data?.message || 'Failed to delete production',
        color: 'danger',
      });
    }
  };

  const displayImage = production.outputImage || '';
  const canEdit = production.status !== 'COMPLETED';

  return (
    <>
      <div
        className="group relative bg-white dark:bg-black border border-default-200 dark:border-default-800 rounded-lg overflow-hidden hover:border-default-300 dark:hover:border-default-700 transition-colors cursor-pointer"
        onClick={handleCardClick}
      >
        {/* Image Section */}
        <div className="relative w-full h-32 bg-default-50 dark:bg-default-900">
          {displayImage ? (
            <img
              src={displayImage}
              alt={production.outputItemName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-12 h-12 text-default-300" />
            </div>
          )}

          {/* Edit Icon */}
          {canEdit && (
            <Button
              isIconOnly
              className="absolute top-2 right-2 min-w-6 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
              color="default"
              size="sm"
              variant="flat"
              onClick={handleEdit}
              aria-label="Edit"
            >
              <Edit size={12} />
            </Button>
          )}
        </div>

        {/* Content Section */}
        <div className="p-3 space-y-2">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-medium text-foreground line-clamp-1 flex-1">
              {production.outputItemName}
            </h3>
            <Chip
              size="sm"
              color={getStatusColor(production.status)}
              variant="flat"
              className="text-xs h-5"
            >
              {formatStatus(production.status)}
            </Chip>
          </div>

          {/* Metrics */}
          <div className="flex items-center justify-between text-xs">
            <div>
              <span className="text-default-400">Cost: </span>
              <span className="font-medium text-foreground">
                {formatCurrency(production.totalCost)}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between text-xs text-default-400 pt-1 border-t border-default-100 dark:border-default-800">
            <span className="flex items-center gap-1">
              <Calendar size={10} />
              {formatDate(production.productionDate)}
            </span>
            {/* <span>{production.productionNumber}</span> */}
            <div>
              <span className="text-default-400">Qty: </span>
              <span className="font-medium text-foreground">
                {production.outputQuantity}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* View Details Modal */}
      <ProductionDetailsModal
        production={production}
        isOpen={viewModalOpen}
        onClose={() => setViewModalOpen(false)}
        onEdit={onEdit}
        onDelete={handleDeleteClick}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        backdrop="blur"
        isOpen={isOpen}
        placement="center"
        size="xs"
        onClose={onClose}
      >
        <ModalContent>
          {onClose => (
            <>
              <ModalHeader className="flex flex-col gap-1 font-heading tracking-tight">
                Delete Production
              </ModalHeader>
              <ModalBody>
                <p className="text-sm">
                  Are you sure you want to delete this production? This action
                  cannot be undone.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button
                  isDisabled={isDeleting}
                  variant="light"
                  onPress={onClose}
                >
                  Cancel
                </Button>
                <Button
                  color="danger"
                  isLoading={isDeleting}
                  onPress={handleDeleteConfirm}
                >
                  {isDeleting ? 'Deleting' : 'Delete'}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
