import type { Metadata } from "next";
import Link from "next/link";

import { PublicStorefrontClient } from "@/components/features/store/public-storefront-client";
import { API_BASE_URL } from "@/lib/api";
import { formatMinorAmount } from "@/lib/money";

type PublicProductPayload = {
  product: {
    id: number;
    product_id: number;
    title: string;
    variant_name?: string;
    description?: string;
    sku?: string;
    price_minor: string;
    currency: string;
    currency_exponent: number;
    availability_state: string;
    available_quantity?: string;
    image_urls: string[];
  };
  variants: {
    id: number;
    title: string;
    variant_name?: string;
    price_minor: string;
    currency: string;
    currency_exponent: number;
    availability_state: string;
  }[];
  storefront: {
    name: string;
    slug: string;
    primary_color: string;
    currency: string;
    currency_exponent: number;
  };
};

async function fetchPublicProduct(slug: string, productId: string): Promise<PublicProductPayload | null> {
  const apiBase = API_BASE_URL;
  try {
    const res = await fetch(
      `${apiBase}/api/v1/public/storefronts/${encodeURIComponent(slug)}/products/${encodeURIComponent(productId)}`,
      { next: { revalidate: 30 } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: PublicProductPayload };
    return json.data ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; productId: string }>;
}): Promise<Metadata> {
  const { slug, productId } = await params;
  const payload = await fetchPublicProduct(slug, productId);
  if (!payload) {
    return { title: "Product Unavailable | Rekordly", robots: { index: false, follow: false } };
  }
  return {
    title: `${payload.product.title} | ${payload.storefront.name}`,
    description: payload.product.description || `${payload.product.title} from ${payload.storefront.name}`,
    openGraph: {
      title: `${payload.product.title} | ${payload.storefront.name}`,
      description: payload.product.description || undefined,
      images: payload.product.image_urls?.length ? [payload.product.image_urls[0]] : undefined,
    },
    robots: { index: true, follow: true },
  };
}

export default async function PublicStorefrontProductPage({
  params,
}: {
  params: Promise<{ slug: string; productId: string }>;
}) {
  const { slug, productId } = await params;
  const payload = await fetchPublicProduct(slug, productId);

  if (!payload) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-foreground">Product unavailable</h1>
        <p className="mt-2 text-sm text-muted">This product is not currently published on this storefront.</p>
        <Link href={`/s/${encodeURIComponent(slug)}`} className="mt-4 inline-block text-sm font-medium text-primary underline">
          Back to storefront
        </Link>
      </main>
    );
  }

  return <PublicStorefrontClient slug={slug} page="product" productID={payload.product.id} />;
}
