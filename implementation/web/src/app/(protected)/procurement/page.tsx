import { PermissionGuard } from "@/components/auth/can";
import { ProcurementReceiptsListPage } from "@/components/features/finance/procurement-section-pages";

export default function ProcurementRoute() {
  return (
    <PermissionGuard permission="purchases.view">
      <ProcurementReceiptsListPage />
    </PermissionGuard>
  );
}
