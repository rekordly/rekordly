import type { Metadata } from "next";

import { PermissionGuard } from "@/components/auth/can";
import { ProcurementFlowForm } from "@/components/features/finance/procurement-flow-form";

export const metadata: Metadata = {
  title: "Record a purchase — Rekordly",
  description: "What you bought, from whom, extra costs, and how you paid.",
};

export default function Page() {
  return (
    <PermissionGuard permission="purchases.create">
      <ProcurementFlowForm mode="purchase" />
    </PermissionGuard>
  );
}
