import { PermissionGuard } from "@/components/auth/can";
import { PurchaseOrderDetailPage } from "@/components/features/finance/procurement-section-pages";

export default async function PurchaseOrderDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PermissionGuard permission="purchases.view">
      <PurchaseOrderDetailPage id={Number(id)} />
    </PermissionGuard>
  );
}
