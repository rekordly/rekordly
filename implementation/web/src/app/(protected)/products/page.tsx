import type { Metadata } from "next";

import { ProductsPage } from "@/components/features/products/products-page";

export const metadata: Metadata = {
  title: "Products — Rekordly",
  description: "Everything you sell, with prices, stock and collections.",
};

export default function Page() {
  return <ProductsPage />;
}
