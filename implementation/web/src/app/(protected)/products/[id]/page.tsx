import type { Metadata } from "next";

import { ProductDetailPage } from "@/components/features/products/product-detail-page";

export const metadata: Metadata = {
  title: "Product — Rekordly",
  description: "Price, stock, variants and history for one product.",
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductDetailPage productId={Number(id)} />;
}
