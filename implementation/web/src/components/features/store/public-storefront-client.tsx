"use client";

import { CheckCircle, MagnifyingGlass, ShoppingBag, Trash, Warning } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { FormDrawer } from "@/components/ui/form-drawer";
import { StatusPill } from "@/components/ui/page";
import { createIdempotencyKey } from "@/lib/utils";
import { financeApi, formatMinorAmount } from "@/lib/money";
import { createDefaultSections, resolvePalette, STORE_THEMES, type BrandSettings, type ThemeKey } from "@/lib/store-themes";
import type { GuestCheckoutConfirmation, PublicStorefrontProduct, ValidatedCart } from "@/types/finance";
import { EssentialStoreFooter, StoreServiceCards } from "./essential-store-footer";
import { EssentialProductDetail } from "./essential-product-detail";
import { resolveStoreBrand } from "@/lib/store-themes/brand";
import { STORE_WRAP } from "@/lib/store-themes/layout";

type CartDraftLine = {
  storefront_product_id: number;
  title: string;
  variant_name: string;
  price_minor: string;
  quantity: number;
  max_qty: number;
};

function availabilityLabel(p: PublicStorefrontProduct): { text: string; tone: "success" | "warning" | "danger" | "neutral" } {
  if (p.availability_state === "in_stock") {
    return {
      text: p.available_quantity ? `${p.available_quantity} left` : "In stock",
      tone: "success",
    };
  }
  if (p.availability_state === "low_stock") return { text: p.available_quantity ? `Only ${p.available_quantity} left` : "Low stock", tone: "warning" };
  if (p.availability_state === "request_only") return { text: "Available on request", tone: "neutral" };
  return { text: "Out of stock", tone: "danger" };
}

