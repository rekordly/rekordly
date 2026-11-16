import { PermissionGuard } from "@/components/auth/can";
import { PurchaseOrdersListPage } from "@/components/features/finance/procurement-section-pages";

export default function PurchaseOrdersRoute() {
  return (
    <PermissionGuard permission="purchases.view">
      <PurchaseOrdersListPage />
    </PermissionGuard>
  );
}
