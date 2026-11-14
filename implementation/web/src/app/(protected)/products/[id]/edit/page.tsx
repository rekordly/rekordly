import type { Metadata } from "next";

import { ProductFormPage } from "@/components/features/products/product-form-page";

export const metadata: Metadata = {
  title: "Edit product — Rekordly",
  description: "Change a product's details.",
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductFormPage productId={Number(id)} />;
}
