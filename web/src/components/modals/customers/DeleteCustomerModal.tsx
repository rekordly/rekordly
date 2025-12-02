'use client';

import React from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  addToast,
} from '@heroui/react';
import { AlertTriangle } from 'lucide-react';

import { CustomerType } from '@/types/customer';
import { useCustomerStore } from '@/store/customerStore';

interface DeleteCustomerModalProps {
  customer: CustomerType | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DeleteCustomerModal({
  customer,
  isOpen,
  onClose,
}: DeleteCustomerModalProps) {
  const { deleteCustomer, isDeleting } = useCustomerStore();

  if (!customer) return null;

  const handleDeleteConfirm = async () => {
    try {
      await deleteCustomer(customer.id);
      addToast({
        title: 'Success',
        description: 'Customer deleted successfully',
        color: 'success',
      });
      onClose();
    } catch (error: any) {
      addToast({
        title: 'Error',
        description:
          error?.response?.data?.message || 'Failed to delete customer',
        color: 'danger',
      });
    }
  };

  const hasTransactions =
    (customer._count?.sales || 0) > 0 ||
    (customer._count?.purchases || 0) > 0 ||
    (customer._count?.invoices || 0) > 0;

  return (
    <Modal
      backdrop="blur"
      isOpen={isOpen}
      placement="center"
      size="sm"
      onClose={onClose}
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex flex-col gap-1 font-heading tracking-tight">
              <div className="flex items-center gap-2 text-danger">
                <AlertTriangle className="w-5 h-5" />
                <span>Delete Customer</span>
              </div>
            </ModalHeader>
            <ModalBody>
              <p className="text-sm text-default-600">
                Are you sure you want to delete <strong>{customer.name}</strong>
                ? This action cannot be undone.
              </p>

              <div className="mt-2 p-3 bg-default-100 rounded-lg space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-default-600">Customer ID:</span>
                  <span className="font-medium">
                    {customer.id.substring(0, 12)}...
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-default-600">Type:</span>
                  <span className="font-medium">
                    {customer.customerRole === 'BUYER' ? 'Customer' : 'Vendor'}
                  </span>
                </div>
                {customer.email && (
                  <div className="flex justify-between text-xs">
                    <span className="text-default-600">Email:</span>
                    <span className="font-medium">{customer.email}</span>
                  </div>
                )}
              </div>

              {hasTransactions && (
                <div className="mt-2 p-3 bg-warning-50 dark:bg-warning-900/20 rounded-lg">
                  <p className="text-xs text-warning-700 dark:text-warning-400">
                    <strong>⚠️ Warning:</strong> This customer has existing
                    transactions. Deleting may affect your records.
                  </p>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button isDisabled={isDeleting} variant="light" onPress={onClose}>
                Cancel
              </Button>
              <Button
                color="danger"
                isLoading={isDeleting}
                onPress={handleDeleteConfirm}
              >
                {isDeleting ? 'Deleting...' : 'Delete Customer'}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
