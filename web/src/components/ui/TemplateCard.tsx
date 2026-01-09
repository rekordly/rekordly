'use client';

import { Edit, Factory, Package } from 'lucide-react';
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
import { ProductRecipe } from '@/types/production';
import { formatCurrency } from '@/lib/fn';
import { TemplateDetailsModal } from '@/components/modals/TemplateDetailsModal';

interface TemplateCardProps {
  template: ProductRecipe & {
    totalMaterialCost?: number;
    totalCostPerBatch?: number;
    unitCost?: number;
  };
  onEdit: (template: ProductRecipe) => void;
  onDelete: (id: string) => Promise<void>;
  isDeleting: boolean;
}

const formatCategory = (category: string | null | undefined): string => {
  if (!category) return 'Uncategorized';
  return category
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
};

export function TemplateCard({
  template,
  onEdit,
  onDelete,
  isDeleting,
}: TemplateCardProps) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [viewModalOpen, setViewModalOpen] = useState(false);

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(template);
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
      await onDelete(template.id);
      onClose();
    } catch (error: any) {
      addToast({
        title: 'Error',
        description:
          error?.response?.data?.message || 'Failed to delete template',
        color: 'danger',
      });
    }
  };

  const displayImage = template.recipeImage || '';
  const unitCost = template.unitCost || 0;

  return (
    <>
      <div
        className="group relative bg-white dark:bg-[#010601] dark:border-primary/20 dark:border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 border border-transparent hover:border-primary/20 cursor-pointer"
        onClick={handleCardClick}
      >
        {/* Image Section */}
        <div className="relative w-full h-48 bg-default-100">
          {displayImage ? (
            <img
              src={displayImage}
              alt={template.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-16 h-16 text-default-300" />
            </div>
          )}

          {/* Status Badge - Top Left */}
          <div className="absolute top-3 left-3">
            <Chip
              size="sm"
              color={template.isActive ? 'success' : 'default'}
              variant="solid"
              className="text-xs font-medium"
            >
              {template.isActive ? 'Active' : 'Inactive'}
            </Chip>
          </div>

          {/* Materials Count - Bottom Right */}
          <div className="absolute bottom-3 right-3">
            <div className="bg-white/90 dark:bg-default-900/90 backdrop-blur-sm px-2 py-1 rounded-lg">
              <span className="text-xs font-medium text-foreground">
                {template.ingredients?.length || 0} materials
              </span>
            </div>
          </div>
        </div>

        {/* Content Section */}
        <div className="p-3">
          {/* Category */}
          <div className="flex items-center justify-between mb-2">
            <Chip size="sm" variant="flat" className="text-[0.65rem] h-5">
              {formatCategory(template.category)}
            </Chip>
          </div>

          {/* Template Name */}
          <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-tight mb-2">
            {template.name}
          </h3>

          {/* Output & Cost Row */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex flex-col">
              <p className="text-xs text-default-500">Makes</p>
              <p className="text-sm font-bold text-foreground">
                {template.outputQuantity}{' '}
                {(template as any).outputInventory?.unit || 'unit'}(s)
              </p>
            </div>
            <div className="flex flex-col items-end">
              <p className="text-xs text-default-500">Cost/unit</p>
              <p className="text-sm font-bold text-primary">
                {formatCurrency(unitCost)}
              </p>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex gap-2 pt-2 border-t border-default-200">
            <Button
              isIconOnly
              size="sm"
              color="primary"
              variant="light"
              onClick={handleEdit}
            >
              <Edit size={14} />
            </Button>
          </div>
        </div>
      </div>

      {/* View Details Modal */}
      <TemplateDetailsModal
        template={template}
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
                Delete Product Template
              </ModalHeader>
              <ModalBody>
                <p className="text-sm">
                  Are you sure you want to delete this template? This action
                  cannot be undone. Productions using this template will not be
                  affected.
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
