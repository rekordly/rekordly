'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Trash2, LucideIcon } from 'lucide-react';
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
} from '@heroui/react';
import axios from 'axios';
import { getStatusConfig } from '@/lib/fn';
import { InvoiceCardProps } from '@/types/invoice';

export function InvoiceCard({
  id,
  invoiceNumber,
  title,
  amount,
  customerName,
  date,
  status,
  onDelete,
}: InvoiceCardProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const statusConfig = getStatusConfig(status as any);
  const Icon = statusConfig.icon;

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);

    try {
      await axios.delete(`/api/invoices/${id}`);

      addToast({
        title: 'Success',
        description: 'Invoice deleted successfully',
        color: 'success',
      });
      onClose();

      if (onDelete) {
        onDelete();
      }
    } catch (error) {
      console.error('Error deleting invoice:', error);

      if (axios.isAxiosError(error)) {
        const errorMessage =
          error.response?.data?.message || 'Failed to delete invoice';
        addToast({
          title: 'Error',
          description: errorMessage,
          color: 'danger',
        });
      } else {
        addToast({
          title: 'Error',
          description: 'Failed to delete invoice',
          color: 'danger',
        });
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div
        onClick={() => router.push(`/dashboard/invoice/${invoiceNumber}`)}
        className={`p-4 bg-white dark:bg-background rounded-2xl  mb-3 shadow-sm cursor-pointer`}
      >
        <div className="flex-row flex items-start gap-3 flex-1">
          <Chip
            color={statusConfig.chipColor}
            variant="shadow"
            className={`w-8 h-8 px-0 rounded-full items-center justify-center`}
          >
            {Icon && <Icon size={16} />}
          </Chip>

          <div className="flex-1 min-w-0 ">
            <h3 className="text-[0.9rem] font-medium text-foreground tracking-tight leading-tight truncate">
              {title}
            </h3>
            <div className="flex gap-2 items-center justify-between">
              <p className={`text-xs md:text-xs text-default-500 font-regular`}>
                {amount}
              </p>
              <Chip
                className="p-0 h-auto w-auto"
                color={statusConfig.chipColor}
              >
                <span className="text-[0.6rem] font-light">{status}</span>
              </Chip>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex gap-2 items-center">
                <p className="text-[0.65rem] md:text-xs max-w-1/2 font-light text-default-500 truncate">
                  {customerName}
                </p>
                <p className="text-[0.65rem] min-w-auto inline-block  md:text-xs font-light text-default-500">
                  {date}
                </p>
              </div>

              <div
                className="items-center flex gap-3"
                onClick={e => e.stopPropagation()}
              >
                {/* <Button
              isIconOnly
              size="sm"
              variant="light"
              className="min-w-auto w-auto h-auto"
              onPress={()=>router.push(`/dashboard/invoice/${id}`)}
              aria-label="View invoice"
            >
              <Eye size={18} className="text-default-600" />
            </Button> */}

                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  color="danger"
                  className="min-w-auto w-auto h-auto"
                  onPress={() => onOpen()}
                  aria-label="Delete invoice"
                >
                  Delete
                  {/* <Trash2 size={16} /> */}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        placement="center"
        backdrop="blur"
        size="xs"
        // className="mx-4"
      >
        <ModalContent>
          {onClose => (
            <>
              <ModalHeader className="flex flex-col gap-1 font-heading tracking-tight">
                Delete Invoice
              </ModalHeader>
              <ModalBody>
                <p className="text-sm">
                  Are you sure you want to delete this invoice? This action
                  cannot be undone.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button
                  variant="light"
                  onPress={onClose}
                  isDisabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  color="danger"
                  onPress={handleDeleteConfirm}
                  isLoading={isDeleting}
                >
                  Delete
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
