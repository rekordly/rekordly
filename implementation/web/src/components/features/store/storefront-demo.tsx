"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { AppButton } from "@/components/ui/app-button";
import { SideSheet } from "@/components/ui/side-sheet";
import { formatMinorAmount } from "@/lib/money";
import { createDefaultSections, STORE_THEMES, type BrandSettings, type ThemeProduct, type ThemeRendererProps, type ThemeStoreData } from "@/lib/store-themes";
import { resolveStoreBrand } from "@/lib/store-themes/brand";
import { readableOn } from "@/lib/store-themes/layout";
import { ChoiceCards } from "@/components/ui/form-kit";
import { PremiumCartButton, PremiumMedia, premiumWidth } from "@/lib/store-themes/premium";

export type DemoTheme = "studio" | "market";

const emptyCart = "{}";
const memoryCarts = new Map<string, string>();
const cartEvent = "rekordly:demo-cart-change";
const demoDeliveryFee = BigInt(250000);
const noFee = BigInt(0);

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
    descriptions: ["A hand-thrown terracotta vessel with a matte finish and a wide mouth for dried stems.", "A softly textured linen throw with a fringed edge. Drape it over a sofa or fold it at the foot of a bed.", "A glazed stoneware cup with a rounded handle, sized for your morning coffee.", "An everyday bowl with a glossy glaze and a deep shape for soups, grains and salads.", "A cotton runner with a stitched edge for everyday meals or a laid table.", "A broad stoneware serving plate with a raised rim and a hand-finished glaze."],
    options: [["Terracotta", "Natural finish"], ["Natural", "Warm sand"], ["Ivory", "Oat"], ["Amber", "Dark glaze"], ["Ochre", "Natural"], ["Ivory", "Speckled"]],
    brand: { palette: "earth", font_style: "classic", heading_font: "cormorant", body_font: "dm_sans" } as BrandSettings,
  },
  market: {
    name: "Circuit Supply", title: "Better kit for every day", copy: "Find practical gear for work, home and the spaces in between.",
    collections: ["Audio", "Workstation", "Accessories"],
    items: [["Arc Wireless Headphones", 58000], ["Compact Wireless Keyboard", 46500], ["USB-C Travel Hub", 27000], ["Pocket Speaker", 36000], ["Adjustable Laptop Stand", 22500], ["Braided Charging Cable", 9500]] as const,
    descriptions: ["Wireless over-ear headphones with a padded headband and folding ear cups.", "A compact wireless mechanical keyboard with tactile switches.", "An aluminium USB-C hub for connecting displays and USB accessories.", "A compact wireless speaker for a desk or weekend bag.", "An adjustable aluminium stand that raises your laptop to a comfortable height.", "A braided USB-C cable with reinforced connectors."],
    options: [["Standard", "Graphite"]],
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
    id: index + 1, product_id: index + 1, title, description: example.descriptions[index],
    image_urls: ["/storefront-demos/media/" + theme + "-" + (index + 1) + ".webp"],
    price_minor: String(price * 100), currency: "NGN", currency_exponent: 2,
    variant_name: example.options[index]?.[0] ?? "", availability_state: index === 5 ? "out_of_stock" : "in_stock",
    is_featured: index < 4, collection_id: (index % collections.length) + 1,
  }));
  example.options.forEach(([, name], index) => {
    const item = products[index];
    products.push({ ...item, id: 100 + index, variant_name: name, availability_state: index === 0 ? "out_of_stock" : "in_stock" });
  });
  return { name: example.name, slug: theme, path: base, description: example.copy, phone: "+234 800 000 0000", email: "hello@example.com", address: theme === "studio" ? "Ikoyi, Lagos, Nigeria" : "Ikeja, Lagos, Nigeria", collections, products };
}

