import { StorefrontOrderPage } from "@/components/features/store/storefront-order-page";

export default async function StoreOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isSafeInteger(orderId) || orderId < 1) return <p className="p-6 text-sm text-muted">Order not found.</p>;
  return <StorefrontOrderPage id={orderId} />;
}
