'use client';

import { Package, Edit, AlertTriangle } from 'lucide-react';
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
import { InventoryItem } from '@/types/inventory';
import { formatCurrency } from '@/lib/fn';
import { InventoryDetailsModal } from '@/components/modals/InventoryDetailsModal';

interface InventoryCardProps {
  item: InventoryItem;
  onEdit: (item: InventoryItem) => void;
  onDelete: (id: string) => Promise<void>;
  isDeleting: boolean;
  variant?: 'full' | 'minimal';
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

export function InventoryCard({
  item,
  onEdit,
  onDelete,
  isDeleting,
  variant = 'full',
}: InventoryCardProps) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [viewModalOpen, setViewModalOpen] = useState(false);

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(item);
  };

  const handleCardClick = () => {
    setViewModalOpen(true);
  };

  const handleDeleteClick = () => {
    setViewModalOpen(false);
    onOpen();
  };

  const handleDeleteConfirm = async () => {
    try {
      await onDelete(item.id);
      onClose();
    } catch (error: any) {
      addToast({
        title: 'Error',
        description:
          error?.response?.data?.message || 'Failed to delete inventory item',
        color: 'danger',
      });
    }
  };

  const displayImage = item.storefrontImage || '';
  const statusColor = getStatusColor(item);
  const statusText = getStatusText(item);

  return (
    <>
      <div
        className="group relative bg-white dark:bg-[#010601] dark:border-primary/20 dark:border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 border border-transparent hover:border-primary/20 cursor-pointer"
        onClick={handleCardClick}
      >
        {/* Image Section */}
        <div className="relative w-full h-48 bg-default-100">
          {displayImage && (
            <img
              src={displayImage}
              alt={item.name}
              className="w-full h-full object-cover"
            />
          )}

          {/* Status Badge - Top Left */}
          <div className="absolute top-3 left-3">
            <Chip
              size="sm"
              color={statusColor}
              variant="solid"
              className="text-xs font-medium"
            >
              {statusText}
            </Chip>
          </div>

          {/* Low Stock Warning */}
          {item.trackInventory &&
            item.reorderLevel &&
            item.quantityOnHand <= item.reorderLevel &&
            item.quantityOnHand > 0 && (
              <div className="absolute bottom-3 left-3 right-3">
                <div className="bg-danger-500/90 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1">
                  <AlertTriangle size={12} />
                  <span>Reorder at {item.reorderLevel}</span>
                </div>
              </div>
            )}
        </div>

        {/* Content Section */}
        <div className="p-3">
          {/* SKU & Item Type */}
          <div className="flex items-center justify-between">
            <span className="text-[0.65rem] font-medium text-default-400 uppercase tracking-wide">
              {item.sku || 'No SKU'}
            </span>
            <Chip size="sm" variant="flat" className="text-[0.65rem] h-5">
              {formatItemType(item.itemType)}
            </Chip>
          </div>

          {/* Item Name */}
          <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-tight mb-2">
            {item.name}
          </h3>

          {/* Price Row with Edit Icon */}
          <div className="flex items-start justify-between">
            <div className="flex flex-col ">
              <p className="text-lg leading-5 font-bold text-foreground ">
                {item.sellingPrice ? formatCurrency(item.sellingPrice) : '-'}
              </p>
              <span className="text-[0.65rem] text-default-500">
                {item.quantityOnHand} {item.unit} on hand
              </span>
            </div>

            {/* Edit Icon */}
            <Button
              isIconOnly
              className="min-w-unit-7 w-unit-7 h-unit-7"
              color="primary"
              size="sm"
              variant="light"
              onClick={handleEdit}
              aria-label="Edit item"
            >
              <Edit size={14} />
            </Button>
          </div>
        </div>
      </div>

      {/* View Details Modal */}
      <InventoryDetailsModal
        item={item}
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
                Delete Inventory Item
              </ModalHeader>
              <ModalBody>
                <p className="text-sm">
                  Are you sure you want to delete? This action cannot be undone
                  and will remove all associated stock adjustment records.
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
