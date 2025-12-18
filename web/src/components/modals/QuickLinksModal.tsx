'use client';

import React from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody } from '@heroui/modal';
import { X } from 'lucide-react';
import { QuickLinksGrid } from '@/components/QuickLinksGrid';

interface QuickLinksDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QuickLinksDrawer({ isOpen, onClose }: QuickLinksDrawerProps) {
  return (
    <Modal
      isOpen={isOpen}
      size="2xl"
      placement="center"
      onClose={onClose}
      backdrop="blur"
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1 border-b border-divider pb-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Quick Actions</h3>
          </div>
          <p className="text-xs text-default-500 font-normal">
            Select an action to quickly add records
          </p>
        </ModalHeader>
        <ModalBody className="py-4 max-h-125 overflow-y-auto">
          <QuickLinksGrid
            showSearch={true}
            columns={{ default: 3, sm: 4, md: 5 }}
            onActionComplete={onClose}
          />
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
