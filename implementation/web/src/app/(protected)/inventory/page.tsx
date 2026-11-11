import { PermissionGuard } from "@/components/auth/can";
import { CataloguePage } from "@/components/features/finance/catalogue-page";

export default function InventoryPage() {
  return (
    <PermissionGuard permission="inventory.view_quantity">
      <CataloguePage />
    </PermissionGuard>
  );
}
