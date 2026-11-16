import { PermissionGuard } from "@/components/auth/can";
import { SupplierBillsListPage } from "@/components/features/finance/procurement-section-pages";

export default function BillsRoute() {
  return (
    <PermissionGuard permission="purchases.view">
      <SupplierBillsListPage />
    </PermissionGuard>
  );
}
