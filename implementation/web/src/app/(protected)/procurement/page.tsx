import { PermissionGuard } from "@/components/auth/can";
import { ProcurementPage } from "@/components/features/finance/procurement-page";

export default function ProcurementRoute() {
  return (
    <PermissionGuard permission="purchases.view">
      <ProcurementPage />
    </PermissionGuard>
  );
}
