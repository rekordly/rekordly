import type { Metadata } from "next";

import { PublicStorefrontClient } from "@/components/features/store/public-storefront-client";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
  try {
    const res = await fetch(`${apiBase}/api/v1/public/storefronts/${encodeURIComponent(slug)}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) {
      return { title: "Storefront Unavailable | Rekordly", robots: { index: false, follow: false } };
    }
    const json = (await res.json()) as {
      data?: { storefront?: { name?: string; tagline?: string; seo_title?: string; seo_description?: string; logo_url?: string } };
    };
    const sf = json.data?.storefront;
    if (!sf) {
      return { title: "Storefront | Rekordly", robots: { index: false, follow: false } };
    }
    const title = sf.seo_title || sf.name || "Storefront | Rekordly";
    const description = sf.seo_description || sf.tagline || `Browse products and request an order from ${sf.name ?? slug}.`;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        images: sf.logo_url ? [sf.logo_url] : undefined,
      },
      robots: { index: true, follow: true },
    };
  } catch {
    return { title: "Storefront | Rekordly", robots: { index: true, follow: true } };
  }
}

export default async function StorefrontPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicStorefrontClient slug={slug} />;
}
