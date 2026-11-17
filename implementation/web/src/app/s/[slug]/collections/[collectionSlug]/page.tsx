import { PublicStorefrontClient } from "@/components/features/store/public-storefront-client";

export default async function PublicStorefrontCollectionPage({ params }: { params: Promise<{ slug: string; collectionSlug: string }> }) {
  const { slug, collectionSlug } = await params;
  return <PublicStorefrontClient slug={slug} page="collection" collectionSlug={decodeURIComponent(collectionSlug)} />;
}
