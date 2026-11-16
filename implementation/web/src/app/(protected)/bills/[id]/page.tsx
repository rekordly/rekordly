import { PermissionGuard } from "@/components/auth/can";
import { SupplierBillDetailPage } from "@/components/features/finance/procurement-section-pages";

export default async function BillDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PermissionGuard permission="purchases.view">
      <SupplierBillDetailPage id={Number(id)} />
    </PermissionGuard>
  );
}
