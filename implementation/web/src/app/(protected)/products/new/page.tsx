import type { Metadata } from "next";

import { ProductFormPage } from "@/components/features/products/product-form-page";

export const metadata: Metadata = {
  title: "Add a product — Rekordly",
  description: "Add something you sell.",
};

export default function Page() {
  return <ProductFormPage />;
}
