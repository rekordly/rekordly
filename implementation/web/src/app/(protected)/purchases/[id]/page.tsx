import { PermissionGuard } from "@/components/auth/can";
import { PurchaseDetailPage } from "@/components/features/finance/procurement-section-pages";

export default async function PurchaseDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PermissionGuard permission="purchases.view">
      <PurchaseDetailPage id={Number(id)} />
    </PermissionGuard>
  );
}
