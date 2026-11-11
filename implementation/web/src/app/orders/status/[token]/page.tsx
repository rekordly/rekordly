import type { Metadata } from "next";

import { PublicOrderStatusClient } from "@/components/features/store/public-order-status-client";

export const metadata: Metadata = {
  title: "Order Status | Rekordly",
  robots: { index: false, follow: false },
};

export default async function PublicOrderStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicOrderStatusClient token={token} />;
}
