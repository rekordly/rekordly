// components/modals/DeleteConfirmationModal.tsx
'use client';

import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from '@heroui/react';
import { AlertTriangle } from 'lucide-react';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  title: string;
  description: string;
  itemDetails?: React.ReactNode;
}

export function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
  title,
  description,
  itemDetails,
}: DeleteConfirmationModalProps) {
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
              <div className="flex items-center gap-2">
                <AlertTriangle className="text-danger" size={24} />
                <span>{title}</span>
              </div>
            </ModalHeader>
            <ModalBody>
              <p className="text-sm text-default-600">{description}</p>
              {itemDetails && (
                <div className="mt-3 p-3 bg-default-100 rounded-lg">
                  {itemDetails}
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button isDisabled={isLoading} variant="light" onPress={onClose}>
                Cancel
              </Button>
              <Button color="danger" isLoading={isLoading} onPress={onConfirm}>
                {isLoading ? 'Deleting...' : 'Delete'}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
