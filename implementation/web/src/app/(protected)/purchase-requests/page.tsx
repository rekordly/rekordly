import { PermissionGuard } from "@/components/auth/can";
import { PurchaseRequestsListPage } from "@/components/features/finance/procurement-section-pages";

export default function PurchaseRequestsRoute() {
  return (
    <PermissionGuard permission="purchases.view">
      <PurchaseRequestsListPage />
    </PermissionGuard>
  );
}
