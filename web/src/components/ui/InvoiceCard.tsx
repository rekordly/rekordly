'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
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
import { getStatusConfig } from '@/lib/fn';
import { InvoiceCardProps } from '@/types/invoice';
import { useApi } from '@/hooks/useApi';

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
  const { isOpen, onOpen, onClose } = useDisclosure();

  const statusConfig = getStatusConfig(status as any);
  const Icon = statusConfig.icon;

  const { delete: deleteInvoice, isLoading: isDeleting } = useApi({
    addToast,
    onSuccess: () => {
      onClose();
      if (onDelete) {
        onDelete();
      }
    },
  });

  const handleDeleteConfirm = async () => {
    await deleteInvoice(`/api/invoices/${id}`);
  };

  return (
    <>
      <div
        onClick={() => router.push(`/dashboard/invoice/${invoiceNumber}`)}
        className="group relative bg-white dark:bg-background rounded-2xl p-4 mb-3 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer border border-transparent hover:border-primary/20"
      >
        {/* Top Row: Icon, Invoice Number & Title */}
        <div className="flex items-start gap-3 mb-3">
          <Chip
            color={statusConfig.chipColor}
            variant="solid"
            className="w-9 h-9 px-0 rounded-xl items-center justify-center flex-shrink-0"
          >
            {Icon && <Icon size={16} />}
          </Chip>
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <span className="text-[0.65rem] font-medium text-default-500">
              {invoiceNumber}
            </span>
            <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-tight">
              {title}
            </h3>
          </div>
        </div>

        {/* Amount & Status Row */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-lg font-bold text-foreground">{amount}</p>

          <Chip
            color={statusConfig.chipColor}
            variant="flat"
            size="sm"
            className="h-6 flex-shrink-0"
          >
            <span className="text-[0.65rem] font-medium">{status}</span>
          </Chip>
        </div>

        {/* Footer Row: Customer & Date & Delete */}
        <div className="flex items-center justify-between pt-3 border-t border-divider">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="flex flex-col gap-0.5 min-w-0">
              <p className="text-[0.65rem] text-default-400 uppercase tracking-wide font-medium">
                Customer
              </p>
              <p className="text-xs font-medium text-default-700 truncate">
                {customerName}
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

          {/* Delete Button */}
          <div
            className="flex-shrink-0 ml-2"
            onClick={e => e.stopPropagation()}
          >
            <Button
              isIconOnly
              size="sm"
              variant="light"
              color="danger"
              className="min-w-unit-7 w-unit-7 h-unit-7"
              onPress={onOpen}
              aria-label="Delete invoice"
            >
              <Trash2 size={16} />
            </Button>
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
