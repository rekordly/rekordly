"use client";

// Confirmation for delete, void and other actions that cannot be undone.

import { AlertDialog } from "@heroui/react";
import type { ReactNode } from "react";

import { AppButton } from "@/components/ui/app-button";

export interface ConfirmDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  isLoading?: boolean;
  isDanger?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  confirmLabel,
  isLoading = false,
  isDanger = true,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog>
      <AlertDialog.Backdrop isOpen={isOpen} onOpenChange={onOpenChange} variant="blur">
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog className="rounded-3xl bg-overlay p-6">
            <AlertDialog.Header className="p-0">
              <AlertDialog.Heading className="text-[18px] font-bold tracking-[-0.02em] text-foreground">{title}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="mt-1 p-0 text-[13px] text-muted">{description}</AlertDialog.Body>
            <AlertDialog.Footer className="mt-5 flex justify-end gap-2 p-0">
              <AppButton variant="ghost" label="Keep it" onPress={() => onOpenChange(false)} />
              <AppButton variant={isDanger ? "danger" : "primary"} label={confirmLabel} isLoading={isLoading} onPress={onConfirm} />
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}
