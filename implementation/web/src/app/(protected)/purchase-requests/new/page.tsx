import type { Metadata } from "next";

import { PermissionGuard } from "@/components/auth/can";
import { ProcurementFlowForm } from "@/components/features/finance/procurement-flow-form";

export const metadata: Metadata = {
  title: "New purchase request — Rekordly",
  description: "Request items or stock needed, set priority, when needed, and reason.",
};

export default function PurchaseRequestNewRoute() {
  return (
    <PermissionGuard permission="purchases.create">
      <ProcurementFlowForm mode="request" />
    </PermissionGuard>
  );
}
