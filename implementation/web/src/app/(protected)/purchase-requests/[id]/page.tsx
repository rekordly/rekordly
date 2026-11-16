import { PermissionGuard } from "@/components/auth/can";
import { PurchaseRequestDetailPage } from "@/components/features/finance/procurement-section-pages";

export default async function PurchaseRequestDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PermissionGuard permission="purchases.view">
      <PurchaseRequestDetailPage id={Number(id)} />
    </PermissionGuard>
  );
}
