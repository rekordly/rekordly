import type { Metadata } from "next";
import type { ReactNode } from "react";

import { API_BASE_URL } from "@/lib/api";

// Every store page (shop, product, cart, policies…) gets the store's favicon,
// falling back to its logo. Titles and share text stay on each page.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/public/storefronts/${encodeURIComponent(slug)}`, { next: { revalidate: 30 } });
    if (!res.ok) return {};
    const json = (await res.json()) as { data?: { storefront?: { logo_url?: string; brand?: { favicon_url?: string; logo_url?: string } } } };
    const sf = json.data?.storefront;
    const icon = sf?.brand?.favicon_url || sf?.brand?.logo_url || sf?.logo_url;
    return icon ? { icons: { icon, apple: icon } } : {};
  } catch {
    return {};
  }
}

export default function StoreLayout({ children }: { children: ReactNode }) {
  return children;
}
