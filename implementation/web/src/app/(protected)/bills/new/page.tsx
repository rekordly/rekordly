import type { Metadata } from "next";

import { PermissionGuard } from "@/components/auth/can";
import { ProcurementFlowForm } from "@/components/features/finance/procurement-flow-form";

export const metadata: Metadata = {
  title: "New supplier bill — Rekordly",
  description: "Record a supplier invoice or bill, match it to a PO or receipt, and record payment.",
};

export default function BillNewRoute() {
  return (
    <PermissionGuard permission="purchases.create">
      <ProcurementFlowForm mode="bill" />
    </PermissionGuard>
  );
}
