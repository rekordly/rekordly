import { notFound } from "next/navigation";
import { StorefrontDemo } from "@/components/features/store/storefront-demo";

export const metadata = { robots: { index: false, follow: false } };

export default async function StorefrontDemoPage({ params, searchParams }: {
  params: Promise<{ theme: string; path?: string[] }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { theme, path = [] } = await params;
  if (theme !== "studio" && theme !== "market") notFound();
  const [page = "home", value = ""] = path;
  const search = (await searchParams).q;
  const query = typeof search === "string" ? search.trim().slice(0, 120) : "";
  if (path.length === 2 && page === "collections" && value) return <StorefrontDemo key={value} theme={theme} page="collection" value={value} />;
  const id = Number(value);
  if (path.length === 2 && page === "products" && ((id >= 1 && id <= 6 && Number.isInteger(id)) || id === 100)) return <StorefrontDemo key={value} theme={theme} page="product" value={value} />;
  if (path.length > 1) notFound();
  if (page !== "home" && page !== "shop" && page !== "search" && page !== "about" && page !== "cart" && page !== "policies") notFound();
  return <StorefrontDemo key={page + ":" + query} theme={theme} page={page} query={query} />;
}
