import type { Metadata } from "next";

import { PublicStorefrontClient } from "@/components/features/store/public-storefront-client";

export const metadata: Metadata = {
  title: "Storefront | Rekordly",
  robots: { index: true, follow: true },
};

export default async function StorefrontPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicStorefrontClient slug={slug} />;
}