export function PublicStorefrontClient({ slug, page = "home", collectionSlug, productID }: { slug: string; page?: "home" | "shop" | "about" | "policies" | "privacy" | "returns" | "terms" | "delivery" | "cart" | "collection" | "product"; productID?: number; collectionSlug?: string }) {
  const [searchText, setSearchText] = useState("");
  const [selectedCol, setSelectedCol] = useState(collectionSlug ?? "");
  const [cart, setCart] = useState<CartDraftLine[]>([]);
  const [cartToken, setCartToken] = useState("");
  const [validatedCart, setValidatedCart] = useState<ValidatedCart | null>(null);
  const [activeProductGroup, setActiveProductGroup] = useState<PublicStorefrontProduct[] | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<number>(0);

  // Checkout state
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("pickup");
  const [deliveryAreaId, setDeliveryAreaId] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [policyAccepted, setPolicyAccepted] = useState(true);
  const [checkoutError, setCheckoutError] = useState("");
  const [confirmedOrder, setConfirmedOrder] = useState<GuestCheckoutConfirmation | null>(null);

  useEffect(() => {
    setSelectedCol(collectionSlug ?? "");
  }, [collectionSlug]);

  const storeQuery = useQuery({
    queryKey: ["public-storefront", slug, searchText, selectedCol],
    queryFn: () => financeApi.getPublicStorefront(slug, { q: searchText || undefined, collection: selectedCol || undefined }),
  });
  useEffect(() => {
    const firstArea = storeQuery.data?.delivery_areas?.[0];
    if (firstArea && !deliveryAreaId) setDeliveryAreaId(String(firstArea.id));
  }, [storeQuery.data, deliveryAreaId]);

  // Restore persistent visitor cart from localStorage + backend
  useEffect(() => {
    const storageKey = `rekordly_cart:${slug}`;
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
    if (!saved) return;
    let cancelled = false;
    financeApi
      .getPublicCart(slug, saved, deliveryMethod, deliveryAreaId ? Number(deliveryAreaId) : undefined)
      .then((c) => {
        if (cancelled || !c?.lines?.length) return;
        setCartToken(c.cart_token || saved);
        setValidatedCart(c);
        setCart(
          c.lines.map((l) => ({
            storefront_product_id: l.storefront_product_id,
            title: l.title,
            variant_name: l.variant_name,
            price_minor: l.unit_price_minor,
            quantity: Number(l.quantity) || 1,
            max_qty: 999,
          })),
        );
      })
      .catch(() => {
        if (typeof window !== "undefined") window.localStorage.removeItem(storageKey);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, deliveryMethod, deliveryAreaId]);

  const syncCartMutation = useMutation({
    mutationFn: (lines: CartDraftLine[]) =>
      financeApi.upsertPublicCart(slug, {
        cart_token: cartToken || undefined,
        lines: lines.map((l) => ({
          storefront_product_id: l.storefront_product_id,
          quantity: String(l.quantity),
          expected_price_minor: l.price_minor,
        })),
        delivery_method: deliveryMethod,
        delivery_area_id: deliveryAreaId ? Number(deliveryAreaId) : undefined,
      }),
    onSuccess: (data) => {
      setValidatedCart(data);
      if (data.cart_token) {
        setCartToken(data.cart_token);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(`rekordly_cart:${slug}`, data.cart_token);
        }
      }
    },
  });

  const validateCartMutation = useMutation({
    mutationFn: (lines: CartDraftLine[]) =>
      financeApi.validatePublicCart(slug, {
        lines: lines.map((l) => ({
          storefront_product_id: l.storefront_product_id,
          quantity: String(l.quantity),
          expected_price_minor: l.price_minor,
        })),
        delivery_method: deliveryMethod,
        delivery_area_id: deliveryAreaId ? Number(deliveryAreaId) : undefined,
      }),
    onSuccess: (data) => setValidatedCart(data),
  });

  useEffect(() => {
    if (cart.length === 0) return;
    const t = setTimeout(() => {
      syncCartMutation.mutate(cart);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, deliveryMethod, deliveryAreaId]);

  const submitCheckout = useMutation({
    mutationFn: async () => {
      const idempotencyKey = createIdempotencyKey();
      return financeApi.submitGuestCheckout(
        slug,
        {
          cart_token: cartToken || undefined,
          lines: cart.map((l) => ({
            storefront_product_id: l.storefront_product_id,
            quantity: String(l.quantity),
            expected_price_minor: l.price_minor,
          })),
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_email: customerEmail,
          delivery_method: deliveryMethod,
          delivery_area_id: deliveryAreaId ? Number(deliveryAreaId) : undefined,
          delivery_address: deliveryAddress,
          customer_note: customerNote,
          policy_acknowledged: policyAccepted,
        },
        idempotencyKey,
      );
    },
    onSuccess: (res) => {
      setCheckoutError("");
      setConfirmedOrder(res);
      setCart([]);
      setCartToken("");
      setValidatedCart(null);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(`rekordly_cart:${slug}`);
      }
    },
    onError: (err: Error) => {
      setCheckoutError(err.message);
      if (cart.length > 0) validateCartMutation.mutate(cart);
    },
  });

  if (storeQuery.isPending) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8 text-sm text-muted">
        Loading storefront…
      </main>
    );
  }

  if (storeQuery.isError || !storeQuery.data) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-8 text-center space-y-3">
        <ShoppingBag size={36} weight="duotone" className="text-muted" />
        <h1 className="text-xl font-bold text-foreground">Storefront unavailable</h1>
        <p className="text-sm text-muted max-w-md">
          This storefront is not currently published or is temporarily unavailable. Please contact the merchant directly.
        </p>
      </main>
    );
  }

  const sf = storeQuery.data;

  const themeKey: ThemeKey = sf.theme_key === "boutique" || sf.theme_key === "editorial" ? "boutique" : "simple";
  const brand: BrandSettings = sf.brand ?? {
    logo_url: sf.logo_url ?? undefined,
    palette: "custom",
    custom_color: sf.primary_color,
    font_style: sf.font_family === "merriweather" ? "classic" : sf.font_family === "plus_jakarta" ? "friendly" : "modern",
  };
  const resolvedBrand = { ...brand, resolved_palette: sf.brand?.resolved_palette ?? resolvePalette(brand.palette, brand.custom_color) };
  const resolved = resolveStoreBrand(resolvedBrand);
  const sections = sf.sections?.length ? sf.sections : createDefaultSections(themeKey, sf.name);
  const Renderer = STORE_THEMES[themeKey].Renderer;

  // Group published variants by internal product_id so customers see unified products + variant selector
  const productGroups = new Map<number, PublicStorefrontProduct[]>();
  for (const p of sf.products) {
    const arr = productGroups.get(p.product_id) ?? [];
    arr.push(p);
    productGroups.set(p.product_id, arr);
  }

  const addToCart = (prod: PublicStorefrontProduct) => {
    const next = [...cart];
    const idx = next.findIndex((i) => i.storefront_product_id === prod.id);
    if (idx >= 0) {
      next[idx] = { ...next[idx], quantity: Math.min(prod.max_qty_per_order, next[idx].quantity + 1) };
    } else {
      next.push({
        storefront_product_id: prod.id,
        title: prod.title,
        variant_name: prod.variant_name,
        price_minor: prod.price_minor,
        quantity: 1,
        max_qty: prod.max_qty_per_order,
      });
    }
    setCart(next);
    setActiveProductGroup(null);
    validateCartMutation.mutate(next);
  };

  const trackCartVisit = () => {
    void financeApi.trackPublicCheckoutStarted(slug).catch(() => {});
    if (cart.length > 0) validateCartMutation.mutate(cart);
  };

  const totalCount = cart.reduce((acc, i) => acc + i.quantity, 0);

  const productTools = (
    <section className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1 sm:min-w-[220px]">
        <AppInput placeholder="Search products or services…" value={searchText} onChange={(e) => setSearchText(e.target.value)} startContent={<MagnifyingGlass size={16} />} />
      </div>
      <div className="flex max-w-full flex-wrap gap-2">
        <AppButton size="sm" variant={selectedCol === "" ? "primary" : "secondary"} label="All" onPress={() => setSelectedCol("")} />
        {sf.collections.map((collection) => <AppButton key={collection.id} size="sm" variant={selectedCol === collection.slug ? "primary" : "secondary"} label={collection.name} onPress={() => setSelectedCol(collection.slug)} />)}
      </div>
      {productGroups.size === 0 ? <div className="w-full rounded-2xl border border-black/10 p-8 text-center"><p className="font-semibold">No matching items found</p><p className="mt-1 text-xs opacity-75">Try another search or contact {sf.contact_phone || sf.contact_email || "the merchant"} directly.</p></div> : null}
    </section>
  );

  const renderProduct = (product: { product_id: number; id: number }) => {
    const variants = productGroups.get(product.product_id) ?? sf.products.filter((item) => item.product_id === product.product_id);
    const primary = variants[0];
    if (!primary) return null;
    const badge = availabilityLabel(primary);
    return <article key={primary.product_id} className="group h-full overflow-hidden rounded-2xl border border-black/10 bg-white transition-shadow hover:shadow-lg">
      <Link href={`/s/${encodeURIComponent(slug)}/products/${primary.id}`} className="block">
        <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
          {primary.image_urls?.[0] ? <Image src={primary.image_urls[0]} alt={primary.title} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" unoptimized className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" /> : <div className="grid h-full place-items-center text-sm text-gray-400">Image coming soon</div>}
          <span className="absolute left-3 top-3"><StatusPill tone={badge.tone}>{badge.text}</StatusPill></span>
        </div>
        <div className="space-y-2 p-4">
          <h2 className="line-clamp-2 min-h-10 text-sm font-medium text-gray-900">{primary.title}</h2>
          {primary.description ? <p className="line-clamp-2 text-xs leading-5 text-gray-500">{primary.description}</p> : null}
          <p className="tabular text-base font-semibold" style={{ color: sf.accent_color }}>{formatMinorAmount(primary.price_minor, primary.currency, primary.currency_exponent)}{variants.length > 1 ? <span className="ml-1 text-xs font-normal text-gray-500">· {variants.length} options</span> : null}</p>
        </div>
      </Link>
      <div className="px-4 pb-4"><AppButton size="sm" variant="secondary" label={variants.length > 1 ? "Choose options" : "Quick add"} onPress={() => { setActiveProductGroup(variants); setSelectedVariantId(primary.id); }} /></div>
    </article>;
  };

  return (
    <div className="min-h-screen bg-white" style={{ "--store-primary": resolved.palette.primary, "--store-accent": resolved.palette.accent, "--store-heading-font": resolved.heading.headingFamily, "--accent": resolved.palette.primary, "--primary": resolved.palette.primary, fontFamily: resolved.body.bodyFamily, color: "#252a27" } as React.CSSProperties}>
      <Renderer
        store={{ name: sf.name, slug: sf.slug, tagline: sf.tagline, description: sf.description, logo_url: brand.logo_url ?? sf.logo_url, banner_url: sf.banner_url, phone: sf.contact_phone, whatsapp_number: sf.whatsapp_number, address: sf.address, business_hours: sf.business_hours, products: sf.products.map((product) => ({ ...product, is_featured: product.is_featured ?? false })), collections: sf.collections }}
        brand={resolvedBrand}
        sections={sections}
        page={page}
        collectionSlug={collectionSlug}
        productTools={productTools}
        selectCollection={setSelectedCol}
        renderProduct={renderProduct}
        cartCount={totalCount}
        onCartClick={trackCartVisit}
      />

      {page === "product" ? (() => { const product = sf.products.find((item) => item.id === productID); return product ? <EssentialProductDetail key={product.id} slug={slug} product={product} products={sf.products} /> : <div className="mx-auto max-w-4xl px-5 py-16"><h1 className="text-2xl">Product unavailable</h1><Link href={`/s/${slug}/shop`} className="mt-4 block text-sm underline">Back to shop</Link></div>; })() : null}

      {(["policies", "privacy", "returns", "terms", "delivery"] as const).includes(page as "policies" | "privacy" | "returns" | "terms" | "delivery") ? <PolicyPage page={page as "policies" | "privacy" | "returns" | "terms" | "delivery"} policies={[
        { key: "delivery", title: "Delivery", body: sf.delivery_guidance || sf.delivery_methods.join(", ") },
        { key: "returns", title: "Returns & refunds", body: sf.return_policy },
        { key: "privacy", title: "Privacy", body: sf.privacy_policy },
        { key: "terms", title: "Terms of service", body: sf.terms_policy },
        { key: "other", title: "More information", body: sf.custom_policy },
      ]} /> : null}

      {page === "cart" ? <PublicCartPage
        storeName={sf.name}
        currency={sf.currency}
        currencyExponent={sf.currency_exponent}
        deliveryMethods={sf.delivery_methods}
        deliveryAreas={sf.delivery_areas}
        freeDeliveryThreshold={sf.free_delivery_threshold_minor}
        requirePhone={sf.checkout_require_phone}
        requireEmail={sf.checkout_require_email}
        cart={cart}
        onQuantityChange={(id, quantity) => setCart((current) => current.map((line) => line.storefront_product_id === id ? { ...line, quantity } : line))}
        onRemove={(id) => setCart((current) => current.filter((line) => line.storefront_product_id !== id))}
        validatedCart={validatedCart}
        checkoutError={checkoutError}
        confirmedOrder={confirmedOrder}
        customerName={customerName}
        setCustomerName={setCustomerName}
        customerPhone={customerPhone}
        setCustomerPhone={setCustomerPhone}
        customerEmail={customerEmail}
        setCustomerEmail={setCustomerEmail}
        deliveryMethod={deliveryMethod}
        setDeliveryMethod={setDeliveryMethod}
        deliveryAreaId={deliveryAreaId}
        setDeliveryAreaId={setDeliveryAreaId}
        deliveryAddress={deliveryAddress}
        setDeliveryAddress={setDeliveryAddress}
        customerNote={customerNote}
        setCustomerNote={setCustomerNote}
        policyAccepted={policyAccepted}
        setPolicyAccepted={setPolicyAccepted}
        isSubmitting={submitCheckout.isPending}
        onSubmit={() => submitCheckout.mutate()}
        onResetConfirmation={() => setConfirmedOrder(null)}
      /> : null}

      {['home', 'shop', 'collection'].includes(page) ? <StoreServiceCards slug={sf.slug} delivery={sf.delivery_guidance} returns={sf.return_policy} support={sf.contact_email ? 'mailto:' + sf.contact_email : sf.contact_phone ? 'tel:' + sf.contact_phone : undefined} /> : null}
      <EssentialStoreFooter store={{ name: sf.name, slug: sf.slug, logo_url: brand.logo_url ?? sf.logo_url, description: sf.description, tagline: sf.tagline, phone: sf.contact_phone, email: sf.contact_email, whatsapp_number: sf.whatsapp_number, address: sf.address, products: [], collections: sf.collections }} brand={resolvedBrand} showContact={sections.find((section) => section.type === 'contact')?.enabled !== false} />

      <FormDrawer
        isOpen={Boolean(activeProductGroup)}
        onOpenChange={(open) => !open && setActiveProductGroup(null)}
        title={activeProductGroup?.[0]?.title ?? "Product details"}
        description="Select a variant and add to your order request cart. Prices remain estimates until merchant confirmation."
        submitLabel="Add to request cart"
        isSubmitting={false}
        onSubmit={(e) => {
          e.preventDefault();
          const chosen = activeProductGroup?.find((v) => v.id === selectedVariantId) ?? activeProductGroup?.[0];
          if (chosen) addToCart(chosen);
        }}
      >
        {activeProductGroup ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {activeProductGroup.map((v) => (
                <AppButton
                  key={v.id}
                  size="sm"
                  variant={v.id === selectedVariantId ? "primary" : "secondary"}
                  label={`${v.variant_name} (${formatMinorAmount(v.price_minor, v.currency, v.currency_exponent)})`}
                  onPress={() => setSelectedVariantId(v.id)}
                />
              ))}
            </div>
            {(() => {
              const current = activeProductGroup.find((v) => v.id === selectedVariantId) ?? activeProductGroup[0];
              const badge = availabilityLabel(current);
              return (
                <div className="rounded-xl bg-default p-3.5 text-sm space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold tabular">{formatMinorAmount(current.price_minor, current.currency, current.currency_exponent)}</span>
                    <StatusPill tone={badge.tone}>{badge.text}</StatusPill>
                  </div>
                  <p className="text-xs text-muted">{current.description || "Contact merchant for custom inquiries."}</p>
                  <Link href={`/s/${encodeURIComponent(slug)}/products/${current.id}`} className="inline-block text-xs font-medium text-primary underline">
                    Open shareable product page →
                  </Link>
                </div>
              );
            })()}
          </div>
        ) : null}
      </FormDrawer>


    </div>
  );
}

