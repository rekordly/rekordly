import { Suspense } from "react";

import { ShopperOrdersClient } from "@/components/features/store/shopper-orders-client";

export default function AllShopperOrdersPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-muted">Loading your orders…</div>}>
      <ShopperOrdersClient />
    </Suspense>
  );
}
