import { notFound } from "next/navigation";

import { PublicStorefrontClient } from "@/components/features/store/public-storefront-client";

const storefrontPages = new Set(["shop", "about", "policies", "privacy", "returns", "terms", "delivery", "cart", "orders"]);

export default async function PublicStorefrontSubpage({ params }: { params: Promise<{ slug: string; page: string }> }) {
  const { slug, page } = await params;
  if (!storefrontPages.has(page)) notFound();
  return <PublicStorefrontClient slug={slug} page={page as "shop" | "about" | "policies" | "privacy" | "returns" | "terms" | "delivery" | "cart" | "orders"} />;
}
