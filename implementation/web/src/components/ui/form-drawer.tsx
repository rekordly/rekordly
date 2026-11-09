"use client";

// The right-hand form drawer from the legacy app, on HeroUI v3.

import { Drawer } from "@heroui/react";
import type { FormEventHandler, ReactNode } from "react";

import { AppButton } from "@/components/ui/app-button";

export interface FormDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Omit when the content brings its own actions. */
  onSubmit?: FormEventHandler<HTMLFormElement>;
  submitLabel?: string;
  isSubmitting?: boolean;
}

export function FormDrawer({
  isOpen,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  submitLabel = "Save",
  isSubmitting = false,
}: FormDrawerProps) {
  return (
    <Drawer>
      <Drawer.Backdrop isOpen={isOpen} onOpenChange={onOpenChange} variant="blur">
        <Drawer.Content placement="right">
          <Drawer.Dialog className="flex h-full w-full max-w-[520px] flex-col bg-overlay p-0">
            <Drawer.Header className="flex flex-col items-start gap-0 px-6 pt-6">
              <Drawer.Heading className="text-[18px] font-bold tracking-[-0.02em] text-foreground">{title}</Drawer.Heading>
              {description ? <p className="mt-1 text-[13px] text-muted">{description}</p> : null}
            </Drawer.Header>
            {onSubmit ? (
              <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
                <Drawer.Body className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">{children}</Drawer.Body>
                <Drawer.Footer className="flex items-center justify-end gap-2 px-6 pt-2 pb-6">
                  <AppButton variant="ghost" label="Cancel" onPress={() => onOpenChange(false)} />
                  <AppButton type="submit" label={submitLabel} isLoading={isSubmitting} />
                </Drawer.Footer>
              </form>
            ) : (
              <Drawer.Body className="flex-1 overflow-y-auto px-6 py-5">{children}</Drawer.Body>
            )}
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}
