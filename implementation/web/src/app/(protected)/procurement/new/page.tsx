import type { Metadata } from "next";

import { PermissionGuard } from "@/components/auth/can";
import { ProcurementFlowForm } from "@/components/features/finance/procurement-flow-form";

export const metadata: Metadata = {
  title: "Procure goods — Rekordly",
  description: "Record goods received into stock, divide transport or extra costs, and record payment.",
};

export default function ProcurementNewRoute() {
  return (
    <PermissionGuard permission="purchases.create">
      <ProcurementFlowForm mode="receipt" />
    </PermissionGuard>
  );
}
