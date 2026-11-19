"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { AppButton } from "@/components/ui/app-button";
import { SideSheet } from "@/components/ui/side-sheet";
import { formatMinorAmount } from "@/lib/money";
import { createDefaultSections, STORE_THEMES, type BrandSettings, type ThemeProduct, type ThemeRendererProps, type ThemeStoreData } from "@/lib/store-themes";
import { PremiumCartButton, PremiumMedia, premiumWidth } from "@/lib/store-themes/premium";

export type DemoTheme = "studio" | "market";

const emptyCart = "{}";
const memoryCarts = new Map<string, string>();
const cartEvent = "rekordly:demo-cart-change";

function onCartChange(listener: () => void) {
  window.addEventListener(cartEvent, listener);
  return () => window.removeEventListener(cartEvent, listener);
}

function readCart(key: string) {
  try { return window.sessionStorage.getItem(key) ?? emptyCart; }
  catch { return memoryCarts.get(key) ?? emptyCart; }
}

function parseCart(value: string): Record<number, number> {
  try { return JSON.parse(value) ?? {}; }
  catch { return {}; }
}

const examples = {
  studio: {
    name: "Loom & Clay", title: "Objects with a quiet presence", copy: "Small-batch pieces for the spaces you live in.",
    collections: ["Ceramics", "Textiles", "Tableware"],
    items: [["Terracotta Vessel", 42000], ["Woven Linen Throw", 32500], ["Stoneware Cup", 15000], ["Everyday Bowl", 18500], ["Cotton Table Runner", 23000], ["Studio Serving Plate", 28000]] as const,
    brand: { palette: "earth", font_style: "classic", heading_font: "cormorant", body_font: "dm_sans" } as BrandSettings,
  },
  market: {
    name: "Circuit Supply", title: "Better kit for every day", copy: "Find practical gear for work, home and the spaces in between.",
    collections: ["Audio", "Workstation", "Accessories"],
    items: [["Arc Wireless Headphones", 58000], ["Compact Wireless Keyboard", 46500], ["USB-C Travel Hub", 27000], ["Pocket Speaker", 36000], ["Adjustable Laptop Stand", 22500], ["Braided Charging Cable", 9500]] as const,
    brand: { palette: "ocean", font_style: "modern", heading_font: "space_grotesk", body_font: "dm_sans" } as BrandSettings,
  },
};

function demoData(theme: DemoTheme): ThemeStoreData {
  const example = examples[theme];
  const base = "/storefront-demos/" + theme;
  const collections = example.collections.map((name, index) => ({
    id: index + 1, name, slug: name.toLowerCase(), image_url: "/storefront-demos/media/" + theme + "-" + (index + 1) + ".webp",
  }));
  const products = example.items.map(([title, price], index): ThemeProduct => ({
    id: index + 1, product_id: index + 1, title, description: index === 0 ? example.copy : undefined,
    image_urls: ["/storefront-demos/media/" + theme + "-" + (index + 1) + ".webp"],
    price_minor: String(price * 100), currency: "NGN", currency_exponent: 2,
    variant_name: index === 0 ? "Standard" : "", availability_state: index === 5 ? "out_of_stock" : "in_stock",
    is_featured: index < 4, collection_id: (index % collections.length) + 1,
  }));
  products.push({ ...products[0], id: 100, variant_name: theme === "studio" ? "Natural finish" : "Graphite", availability_state: "out_of_stock" });
  return { name: example.name, slug: theme, path: base, description: example.copy, phone: "+234 800 000 0000", email: "hello@example.com", address: theme === "studio" ? "Ikoyi, Lagos, Nigeria" : "Ikeja, Lagos, Nigeria", collections, products };
}

