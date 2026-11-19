import { notFound } from "next/navigation";

import { PublicStorefrontClient } from "@/components/features/store/public-storefront-client";

const storefrontPages = new Set(["shop", "about", "policies", "privacy", "returns", "terms", "delivery", "cart", "checkout", "search", "orders"]);

export default async function PublicStorefrontSubpage({ params, searchParams }: { params: Promise<{ slug: string; page: string }>; searchParams: Promise<{ q?: string | string[] }> }) {
  const { slug, page } = await params;
  if (!storefrontPages.has(page)) notFound();
  const query = page === "search" ? (await searchParams).q : undefined;
  const searchQuery = typeof query === "string" ? query.trim().slice(0, 120) : "";
  return <PublicStorefrontClient key={page === "search" ? searchQuery : undefined} searchQuery={searchQuery} slug={slug} page={page as "shop" | "about" | "policies" | "privacy" | "returns" | "terms" | "delivery" | "cart" | "checkout" | "search" | "orders"} />;
}