export function StorefrontDemo({ theme, page, value = "", query = "" }: { theme: DemoTheme; page: NonNullable<ThemeRendererProps["page"]>; value?: string; query?: string }) {
  const router = useRouter();
  const store = demoData(theme);
  const example = examples[theme];
  const Renderer = STORE_THEMES[theme].Renderer;
  const base = store.path!;
  const [cartOpen, setCartOpen] = useState(false);
  const [delivery, setDelivery] = useState<"pickup" | "delivery">("pickup");
  const [demoOrderPlaced, setDemoOrderPlaced] = useState(false);
  const { palette, body, heading } = resolveStoreBrand(example.brand);
  const brandStyle = {
    "--store-primary": palette.primary, "--primary": palette.primary, "--accent": palette.primary, "--store-accent": palette.accent,
    "--store-heading-font": heading.headingFamily, "--primary-foreground": readableOn(palette.primary),
    "--premium-button-text": readableOn(palette.primary), fontFamily: body.bodyFamily,
  } as CSSProperties;
  const [variant, setVariant] = useState(Number(value));
  const key = "rekordly:theme-demo:" + theme;
  const cartSnapshot = useSyncExternalStore(onCartChange, () => readCart(key), () => emptyCart);
  const cart = parseCart(cartSnapshot);
  function updateCart(id: number, quantity: number) {
    const next = { ...cart };
    if (quantity <= 0) delete next[id];
    else next[id] = Math.min(quantity, 10);
    saveCart(next);
  }
  function saveCart(next: Record<number, number>) {
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
    if (section.type === "about") return { ...section, content: { heading: "About " + example.name, body: "<p>" + example.copy + "</p>", image: "/storefront-demos/media/" + theme + "-hero.webp" } };
    return section.type === "announcement" ? { ...section, enabled: false } : section;
  });
  const original = store.products.find((item) => item.id === Number(value));
  const options = store.products.filter((item) => original && item.product_id === original.product_id);
  const selected = options.find((item) => item.id === variant) ?? original;
  const cartItems = store.products.filter((item) => cart[item.id] > 0);
  const count = cartItems.reduce((sum, item) => sum + cart[item.id], 0);
  const subtotal = cartItems.reduce((sum, item) => sum + BigInt(item.price_minor) * BigInt(cart[item.id]), noFee);
  const deliveryFee = delivery === "delivery" ? demoDeliveryFee : noFee;
  const cartLines = cartItems.length ? (
    <ul className="divide-y divide-border">
      {cartItems.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div><Link href={base + "/products/" + item.id} className="font-semibold hover:underline">{item.title}</Link>{item.variant_name ? <p className="text-sm text-muted">{item.variant_name}</p> : null}<p className="text-sm text-muted">{formatMinorAmount(item.price_minor, "NGN", 2)} each</p></div>
        <div className="flex items-center gap-3">
          <button type="button" aria-label={"Remove one " + item.title} onClick={() => updateCart(item.id, cart[item.id] - 1)} className="size-8 rounded border border-border">−</button>
          <span>{cart[item.id]}</span>
          <button type="button" aria-label={"Add one " + item.title} onClick={() => updateCart(item.id, cart[item.id] + 1)} className="size-8 rounded border border-border">+</button>
        </div>
      </li>)}
    </ul>
  ) : <p className="py-8 text-sm text-muted">Your demo cart is empty.</p>;
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground [&_h1]:font-[family-name:var(--store-heading-font)] [&_h2]:font-[family-name:var(--store-heading-font)]" style={brandStyle}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-secondary px-4 py-2 text-sm text-foreground">
        <p>{STORE_THEMES[theme].name} demo</p>
        <div className="flex gap-4"><Link href="/store/templates" className="underline">Template library</Link><Link href={"/store/templates/customization/" + theme} className="font-semibold underline">Try this template</Link></div>
      </div>
      <Renderer store={store} brand={example.brand} sections={sections} page={page} collectionSlug={page === "collection" ? value : undefined} searchQuery={query} cartCount={count} cartQuantities={cart} onCartClick={() => setCartOpen(true)} onQuickAdd={add} />
      {page === "product" && selected ? <main className={premiumWidth + " grid gap-8 py-10 md:grid-cols-2"}>
        <PremiumMedia src={selected.image_urls[0]} alt={selected.title} className={theme === "studio" ? "aspect-[4/5] bg-surface-secondary" : "aspect-square rounded-xl bg-surface-secondary"} />
        <div className="space-y-5 md:pt-8">
          <Link href={base + "/shop"} className="text-sm underline">Back to shop</Link>
          <h1 className="text-4xl font-semibold">{selected.title}</h1>
          <p className="text-xl">{formatMinorAmount(selected.price_minor, "NGN", 2)}</p>
          <p className="max-w-prose text-sm leading-7 text-muted">{selected.description}</p>
          {options.length > 1 ? <div className="flex flex-wrap gap-2" aria-label="Product options">
            {options.map((item) => <button type="button" key={item.id} onClick={() => setVariant(item.id)} aria-pressed={item.id === selected.id} className="rounded-lg border border-border px-4 py-2 text-sm aria-pressed:border-primary">{item.variant_name}</button>)}
          </div> : null}
          {selected.availability_state === "out_of_stock" ? <AppButton label="Sold out" isDisabled /> : <PremiumCartButton quantity={cart[selected.id]} onAdd={() => add(selected.id)} onView={() => setCartOpen(true)} />}
        </div>
      </main> : null}
      {page === "cart" ? <main className="mx-auto w-full max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-semibold">Your cart</h1>
        {cartLines}
        {count > 0 ? <div className="mt-5 space-y-4 border-t border-border pt-5">
          <p className="flex justify-between gap-3"><span>Subtotal</span><strong>{formatMinorAmount(subtotal.toString(), "NGN", 2)}</strong></p>
          <Link href={base + "/checkout"} className="inline-flex rounded-lg bg-[var(--store-primary)] px-5 py-3 text-sm font-semibold text-[var(--premium-button-text)]">Continue to checkout</Link>
        </div> : null}
        <Link href={base + "/shop"} className="mt-5 inline-block font-semibold underline">Continue shopping</Link>
      </main> : null}
      {page === "checkout" ? <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-12">
        <div><h1 className="text-3xl font-semibold">Demo checkout</h1><p className="mt-2 text-sm text-muted">Practise placing an order with sample details. No payment is taken.</p></div>
        {demoOrderPlaced ? <section className="rounded-xl border border-border p-6" role="status"><h2 className="text-xl font-semibold">Demo order placed</h2><p className="mt-2 text-sm text-muted">On a published store, this step takes shoppers to order tracking.</p></section>
          : count > 0 ? <>
            {cartLines}
            <ChoiceCards<"pickup" | "delivery"> label="Delivery method" value={delivery} onChange={setDelivery} options={[{ key: "pickup", label: "Pickup", description: store.address ?? undefined }, { key: "delivery", label: "Store delivery", description: formatMinorAmount(demoDeliveryFee.toString(), "NGN", 2) }]} />
            <div className="space-y-2 border-t border-border pt-4 text-sm">
              <p className="flex justify-between gap-3"><span>Delivery</span><span>{deliveryFee === noFee ? "Free" : formatMinorAmount(deliveryFee.toString(), "NGN", 2)}</span></p>
              <p className="flex justify-between gap-3"><span>Total</span><strong>{formatMinorAmount((subtotal + deliveryFee).toString(), "NGN", 2)}</strong></p>
            </div>
            <AppButton label="Place demo order" onPress={() => { saveCart({}); setDemoOrderPlaced(true); }} />
          </> : <p className="text-sm text-muted">Add an item to try checkout.</p>}
        <Link href={base + (demoOrderPlaced ? "/shop" : "/cart")} className="inline-block text-sm font-semibold underline">{demoOrderPlaced ? "Continue shopping" : "Back to cart"}</Link>
      </main> : null}
      {page === "policies" ? <main className="mx-auto max-w-3xl px-4 py-12"><h1 className="text-3xl font-semibold">Store policies</h1><p className="mt-4">The merchant’s delivery, returns and privacy policies appear here.</p></main> : null}
      <footer className="mt-auto py-10 text-sm" style={{ background: palette.primary, color: readableOn(palette.primary) }}>
        <div className={premiumWidth + " grid gap-8 sm:grid-cols-2"}>
          <div className="space-y-3">
            <h2 className="text-xl font-semibold">{store.name}</h2>
            <address className="space-y-1 not-italic">
              <p>{store.address}</p><p>{store.phone}</p><p>{store.email}</p>
            </address>
            <p className="text-xs opacity-80">Sample contact details</p>
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