export function StorefrontDemo({ theme, page, value = "", query = "" }: { theme: DemoTheme; page: NonNullable<ThemeRendererProps["page"]>; value?: string; query?: string }) {
  const router = useRouter();
  const store = demoData(theme);
  const example = examples[theme];
  const Renderer = STORE_THEMES[theme].Renderer;
  const base = store.path!;
  const [cartOpen, setCartOpen] = useState(false);
  const [variant, setVariant] = useState(Number(value));
  const key = "rekordly:theme-demo:" + theme;
  const cartSnapshot = useSyncExternalStore(onCartChange, () => readCart(key), () => emptyCart);
  const cart = parseCart(cartSnapshot);
  function updateCart(id: number, quantity: number) {
    const next = { ...cart };
    if (quantity <= 0) delete next[id];
    else next[id] = Math.min(quantity, 10);
    const snapshot = JSON.stringify(next);
    try { window.sessionStorage.setItem(key, snapshot); }
    catch { memoryCarts.set(key, snapshot); }
    window.dispatchEvent(new Event(cartEvent));
  }
  function add(id: number) {
    const product = store.products.find((item) => item.id === id);
    if (!product || product.availability_state === "out_of_stock") return;
    updateCart(id, (cart[id] ?? 0) + 1);
    setCartOpen(true);
  }
  const sections = createDefaultSections(theme, example.name).map((section) => {
    if (section.type === "hero") return { ...section, content: { heading: example.title, subheading: example.copy, image: "/storefront-demos/media/" + theme + "-hero.webp", button_label: "Explore the shop" } };
    if (section.type === "about") return { ...section, content: { heading: "About " + example.name, body: "<p>" + example.copy + "</p>" } };
    return section.type === "announcement" ? { ...section, enabled: false } : section;
  });
  const original = store.products.find((item) => item.id === Number(value));
  const options = store.products.filter((item) => original && item.product_id === original.product_id);
  const selected = options.find((item) => item.id === variant) ?? original;
  const cartItems = store.products.filter((item) => cart[item.id] > 0);
  const count = cartItems.reduce((sum, item) => sum + cart[item.id], 0);
  const cartLines = cartItems.length ? (
    <ul className="divide-y divide-border">
      {cartItems.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div><Link href={base + "/products/" + item.id} className="font-semibold hover:underline">{item.title}</Link><p className="text-sm text-muted">{formatMinorAmount(item.price_minor, "NGN", 2)} each</p></div>
        <div className="flex items-center gap-3">
          <button type="button" aria-label={"Remove one " + item.title} onClick={() => updateCart(item.id, cart[item.id] - 1)} className="size-8 rounded border border-border">−</button>
          <span>{cart[item.id]}</span>
          <button type="button" aria-label={"Add one " + item.title} onClick={() => updateCart(item.id, cart[item.id] + 1)} className="size-8 rounded border border-border">+</button>
        </div>
      </li>)}
    </ul>
  ) : <p className="py-8 text-sm text-muted">Your demo cart is empty.</p>;
  return (
    <div className="min-h-screen bg-white text-[#222822]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 bg-[#f0f2ef] px-4 py-2 text-sm text-[#253029]">
        <p>{STORE_THEMES[theme].name} demo</p>
        <div className="flex gap-4"><Link href="/store/templates" className="underline">Template library</Link><Link href={"/store/templates/customization/" + theme} className="font-semibold underline">Try this template</Link></div>
      </div>
      <Renderer store={store} brand={example.brand} sections={sections} page={page} collectionSlug={page === "collection" ? value : undefined} searchQuery={query} cartCount={count} cartQuantities={cart} onCartClick={() => setCartOpen(true)} onQuickAdd={add} />
      {page === "product" && selected ? <main className={premiumWidth + " grid gap-8 py-10 md:grid-cols-2"}>
        <PremiumMedia src={selected.image_urls[0]} alt={selected.title} className={theme === "studio" ? "aspect-[4/5] bg-[#f3eee7]" : "aspect-square rounded-xl bg-[#f1f3f4]"} />
        <div className="space-y-5 md:pt-8">
          <Link href={base + "/shop"} className="text-sm underline">Back to shop</Link>
          <h1 className="text-4xl font-semibold">{selected.title}</h1>
          <p className="text-xl">{formatMinorAmount(selected.price_minor, "NGN", 2)}</p>
          {options.length > 1 ? <div className="flex flex-wrap gap-2" aria-label="Product options">
            {options.map((item) => <button type="button" key={item.id} onClick={() => setVariant(item.id)} aria-pressed={item.id === selected.id} className="rounded-lg border border-border px-4 py-2 text-sm aria-pressed:border-primary">{item.variant_name}</button>)}
          </div> : null}
          {selected.availability_state === "out_of_stock" ? <AppButton label="Sold out" isDisabled /> : <PremiumCartButton quantity={cart[selected.id]} onAdd={() => add(selected.id)} onView={() => setCartOpen(true)} />}
          <p className="text-sm text-muted">{selected.description}</p>
        </div>
      </main> : null}
      {page === "cart" ? <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-semibold">Your cart</h1>
        {cartLines}
        <p className="mt-4 text-sm text-muted">This demo uses sample products. Checkout is available on a published store.</p>
        <Link href={base + "/shop"} className="mt-5 inline-block font-semibold underline">Continue shopping</Link>
      </main> : null}
      {page === "policies" ? <main className="mx-auto max-w-3xl px-4 py-12"><h1 className="text-3xl font-semibold">Store policies</h1><p className="mt-4">The merchant’s delivery, returns and privacy policies appear here.</p></main> : null}
      <footer className="border-t border-black/10 bg-[#f0f2ef] py-10 text-sm">
        <div className={premiumWidth + " grid gap-8 sm:grid-cols-2"}>
          <div className="space-y-3">
            <h2 className="text-xl font-semibold">{store.name}</h2>
            <address className="space-y-1 not-italic">
              <p>{store.address}</p><p>{store.phone}</p><p>{store.email}</p>
            </address>
            <p className="text-xs text-[#586253]">Sample contact details</p>
          </div>
        <nav className="flex flex-wrap items-start gap-5 sm:justify-end" aria-label="Store information">
          <Link href={base + "/shop"} className="hover:underline">Shop</Link>
          <Link href={base + "/about"} className="hover:underline">About</Link>
          <Link href={base + "/policies"} className="hover:underline">Policies</Link>
        </nav>
        </div>
      </footer>
      <SideSheet isOpen={cartOpen} onClose={() => setCartOpen(false)} title={"Your cart (" + count + ")"}
        footer={<AppButton label="View full cart" onPress={() => { setCartOpen(false); router.push(base + "/cart"); }} />}>
        {cartLines}
      </SideSheet>
    </div>
  );
}
