import { PermissionGuard } from "@/components/auth/can";
import { InventoryOverview } from "@/components/features/products/inventory-overview";

export default function InventoryPage() {
  return (
    <PermissionGuard permission="inventory.view_quantity">
      <InventoryOverview />
    </PermissionGuard>
  );
}