type PublicCartPageProps = {
  storeName: string;
  currency: string;
  currencyExponent: number;
  deliveryMethods: string[];
  deliveryAreas: { id: number; name: string; fee_minor: string }[];
  freeDeliveryThreshold?: string | null;
  requirePhone: boolean;
  requireEmail: boolean;
  cart: CartDraftLine[];
  onQuantityChange: (id: number, quantity: number) => void;
  onRemove: (id: number) => void;
  validatedCart: ValidatedCart | null;
  checkoutError: string;
  confirmedOrder: GuestCheckoutConfirmation | null;
  customerName: string;
  setCustomerName: (value: string) => void;
  customerPhone: string;
  setCustomerPhone: (value: string) => void;
  customerEmail: string;
  setCustomerEmail: (value: string) => void;
  deliveryMethod: string;
  setDeliveryMethod: (value: string) => void;
  deliveryAreaId: string;
  setDeliveryAreaId: (value: string) => void;
  deliveryAddress: string;
  setDeliveryAddress: (value: string) => void;
  customerNote: string;
  setCustomerNote: (value: string) => void;
  policyAccepted: boolean;
  setPolicyAccepted: (value: boolean) => void;
  isSubmitting: boolean;
  onSubmit: () => void;
  onResetConfirmation: () => void;
};

