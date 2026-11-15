"use client";

// A side sheet: a drawer on the right on large screens, a bottom sheet on phones.
// Use it for quick, focused tasks that should not leave the page (Change price, …).
//
//   <SideSheet isOpen={open} onClose={close} title="Change price" description="Ankara shirt"
//     footer={<><AppButton variant="ghost" label="Cancel" /> <AppButton label="Save" /></>}>
//     …fields…
//   </SideSheet>

import { Drawer } from "@heroui/react";
import { X } from "@phosphor-icons/react";
import { useSyncExternalStore, type ReactNode } from "react";

const wideQuery = "(min-width: 768px)";
function subscribeWide(callback: () => void) {
  const list = window.matchMedia(wideQuery);
  list.addEventListener("change", callback);
  return () => list.removeEventListener("change", callback);
}

/** True on tablets and larger (768px and up). */
export function useIsWide() {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(wideQuery).matches, () => true);
}

export function SideSheet({
  isOpen,
  onClose,
  title,
  description,
  footer,
  children,
  width = "max-w-[520px]",
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  const wide = useIsWide();
  if (!isOpen) return null;
  return (
    <Drawer>
      <Drawer.Backdrop isOpen onOpenChange={(open) => !open && onClose()} variant="blur">
        <Drawer.Content placement={wide ? "right" : "bottom"}>
          <Drawer.Dialog className={`flex flex-col bg-overlay p-0 ${wide ? `animate-drawer-in h-full w-full ${width}` : "animate-sheet-up max-h-[92dvh] w-full rounded-t-3xl"}`}>
            {!wide ? <span aria-hidden="true" className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-default" /> : null}
            <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5">
              <div className="min-w-0">
                <Drawer.Heading className="truncate text-[18px] font-bold tracking-[-0.02em]">{title}</Drawer.Heading>
                {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
              </div>
              <button type="button" aria-label="Close" onClick={onClose} className="-mt-1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-foreground">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
            {footer ? <div className="flex shrink-0 items-center justify-end gap-2 border-t border-separator px-5 py-4">{footer}</div> : null}
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}
