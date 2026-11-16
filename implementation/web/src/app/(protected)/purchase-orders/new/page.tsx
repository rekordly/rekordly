import type { Metadata } from "next";

import { PermissionGuard } from "@/components/auth/can";
import { ProcurementFlowForm } from "@/components/features/finance/procurement-flow-form";

export const metadata: Metadata = {
  title: "New purchase order — Rekordly",
  description: "Send an order to a supplier with items, delivery date, and extra costs.",
};

export default function PurchaseOrderNewRoute() {
  return (
    <PermissionGuard permission="purchases.create">
      <ProcurementFlowForm mode="order" />
    </PermissionGuard>
  );
}
