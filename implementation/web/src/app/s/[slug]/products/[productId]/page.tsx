import type { Metadata } from "next";
import Link from "next/link";

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
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
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

  const { product, variants, storefront } = payload;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 space-y-6">
      <div className="flex items-center justify-between border-b border-default pb-4">
        <Link href={`/s/${encodeURIComponent(slug)}`} className="text-sm font-semibold text-primary hover:underline">
          ← {storefront.name}
        </Link>
        <span className="text-xs text-muted">No online payment required at request stage</span>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="aspect-square overflow-hidden rounded-2xl border border-default bg-surface flex items-center justify-center">
          {product.image_urls?.[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image_urls[0]} alt={product.title} className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-muted">No image</span>
          )}
        </div>

        <div className="space-y-4">
          <h1 className="text-2xl font-bold text-foreground">{product.title}</h1>
          {product.sku ? <p className="text-xs text-muted">SKU: {product.sku}</p> : null}
          <p className="text-xl font-bold tabular-nums text-foreground">
            {formatMinorAmount(product.price_minor, product.currency, product.currency_exponent)}
          </p>
          <p className="text-sm text-muted leading-relaxed">
            {product.description || "Contact merchant for custom specifications."}
          </p>

          {variants.length > 1 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Available options</p>
              <div className="flex flex-wrap gap-2">
                {variants.map((v) => (
                  <Link
                    key={v.id}
                    href={`/s/${encodeURIComponent(slug)}/products/${v.id}`}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                      v.id === product.id ? "border-primary bg-primary/10 text-primary" : "border-default text-foreground"
                    }`}
                  >
                    {v.variant_name || v.title} — {formatMinorAmount(v.price_minor, v.currency, v.currency_exponent)}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          <div className="pt-2">
            <Link
              href={`/s/${encodeURIComponent(slug)}`}
              className="inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
              style={{ backgroundColor: storefront.primary_color || "#0f766e" }}
            >
              Browse &amp; add to order request
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
