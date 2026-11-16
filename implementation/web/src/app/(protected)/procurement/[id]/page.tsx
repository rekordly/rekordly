import { PermissionGuard } from "@/components/auth/can";
import { GoodsReceiptDetailPage } from "@/components/features/finance/procurement-section-pages";

export default async function ProcurementDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PermissionGuard permission="purchases.view">
      <GoodsReceiptDetailPage id={Number(id)} />
    </PermissionGuard>
  );
}