type StorePolicy = { key: string; title: string; body?: string | null };

function PolicyPage({ page, policies }: { page: "policies" | "privacy" | "returns" | "terms" | "delivery"; policies: StorePolicy[] }) {
  const visible = policies.filter((policy) => Boolean(policy.body) && (page === "policies" || policy.key === page));
  const title = page === "policies" ? "Policies & help" : page === "returns" ? "Returns & refunds" : page === "terms" ? "Terms of service" : page === "privacy" ? "Privacy" : "Delivery";
  return <main className="mx-auto w-full max-w-3xl space-y-5 px-5 py-12 sm:px-8 sm:py-16">
    <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Store information</p><h1 className="mt-2 text-3xl font-bold">{title}</h1><p className="mt-2 text-sm text-muted">Information provided by this store for its customers.</p></div>
    {visible.length ? visible.map((policy) => <section key={policy.key} className="rounded-2xl border border-black/10 bg-white p-6"><h2 className="font-semibold">{policy.title}</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-muted">{policy.body}</p></section>) : <section className="rounded-2xl border border-black/10 bg-white p-6 text-sm leading-7 text-muted">This store has not published this information yet. Contact the store directly if you need help.</section>}
  </main>;
}

function PublicCartPage(props: PublicCartPageProps) {
  const subtotal = props.cart.reduce((total, line) => total + BigInt(line.price_minor) * BigInt(line.quantity), BigInt(0)).toString();
  return <main className={`${STORE_WRAP} py-12 sm:py-16`}>
    <div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{props.storeName}</p><h1 className="mt-2 text-3xl font-bold">Your cart</h1><p className="mt-2 text-sm text-muted">Review your items and send an order request to the store.</p></div>
    {props.confirmedOrder ? <section className="max-w-2xl rounded-2xl border border-success/30 bg-success/5 p-6">
      <div className="flex items-center gap-2 font-semibold"><CheckCircle size={20} className="text-success" />Order request received</div>
      <p className="mt-3 text-sm">Reference: <strong>{props.confirmedOrder.order_reference}</strong></p>
      <p className="mt-1 text-sm text-muted">{props.confirmedOrder.message}</p>
      <p className="mt-2 text-sm">Estimated total: {formatMinorAmount(props.confirmedOrder.total_minor, props.confirmedOrder.currency, props.currencyExponent)}</p>
      {props.confirmedOrder.status_token ? <Link href={`/orders/status/${props.confirmedOrder.status_token}`} className="mt-5 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white">Track your order</Link> : null}
      <div><AppButton className="mt-4" variant="secondary" label="Continue shopping" onPress={props.onResetConfirmation} /></div>
    </section> : props.cart.length === 0 ? <section className="rounded-2xl border border-black/10 bg-white p-8 text-center">
      <ShoppingBag size={36} weight="duotone" className="mx-auto text-muted" /><h2 className="mt-3 text-lg font-semibold">Your cart is empty</h2><p className="mt-1 text-sm text-muted">Browse the shop to find something you like.</p><Link href="./shop" className="mt-5 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white">Browse products</Link>
    </section> : <form onSubmit={(event) => { event.preventDefault(); props.onSubmit(); }} className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
      <section className="space-y-5 rounded-2xl border border-black/10 bg-white p-5 sm:p-7">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Items ({props.cart.length})</h2><Link href="./shop" className="text-sm font-medium text-primary">Continue shopping</Link></div>
        {props.validatedCart?.has_changes ? <div className="flex gap-2 rounded-xl border border-warning bg-warning/10 p-3 text-sm"><Warning size={18} className="shrink-0" />Some prices or availability changed. Review the updated total before sending your request.</div> : null}
        {props.checkoutError ? <p role="alert" className="text-sm font-medium text-danger">{props.checkoutError}</p> : null}
        <div className="divide-y divide-black/10">{props.cart.map((line) => <div key={line.storefront_product_id} className="flex items-center justify-between gap-4 py-4">
          <div className="min-w-0"><p className="truncate font-medium">{line.title}</p>{line.variant_name ? <p className="mt-1 text-xs text-muted">{line.variant_name}</p> : null}<p className="mt-1 text-sm text-muted">{formatMinorAmount(line.price_minor, props.currency, props.currencyExponent)} each</p></div>
          <div className="flex shrink-0 items-center gap-2"><AppButton size="sm" variant="secondary" aria-label="Decrease quantity" label="−" onPress={() => props.onQuantityChange(line.storefront_product_id, Math.max(1, line.quantity - 1))} /><span className="w-6 text-center text-sm tabular-nums">{line.quantity}</span><AppButton size="sm" variant="secondary" aria-label="Increase quantity" label="+" onPress={() => props.onQuantityChange(line.storefront_product_id, Math.min(line.max_qty, line.quantity + 1))} /><AppButton size="sm" variant="ghost" isIconOnly aria-label="Remove item" startContent={<Trash />} onPress={() => props.onRemove(line.storefront_product_id)} /></div>
        </div>)}</div>
      </section>
      <section className="space-y-5 rounded-2xl border border-black/10 bg-white p-5 sm:p-7">
        <h2 className="text-lg font-semibold">Contact & delivery</h2>
        <AppInput label="Your name" isRequired value={props.customerName} onChange={(event) => props.setCustomerName(event.target.value)} placeholder="Your name" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"><AppInput label="Phone / WhatsApp" isRequired={props.requirePhone} value={props.customerPhone} onChange={(event) => props.setCustomerPhone(event.target.value)} placeholder="+234…" /><AppInput label="Email" isRequired={props.requireEmail} value={props.customerEmail} onChange={(event) => props.setCustomerEmail(event.target.value)} placeholder="you@example.com" /></div>
        <div className="flex flex-wrap gap-2">{props.deliveryMethods.map((method) => <AppButton key={method} size="sm" variant={props.deliveryMethod === method ? "primary" : "secondary"} label={method.replaceAll("_", " ")} onPress={() => props.setDeliveryMethod(method)} />)}</div>
        {props.deliveryMethod === "merchant_delivery" && props.deliveryAreas.length ? <label className="block space-y-1 text-sm font-medium">Delivery area<select className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm" value={props.deliveryAreaId} onChange={(event) => props.setDeliveryAreaId(event.target.value)}><option value="">Choose an area</option>{props.deliveryAreas.map((area) => <option key={area.id} value={area.id}>{area.name} · {formatMinorAmount(area.fee_minor, props.currency, props.currencyExponent)}</option>)}</select></label> : null}
        {props.deliveryMethod === "merchant_delivery" ? <AppInput label="Delivery address" isRequired value={props.deliveryAddress} onChange={(event) => props.setDeliveryAddress(event.target.value)} placeholder="Street address and landmark" /> : null}
        {props.freeDeliveryThreshold && props.deliveryMethod === "merchant_delivery" ? <p className="text-xs text-muted">Free delivery over {formatMinorAmount(props.freeDeliveryThreshold, props.currency, props.currencyExponent)}.</p> : null}
        <AppInput label="Note for the store (optional)" value={props.customerNote} onChange={(event) => props.setCustomerNote(event.target.value)} placeholder="Preferred delivery or pickup time" />
        <label className="flex items-start gap-2 text-xs text-muted"><input className="mt-0.5" type="checkbox" checked={props.policyAccepted} onChange={(event) => props.setPolicyAccepted(event.target.checked)} /><span>I understand this is an order request and the store will confirm availability and payment.</span></label>
        <div className="border-t border-black/10 pt-4"><div className="flex items-center justify-between text-sm"><span>Estimated subtotal</span><strong>{formatMinorAmount(String(subtotal), props.currency, props.currencyExponent)}</strong></div>{props.validatedCart ? <div className="mt-2 flex items-center justify-between text-sm"><span>Estimated total</span><strong>{formatMinorAmount(props.validatedCart.estimated_total_minor, props.validatedCart.currency, props.validatedCart.currency_exponent)}</strong></div> : null}<AppButton className="mt-5 w-full" type="submit" isLoading={props.isSubmitting} isDisabled={!props.policyAccepted} label="Send order request" /></div>
      </section>
    </form>}
  </main>;
}
