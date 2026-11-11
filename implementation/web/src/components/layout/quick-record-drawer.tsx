"use client";

import { FormDrawer } from "@/components/ui/form-drawer";
import { MoneyCaptureForm } from "@/components/features/money-capture-form";
import { useUIStore } from "@/stores/ui-store";

/**
 * The primary cash-record flow is available from every protected screen.
 * Opening it is client state, so the current page and its filters do not change.
 */
export function QuickRecordDrawer() {
  const direction = useUIStore((state) => state.moneyRecordDirection);
  const close = useUIStore((state) => state.closeMoneyRecord);
  const isOpen = direction !== null;

  return (
    <FormDrawer
      isOpen={isOpen}
      onOpenChange={(open) => !open && close()}
      title="Add record"
      description="Record money in, money out, or a transfer without leaving this page."
    >
      <MoneyCaptureForm bare initialDirection={direction ?? "money_out"} onCreated={close} onCancel={close} />
    </FormDrawer>
  );
}
