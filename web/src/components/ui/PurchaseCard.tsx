'use client';

import { useRouter } from 'next/navigation';
import { Trash2, Edit, ShoppingCart, Package } from 'lucide-react';
import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  addToast,
  Chip,
  Tooltip,
} from '@heroui/react';

import { getSaleStatusConfig } from '@/lib/fn';
import { PurchaseCardProps } from '@/types/purchases';
import { usePurchaseStore } from '@/store/purchase-store';

export function PurchaseCard({
  id,
  purchaseNumber,
  title,
  amount,
  vendorName,
  date,
  status,
  onEdit,
}: PurchaseCardProps) {
  const router = useRouter();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { deletePurchase, isDeleting } = usePurchaseStore();

  const statusConfig = getSaleStatusConfig(status as any);
  const Icon = statusConfig.icon;

  const handleDeleteConfirm = async () => {
    try {
      await deletePurchase(id);
      onClose();

      addToast({
        title: 'Success',
        description: 'Purchase deleted successfully',
        color: 'success',
      });
    } catch (error: any) {
      addToast({
        title: 'Error',
        description:
          error?.response?.data?.message || 'Failed to delete purchase',
        color: 'danger',
      });
    }
  };

  const handleEdit = () => {
    if (onEdit) {
      onEdit(id);
    }
  };

  return (
    <>
      <div
        className="group relative bg-white dark:bg-[#010601] dark:border-primary/20 dark:border  rounded-2xl p-4 mb-3 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer border border-transparent hover:border-primary/20"
        onClick={() => router.push(`/dashboard/purchases/${purchaseNumber}`)}
      >
        {/* Top Row: Icon, Purchase Number & Title */}
        <div className="flex items-start gap-3 mb-3">
          <Chip
            className="w-9 h-9 px-0 rounded-xl items-center justify-center flex-shrink-0"
            color={statusConfig.chipColor}
            variant="solid"
          >
            {Icon && <Icon size={16} />}
          </Chip>
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[0.65rem] font-medium text-default-500">
                {purchaseNumber}
              </span>
              <Tooltip content="Purchase" size="sm">
                <div className="flex items-center">
                  <ShoppingCart size={12} className="text-default-400" />
                </div>
              </Tooltip>
            </div>
            <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-tight">
              {title}
            </h3>
          </div>
        </div>

        {/* Amount & Status Row */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-lg font-bold text-foreground">{amount}</p>

          <Chip
            className="h-6 flex-shrink-0"
            color={statusConfig.chipColor}
            size="sm"
            variant="flat"
          >
            <span className="text-[0.65rem] font-medium">{status}</span>
          </Chip>
        </div>

        {/* Footer Row: Vendor & Date & Delete */}
        <div className="flex items-center justify-between pt-3 border-t border-divider">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="flex flex-col gap-0.5 min-w-0">
              <p className="text-[0.65rem] text-default-400 uppercase tracking-wide font-medium">
                Vendor
              </p>
              <p className="text-xs font-medium text-default-700 truncate">
                {vendorName}
              </p>
            </div>

            <div className="flex flex-col gap-0.5 flex-shrink-0">
              <p className="text-[0.65rem] text-default-400 uppercase tracking-wide font-medium">
                Date
              </p>
              <p className="text-xs font-medium text-default-700 whitespace-nowrap">
                {date}
              </p>
            </div>
          </div>

          {/* Edit & Delete Buttons */}
          <div
            className="flex gap-1 flex-shrink-0 ml-2"
            onClick={e => e.stopPropagation()}
          >
            <Button
              isIconOnly
              className="min-w-unit-7 w-unit-7 h-unit-7"
              color="primary"
              size="sm"
              title="Edit purchase"
              variant="light"
              onPress={handleEdit}
              aria-label="Edit purchase"
            >
              <Edit size={16} />
            </Button>
            <Button
              isIconOnly
              aria-label="Delete purchase"
              className="min-w-unit-7 w-unit-7 h-unit-7"
              color="danger"
              size="sm"
              variant="light"
              onPress={onOpen}
            >
              <Trash2 size={16} />
            </Button>
          </div>
        </div>
      </div>

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
                Delete Purchase
              </ModalHeader>
              <ModalBody>
                <p className="text-sm">
                  Are you sure you want to delete this purchase? This action
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
