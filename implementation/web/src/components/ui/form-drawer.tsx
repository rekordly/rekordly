"use client";

// The one shell for small and medium forms.
// Desktop: a centered modal. Phone: a bottom sheet with a grab handle.
// Header (title, one line of help, close), optional step bar, a scrolling body,
// and a sticky footer with Cancel and one primary action.
// Large records (sales, purchases) use FormPage instead.

import { Modal } from "@heroui/react";
import { X } from "@phosphor-icons/react";
import { useSyncExternalStore, type FormEventHandler, type ReactNode } from "react";

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
  /** md ≈ 480px for most forms, lg ≈ 560px for long ones with items. */
  size?: "md" | "lg";
  /** Shows a step bar above the title for multi-step forms. */
  step?: { current: number; total: number; labels?: string[] };
}

const WIDTH = { md: "sm:max-w-[480px]", lg: "sm:max-w-[560px]" } as const;

const query = "(min-width: 640px)";
function subscribe(callback: () => void) {
  const list = window.matchMedia(query);
  list.addEventListener("change", callback);
  return () => list.removeEventListener("change", callback);
}

/** True on tablets and desktops; phones get a bottom sheet. */
function useIsWide() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => true,
  );
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
  size = "md",
  step,
}: FormDrawerProps) {
  const wide = useIsWide();

  const header = (
    <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
      <div className="min-w-0">
        {step ? (
          <div className="mb-3 flex items-center gap-3">
            <div className="flex gap-1">
              {Array.from({ length: step.total }).map((_, index) => (
                <span
                  key={index}
                  className={`h-1.5 rounded-full transition-all duration-300 ${index < step.current ? "w-6 bg-primary" : "w-3 bg-default"}`}
                />
              ))}
            </div>
            <span className="text-[12px] font-medium text-muted tabular">
              Step {step.current} of {step.total}
              {step.labels?.[step.current - 1] ? ` · ${step.labels[step.current - 1]}` : ""}
            </span>
          </div>
        ) : null}
        <Modal.Heading className="text-[18px] leading-tight font-bold tracking-[-0.02em] text-foreground">{title}</Modal.Heading>
        {description ? <p className="mt-1 text-[13px] text-muted">{description}</p> : null}
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={() => onOpenChange(false)}
        className="-mt-1 -mr-1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );

  const body = <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>;

  return (
    <Modal>
      <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange} variant="blur">
        <Modal.Container placement={wide ? "center" : "bottom"} size="md" className={wide ? "" : "items-end p-0"}>
          <Modal.Dialog
            className={`flex w-full flex-col bg-overlay p-0 ${
              wide
                ? `animate-form-in max-h-[88vh] rounded-3xl ${WIDTH[size]}`
                : "animate-sheet-up max-h-[92dvh] max-w-none rounded-t-3xl rounded-b-none"
            }`}
          >
            {!wide ? <span aria-hidden="true" className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-default" /> : null}
            {header}
            {onSubmit ? (
              <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
                {body}
                <div className="flex shrink-0 items-center justify-end gap-2 border-t border-separator px-5 py-4 sm:px-6">
                  <AppButton variant="ghost" label="Cancel" className="max-sm:flex-1" onPress={() => onOpenChange(false)} />
                  <AppButton type="submit" label={submitLabel} isLoading={isSubmitting} className="max-sm:flex-[2]" />
                </div>
              </form>
            ) : (
              body
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
