"use client";

import { CheckCircle, CreditCard, Bank, Money, MagnifyingGlass, ShoppingBag, Trash, Warning, Storefront, Truck, Handshake } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppSelect } from "@/components/ui/app-select";
import { ChoiceCards } from "@/components/ui/form-kit";
import { FormDrawer } from "@/components/ui/form-drawer";
import { StatusPill } from "@/components/ui/page";
import { createIdempotencyKey } from "@/lib/utils";
import { financeApi, formatMinorAmount } from "@/lib/money";
import { createDefaultSections, resolvePalette, STORE_THEMES, type BrandSettings, type ThemeKey } from "@/lib/store-themes";
import type { GuestCheckoutConfirmation, ManualBankDetails, PublicCourierRate, PublicDeliveryRatesResponse, PublicStorefrontProduct, StorefrontPickupPoint, ValidatedCart } from "@/types/finance";
import { EssentialStoreFooter, StoreServiceCards } from "./essential-store-footer";
import { EssentialProductDetail } from "./essential-product-detail";
import { ShopperOrdersClient } from "./shopper-orders-client";
import { resolveStoreBrand } from "@/lib/store-themes/brand";
import { readableOn, STORE_WRAP } from "@/lib/store-themes/layout";
import { SideSheet } from "@/components/ui/side-sheet";
import { useRouter } from "next/navigation";

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

export function PublicStorefrontClient({ slug, page = "home", collectionSlug, productID, searchQuery = "" }: { slug: string; page?: "home" | "shop" | "about" | "policies" | "privacy" | "returns" | "terms" | "delivery" | "cart" | "checkout" | "collection" | "product" | "search" | "orders"; productID?: number; collectionSlug?: string; searchQuery?: string }) {
  const router = useRouter();
  const [cartOpen, setCartOpen] = useState(false);
  const [cartNavigationError, setCartNavigationError] = useState("");
  const [openingFullCart, setOpeningFullCart] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [colOverride, setColOverride] = useState<{ base: string; value: string } | null>(null);
  const selectedCol = colOverride && colOverride.base === (collectionSlug ?? "") ? colOverride.value : (collectionSlug ?? "");
  const setSelectedCol = (value: string) => setColOverride({ base: collectionSlug ?? "", value });
  const [cart, setCart] = useState<CartDraftLine[]>([]);
  const [cartToken, setCartToken] = useState("");
  const cartGeneration = useRef(0);
  const [validatedCart, setValidatedCart] = useState<ValidatedCart | null>(null);
  const [activeProductGroup, setActiveProductGroup] = useState<PublicStorefrontProduct[] | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<number>(0);

  const shopperQuery = useQuery({
    queryKey: ["shopper-me"],
    queryFn: () => financeApi.getShopperMe(),
    retry: false,
  });
  const shopper = shopperQuery.data;

  // Checkout state (null defers to signed-in shopper prefill until edited)
  const [customerNameInput, setCustomerName] = useState<string | null>(null);
  const [customerPhoneInput, setCustomerPhone] = useState<string | null>(null);
  const [customerEmailInput, setCustomerEmail] = useState<string | null>(null);
  const [deliveryMethodChoice, setDeliveryMethod] = useState("pickup");
  const [deliveryAreaIdChoice, setDeliveryAreaId] = useState("");
  const [pickupPointIdChoice, setPickupPointId] = useState("");
  const [paymentMethodChoice, setPaymentMethod] = useState("virtual_account");
  const [deliveryAddressInput, setDeliveryAddress] = useState<string | null>(null);
  const [saveDetails, setSaveDetails] = useState(true);
  const [customerNote, setCustomerNote] = useState("");
  const [policyAccepted, setPolicyAccepted] = useState(true);
  const [checkoutError, setCheckoutError] = useState("");
  const [confirmedOrder, setConfirmedOrder] = useState<GuestCheckoutConfirmation | null>(null);
  const [courierRatesData, setCourierRatesData] = useState<PublicDeliveryRatesResponse | null>(null);
  const [selectedCourierCode, setSelectedCourierCode] = useState("");
  const [loadingCourierRates, setLoadingCourierRates] = useState(false);
  const [courierRatesError, setCourierRatesError] = useState("");

  const customerName = customerNameInput ?? shopper?.name ?? "";
  const customerPhone = customerPhoneInput ?? shopper?.phone ?? "";
  const customerEmail = customerEmailInput ?? shopper?.email ?? "";
  const deliveryAddress = deliveryAddressInput ?? shopper?.saved_addresses?.[0] ?? "";

  const storeQuery = useQuery({
    queryKey: ["public-storefront", slug, searchText, selectedCol],
    queryFn: () => financeApi.getPublicStorefront(slug, { q: searchText || undefined, collection: selectedCol || undefined }),
  });
  const sfData = storeQuery.data;
  const deliveryMethod = sfData?.delivery_methods?.length
    ? (sfData.delivery_methods.includes(deliveryMethodChoice) ? deliveryMethodChoice : sfData.delivery_methods[0])
    : deliveryMethodChoice;
  const deliveryAreaId = deliveryAreaIdChoice || (sfData?.delivery_areas?.[0] ? String(sfData.delivery_areas[0].id) : "");
  const pickupPointId = pickupPointIdChoice || (sfData?.pickup_points?.[0] ? String(sfData.pickup_points[0].id) : "");
  const allowedPay: string[] = [];
  if (sfData?.payment_bank_transfer_enabled) allowedPay.push("virtual_account");
  if (sfData?.payment_card_enabled) allowedPay.push("card");
  if (deliveryMethod !== "courier" && sfData?.payment_manual_transfer_enabled) allowedPay.push("manual_transfer");
  if (deliveryMethod !== "courier" && sfData?.payment_cod_enabled) allowedPay.push("cod");
  const paymentMethod = allowedPay.length
    ? (allowedPay.includes(paymentMethodChoice) ? paymentMethodChoice : allowedPay[0])
    : paymentMethodChoice;

  // Restore persistent visitor cart from localStorage + backend
  useEffect(() => {
    const storageKey = `rekordly_cart:${slug}`;
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
    if (!saved) return;
    let cancelled = false;
    const generation = cartGeneration.current;
    financeApi
      .getPublicCart(slug, saved, deliveryMethod, deliveryAreaId ? Number(deliveryAreaId) : undefined)
      .then((c) => {
        if (cancelled || generation !== cartGeneration.current || !c?.lines?.length) return;
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
        if (!cancelled && generation === cartGeneration.current) window.localStorage.removeItem(storageKey);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, deliveryMethod, deliveryAreaId]);

  const syncCartMutation = useMutation({
    mutationFn: ({ lines }: { lines: CartDraftLine[]; generation: number }) =>
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
    onSuccess: (data, { generation }) => {
      if (generation !== cartGeneration.current) return;
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
    const generation = cartGeneration.current;
    const t = setTimeout(() => {
      if (generation !== cartGeneration.current) return;
      syncCartMutation.mutate({ lines: cart, generation });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, deliveryMethod, deliveryAreaId]);

  const selectedCourierRate = deliveryMethod === "courier" && courierRatesData?.rates?.length
    ? (courierRatesData.rates.find((r) => r.service_code === selectedCourierCode) ?? courierRatesData.rates[0])
    : null;

  const handleFetchCourierRates = async () => {
    if (!deliveryAddress.trim() || cart.length === 0) {
      setCourierRatesError("Enter your delivery address first.");
      return;
    }
    setLoadingCourierRates(true);
    setCourierRatesError("");
    try {
      const res = await financeApi.fetchPublicDeliveryRates(slug, {
        address: deliveryAddress.trim(),
        name: customerName.trim(),
        email: customerEmail.trim(),
        phone: customerPhone.trim(),
        lines: cart.map((l) => ({ storefront_product_id: l.storefront_product_id, quantity: String(l.quantity) })),
      });
      setCourierRatesData(res);
      setSelectedCourierCode(res.rates[0]?.service_code ?? "");
    } catch (err: unknown) {
      setCourierRatesData(null);
      setCourierRatesError(err instanceof Error ? err.message : "Could not load courier rates");
    } finally {
      setLoadingCourierRates(false);
    }
  };

  const submitCheckout = useMutation({
    mutationFn: async () => {
      if (deliveryMethod === "courier" && !selectedCourierRate) {
        throw new Error("Get courier rates and choose a courier option before placing your order.");
      }
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
          pickup_point_id: deliveryMethod === "pickup" && pickupPointId ? Number(pickupPointId) : undefined,
          rate_token: deliveryMethod === "courier" ? courierRatesData?.request_token : undefined,
          courier_service_code: deliveryMethod === "courier" ? selectedCourierRate?.service_code : undefined,
          courier_id: deliveryMethod === "courier" ? selectedCourierRate?.courier_id : undefined,
          payment_method: paymentMethod || undefined,
          delivery_address: deliveryAddress,
          customer_note: customerNote,
          save_details: Boolean(shopper) && saveDetails,
          policy_acknowledged: policyAccepted,
        },
        idempotencyKey,
      );
    },
    onSuccess: (res) => {
      setCheckoutError("");
      setConfirmedOrder(res);
      cartGeneration.current += 1;
      setCart([]);
      setCartToken("");
      setValidatedCart(null);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(`rekordly_cart:${slug}`);
      }
      if (res.card_checkout_url) {
        window.location.href = res.card_checkout_url;
        return;
      }
      if (res.status_token) {
        router.push(`/orders/status/${encodeURIComponent(res.status_token)}`);
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

  const themeKey: ThemeKey = sf.theme_key === "studio" || sf.theme_key === "market"
    ? sf.theme_key
    : sf.theme_key === "boutique" || sf.theme_key === "editorial" ? "boutique" : "simple";
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
    setCartOpen(true);
    void financeApi.trackPublicCheckoutStarted(slug).catch(() => {});
    if (cart.length > 0) validateCartMutation.mutate(cart);
  };

  const openCartPage = async (destination: "cart" | "checkout") => {
    if (openingFullCart) return;
    setOpeningFullCart(true);
    setCartNavigationError("");
    try {
      if (cart.length) await syncCartMutation.mutateAsync({ lines: cart, generation: cartGeneration.current });
      setCartOpen(false);
      router.push("/s/" + encodeURIComponent(slug) + "/" + destination);
    } catch (cause) {
      setCartNavigationError(cause instanceof Error ? cause.message : "Could not open your cart.");
    } finally {
      setOpeningFullCart(false);
    }
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
    <div className={themeKey === "studio" ? "min-h-screen bg-[#fcfaf6]" : "min-h-screen bg-white"} style={{ "--store-primary": resolved.palette.primary, "--store-accent": resolved.palette.accent, "--premium-surface": themeKey === "studio" ? "#f3eee7" : "#f1f3f4", "--store-heading-font": resolved.heading.headingFamily, "--accent": resolved.palette.primary, "--primary": resolved.palette.primary, "--primary-foreground": readableOn(resolved.palette.primary), fontFamily: resolved.body.bodyFamily, color: "#252a27" } as React.CSSProperties}>
      <Renderer
        store={{ name: sf.name, slug: sf.slug, tagline: sf.tagline, description: sf.description, logo_url: brand.logo_url ?? sf.logo_url, banner_url: sf.banner_url, phone: sf.contact_phone, whatsapp_number: sf.whatsapp_number, address: sf.address, business_hours: sf.business_hours, products: sf.products.map((product) => ({ ...product, is_featured: product.is_featured ?? false })), collections: sf.collections }}
        brand={resolvedBrand}
        sections={sections}
        page={page === "search" && themeKey === "simple" ? "shop" : page}
        searchQuery={searchQuery}
        onQuickAdd={themeKey === "market" ? (productID) => {
          const product = sf.products.find((item) => item.id === productID);
          if (!product || product.contact_only || product.availability_state === "out_of_stock" || product.availability_state === "request_only" || productGroups.get(product.product_id)?.length !== 1) return;
          addToCart(product);
          setCartOpen(true);
        } : undefined}
        collectionSlug={collectionSlug}
        productTools={productTools}
        selectCollection={setSelectedCol}
        renderProduct={renderProduct}
        cartCount={totalCount}
        onCartClick={trackCartVisit}
      />

      <SideSheet isOpen={cartOpen} onClose={() => setCartOpen(false)} title={`Your cart (${totalCount})`} footer={<div className="w-full space-y-4">
        {cart.length ? <div className="flex justify-between text-sm"><span>Subtotal</span><strong>{formatMinorAmount(cart.reduce((sum, line) => sum + BigInt(line.price_minor) * BigInt(line.quantity), BigInt(0)).toString(), sf.currency, sf.currency_exponent)}</strong></div> : null}
        {cartNavigationError ? <p role="alert" className="text-sm text-danger">{cartNavigationError}</p> : null}
        <div className="flex justify-end gap-2"><AppButton variant="ghost" label="Continue shopping" onPress={() => setCartOpen(false)} /><AppButton label="View full cart" isLoading={openingFullCart} onPress={() => void openCartPage("cart")} /></div>
      </div>}>
        {cart.length ? <ul className="divide-y divide-border">{cart.map((line) => <li key={line.storefront_product_id} className="flex items-start justify-between gap-4 py-4"><div className="min-w-0"><p className="text-sm font-medium">{line.title}</p>{line.variant_name ? <p className="mt-1 text-xs text-muted">{line.variant_name}</p> : null}<p className="mt-2 text-xs text-muted">Quantity: {line.quantity}</p></div><span className="shrink-0 text-sm font-semibold">{formatMinorAmount((BigInt(line.price_minor) * BigInt(line.quantity)).toString(), sf.currency, sf.currency_exponent)}</span></li>)}</ul> : <div className="py-10 text-center"><ShoppingBag size={36} className="mx-auto text-muted" /><p className="mt-4 text-sm font-medium">Your cart is empty</p></div>}
      </SideSheet>

      {page === "product" ? (() => { const product = sf.products.find((item) => item.id === productID); return product ? <EssentialProductDetail key={product.id} slug={slug} product={product} products={sf.products} contact={{ phone: sf.contact_phone, email: sf.contact_email }} layout={themeKey === "studio" || themeKey === "market" ? themeKey : "essential"} /> : <div className="mx-auto max-w-4xl px-5 py-16"><h1 className="text-2xl">Product unavailable</h1><Link href={`/s/${slug}/shop`} className="mt-4 block text-sm underline">Back to shop</Link></div>; })() : null}

      {(["policies", "privacy", "returns", "terms", "delivery"] as const).includes(page as "policies" | "privacy" | "returns" | "terms" | "delivery") ? <PolicyPage page={page as "policies" | "privacy" | "returns" | "terms" | "delivery"} policies={[
        { key: "delivery", title: "Delivery", body: sf.delivery_guidance || sf.delivery_methods.join(", ") },
        { key: "returns", title: "Returns & refunds", body: sf.return_policy },
        { key: "privacy", title: "Privacy", body: sf.privacy_policy },
        { key: "terms", title: "Terms of service", body: sf.terms_policy },
        { key: "other", title: "More information", body: sf.custom_policy },
      ]} /> : null}

      {page === "orders" ? (
        <Suspense fallback={<div className="mx-auto max-w-3xl px-5 py-12 text-sm text-muted">Loading your orders…</div>}>
          <ShopperOrdersClient storeSlug={slug} storeName={sf.name} />
        </Suspense>
      ) : null}

      {page === "cart" || page === "checkout" ? <PublicCartPage
        storeName={sf.name}
        onCheckout={() => void openCartPage("checkout")}
        isOpeningCheckout={openingFullCart}
        mode={page === "checkout" ? "checkout" : themeKey === "studio" || themeKey === "market" ? "cart" : "combined"}
        currency={sf.currency}
        currencyExponent={sf.currency_exponent}
        deliveryMethods={sf.delivery_methods}
        deliveryAreas={sf.delivery_areas}
        pickupPoints={sf.pickup_points ?? []}
        pickupPointId={pickupPointId}
        setPickupPointId={setPickupPointId}
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        enableBankTransfer={Boolean(sf.payment_bank_transfer_enabled)}
        enableCard={Boolean(sf.payment_card_enabled)}
        enableManualTransfer={Boolean(sf.payment_manual_transfer_enabled)}
        enableCod={Boolean(sf.payment_cod_enabled)}
        feeBearer={sf.fee_bearer ?? "merchant"}
        manualBankDetails={sf.manual_bank_details ?? null}
        freeDeliveryThreshold={sf.free_delivery_threshold_minor}
        requirePhone={sf.checkout_require_phone}
        requireEmail={sf.checkout_require_email}
        cart={cart}
        onQuantityChange={(id, quantity) => setCart((current) => current.map((line) => line.storefront_product_id === id ? { ...line, quantity } : line))}
        onRemove={(id) => {
          const remaining = cart.filter((line) => line.storefront_product_id !== id);
          if (!remaining.length) {
            cartGeneration.current += 1;
            window.localStorage.removeItem("rekordly_cart:" + slug);
            setCartToken("");
            setValidatedCart(null);
          }
          setCart(remaining);
        }}
        validatedCart={validatedCart}
        checkoutError={checkoutError || cartNavigationError}
        confirmedOrder={confirmedOrder}
        customerName={customerName}
        setCustomerName={setCustomerName}
        customerPhone={customerPhone}
        setCustomerPhone={setCustomerPhone}
        customerEmail={customerEmail}
        setCustomerEmail={setCustomerEmail}
        deliveryMethod={deliveryMethod}
        setDeliveryMethod={(m) => { setDeliveryMethod(m); setCourierRatesError(""); }}
        deliveryAreaId={deliveryAreaId}
        setDeliveryAreaId={setDeliveryAreaId}
        deliveryAddress={deliveryAddress}
        setDeliveryAddress={(addr) => { setDeliveryAddress(addr); setCourierRatesData(null); setSelectedCourierCode(""); setCourierRatesError(""); }}
        shipbubbleEnabled={Boolean(sf.shipbubble_enabled)}
        courierRates={courierRatesData?.rates ?? []}
        selectedCourierCode={selectedCourierRate?.service_code ?? ""}
        setSelectedCourierCode={setSelectedCourierCode}
        loadingCourierRates={loadingCourierRates}
        courierRatesError={courierRatesError}
        onFetchCourierRates={() => void handleFetchCourierRates()}
        signedInShopper={Boolean(shopper)}
        savedAddresses={shopper?.saved_addresses ?? []}
        saveDetails={saveDetails}
        setSaveDetails={setSaveDetails}
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
  mode: "cart" | "checkout" | "combined";
  onCheckout: () => void;
  isOpeningCheckout: boolean;
  storeName: string;
  currency: string;
  currencyExponent: number;
  deliveryMethods: string[];
  deliveryAreas: { id: number; name: string; fee_minor: string; state?: string | null; estimate_text?: string }[];
  pickupPoints: StorefrontPickupPoint[];
  pickupPointId: string;
  setPickupPointId: (value: string) => void;
  paymentMethod: string;
  setPaymentMethod: (value: string) => void;
  enableBankTransfer: boolean;
  enableCard: boolean;
  enableManualTransfer: boolean;
  enableCod: boolean;
  feeBearer: "merchant" | "customer";
  manualBankDetails: ManualBankDetails | null;
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
  shipbubbleEnabled: boolean;
  courierRates: PublicCourierRate[];
  selectedCourierCode: string;
  setSelectedCourierCode: (value: string) => void;
  loadingCourierRates: boolean;
  courierRatesError: string;
  onFetchCourierRates: () => void;
  signedInShopper: boolean;
  savedAddresses: string[];
  saveDetails: boolean;
  setSaveDetails: (value: boolean) => void;
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
  const subtotalBig = props.cart.reduce((total, line) => total + BigInt(line.price_minor) * BigInt(line.quantity), BigInt(0));
  const selectedCourierRate = props.deliveryMethod === "courier" && props.courierRates.length
    ? (props.courierRates.find((r) => r.service_code === props.selectedCourierCode) ?? props.courierRates[0])
    : null;
  const deliveryMinorBig = props.deliveryMethod === "courier"
    ? (selectedCourierRate ? BigInt(selectedCourierRate.total_minor || "0") : BigInt(0))
    : (props.validatedCart ? BigInt(props.validatedCart.delivery_fee_minor || "0") : BigInt(0));
  const baseTotalBig = subtotalBig + deliveryMinorBig;
  const isOnlinePay = props.paymentMethod === "virtual_account" || props.paymentMethod === "card";
  let processingFeeBig = BigInt(0);
  if (props.feeBearer === "customer" && isOnlinePay && baseTotalBig > BigInt(0)) {
    const rawFee = (baseTotalBig * BigInt(15)) / BigInt(1000);
    processingFeeBig = rawFee > BigInt(200000) ? BigInt(200000) : rawFee;
  }
  const finalTotalBig = baseTotalBig + processingFeeBig;
  const emailRequired = props.requireEmail || isOnlinePay;
  const paymentOptions: { key: string; label: string; description: string; icon: typeof Bank }[] = [];
  if (props.enableBankTransfer) {
    paymentOptions.push({ key: "virtual_account", label: "Bank transfer (instant)", description: "Get a dedicated transfer account for this order", icon: Bank });
  }
  if (props.enableCard) {
    paymentOptions.push({ key: "card", label: "Card or USSD", description: "Pay immediately by card or USSD", icon: CreditCard });
  }
  if (props.deliveryMethod !== "courier" && props.enableManualTransfer) {
    paymentOptions.push({ key: "manual_transfer", label: "Bank transfer to store account", description: "Transfer to the store's bank account and confirm", icon: Bank });
  }
  if (props.deliveryMethod !== "courier" && props.enableCod) {
    paymentOptions.push({ key: "cod", label: props.deliveryMethod === "pickup" ? "Pay at pickup" : "Pay on delivery", description: "Pay with cash or POS when you receive your order", icon: Money });
  }
  const selectedPickup = props.pickupPoints.find((pp) => String(pp.id) === props.pickupPointId);

  return <main className={`${STORE_WRAP} py-12 sm:py-16`}>
    <div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{props.storeName}</p><h1 className="mt-2 text-3xl font-bold" style={{ fontFamily: "var(--store-heading-font)" }}>{props.mode === "checkout" ? "Checkout" : "Your cart"}</h1></div>
    {props.confirmedOrder ? <section className="max-w-2xl rounded-2xl border border-success/30 bg-success/5 p-6">
      <div className="flex items-center gap-2 font-semibold"><CheckCircle size={20} className="text-success" />Order placed</div>
      <p className="mt-3 text-sm">Reference: <strong>{props.confirmedOrder.order_reference}</strong></p>
      <p className="mt-1 text-sm text-muted">{props.confirmedOrder.message}</p>
      <p className="mt-2 text-sm">Total: {formatMinorAmount(props.confirmedOrder.total_minor, props.confirmedOrder.currency, props.currencyExponent)}</p>
      {props.confirmedOrder.status_token ? <Link href={`/orders/status/${props.confirmedOrder.status_token}`} className="mt-5 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white">View order & payment details</Link> : null}
      <div><AppButton className="mt-4" variant="secondary" label="Continue shopping" onPress={props.onResetConfirmation} /></div>
    </section> : props.cart.length === 0 ? <section className="rounded-2xl border border-black/10 bg-white p-8 text-center">
      <ShoppingBag size={36} weight="duotone" className="mx-auto text-muted" /><h2 className="mt-3 text-lg font-semibold">Your cart is empty</h2><p className="mt-1 text-sm text-muted">Browse the shop to find something you like.</p><Link href="./shop" className="mt-5 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white">Browse products</Link>
    </section> : <form onSubmit={(event) => { event.preventDefault(); props.onSubmit(); }} className="grid items-start gap-6 lg:grid-cols-[1fr_400px]">
      <section className="space-y-5 rounded-2xl border border-black/10 bg-white p-5 sm:p-7">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Items ({props.cart.length})</h2><Link href="./shop" className="text-sm font-medium text-primary">Continue shopping</Link></div>
        {props.validatedCart?.has_changes ? <div className="flex gap-2 rounded-xl border border-warning bg-warning/10 p-3 text-sm"><Warning size={18} className="shrink-0" />Some prices or availability changed. Review the updated total before placing your order.</div> : null}
        {props.checkoutError ? <p role="alert" className="text-sm font-medium text-danger">{props.checkoutError}</p> : null}
        <div className="divide-y divide-black/10">{props.cart.map((line) => <div key={line.storefront_product_id} className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="min-w-0"><p className="truncate font-medium">{line.title}</p>{line.variant_name ? <p className="mt-1 text-xs text-muted">{line.variant_name}</p> : null}<p className="mt-1 text-sm text-muted">{formatMinorAmount(line.price_minor, props.currency, props.currencyExponent)} each</p></div>
          <div className="flex shrink-0 items-center gap-2"><AppButton size="sm" variant="secondary" aria-label="Decrease quantity" label="−" onPress={() => props.onQuantityChange(line.storefront_product_id, Math.max(1, line.quantity - 1))} /><span className="w-6 text-center text-sm tabular-nums">{line.quantity}</span><AppButton size="sm" variant="secondary" aria-label="Increase quantity" label="+" onPress={() => props.onQuantityChange(line.storefront_product_id, Math.min(line.max_qty, line.quantity + 1))} /><AppButton size="sm" variant="ghost" isIconOnly aria-label="Remove item" startContent={<Trash />} onPress={() => props.onRemove(line.storefront_product_id)} /></div>
        </div>)}</div>
      </section>
      {props.mode === "cart" ? <section className="space-y-4 rounded-2xl border border-black/10 bg-white p-5 sm:p-7">
        <h2 className="text-lg font-semibold">Order summary</h2>
        <div className="flex justify-between gap-3 text-sm"><span>Subtotal</span><strong>{formatMinorAmount(subtotalBig.toString(), props.currency, props.currencyExponent)}</strong></div>
        <AppButton className="w-full" label="Continue to checkout" isLoading={props.isOpeningCheckout} onPress={props.onCheckout} />
      </section> : <section className="space-y-5 rounded-2xl border border-black/10 bg-white p-5 sm:p-7">
        <h2 className="text-lg font-semibold">1. Contact</h2>
        <AppInput label="Your name" isRequired value={props.customerName} onChange={(event) => props.setCustomerName(event.target.value)} placeholder="Your name" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"><AppInput label="Phone / WhatsApp" isRequired={props.requirePhone} value={props.customerPhone} onChange={(event) => props.setCustomerPhone(event.target.value)} placeholder="+234…" /><AppInput label="Email" type="email" isRequired={emailRequired} value={props.customerEmail} onChange={(event) => props.setCustomerEmail(event.target.value)} placeholder="you@example.com" /></div>

        <h2 className="pt-2 text-lg font-semibold">2. Delivery method</h2>
        <ChoiceCards layout="list" label="How would you like to receive your order?" value={props.deliveryMethod} onChange={props.setDeliveryMethod} options={props.deliveryMethods.filter((method) => method !== "courier" || props.shipbubbleEnabled).map((method) => ({ key: method, label: method === "pickup" ? "Pickup" : method === "merchant_delivery" ? "Store delivery" : method === "courier" ? "Courier delivery" : "Arrange my own", description: method === "pickup" ? "Collect from a store pickup point" : method === "merchant_delivery" ? "Delivered to your address" : method === "courier" ? "Tracked doorstep delivery (online payment required)" : "Send your own dispatch rider", icon: method === "pickup" ? Storefront : method === "merchant_delivery" || method === "courier" ? Truck : Handshake }))} />

        {props.deliveryMethod === "pickup" && props.pickupPoints.length > 0 ? (
          <div className="space-y-2">
            <AppSelect
              label="Pickup location"
              placeholder="Choose a pickup point"
              isRequired
              selectedKey={props.pickupPointId || undefined}
              onSelectionChange={props.setPickupPointId}
              options={props.pickupPoints.map((pp) => ({ key: String(pp.id), label: pp.name, description: pp.address || pp.pickup_note || "Store pickup desk" }))}
            />
            {selectedPickup && (selectedPickup.address || selectedPickup.pickup_note) ? (
              <p className="rounded-xl bg-black/5 p-3 text-xs text-muted">
                {selectedPickup.address ? <span className="block font-medium text-foreground">{selectedPickup.address}</span> : null}
                {selectedPickup.pickup_note ? <span className="mt-1 block">{selectedPickup.pickup_note}</span> : null}
              </p>
            ) : null}
          </div>
        ) : null}

        {props.deliveryMethod === "merchant_delivery" && props.deliveryAreas.length ? <AppSelect label="Delivery area" placeholder="Choose a delivery area" isRequired selectedKey={props.deliveryAreaId || undefined} onSelectionChange={props.setDeliveryAreaId} options={props.deliveryAreas.map((area) => ({ key: String(area.id), label: area.state ? `${area.name} (${area.state})` : area.name, description: [area.fee_minor === "0" ? "Free" : formatMinorAmount(area.fee_minor, props.currency, props.currencyExponent), area.estimate_text].filter(Boolean).join(" · ") }))} /> : null}
        {(props.deliveryMethod === "merchant_delivery" || props.deliveryMethod === "courier") && props.signedInShopper && props.savedAddresses.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted">Saved addresses</p>
            <div className="flex flex-wrap gap-1.5">
              {props.savedAddresses.map((addr) => (
                <button
                  key={addr}
                  type="button"
                  onClick={() => props.setDeliveryAddress(addr)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${props.deliveryAddress === addr ? "border-primary bg-primary/10 font-medium text-primary" : "border-black/15 text-muted hover:border-black/30"}`}
                >
                  {addr}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {props.deliveryMethod === "merchant_delivery" || props.deliveryMethod === "courier" ? <AppInput label="Delivery address" isRequired value={props.deliveryAddress} onChange={(event) => props.setDeliveryAddress(event.target.value)} placeholder="Street address, city and state" /> : null}
        {props.deliveryMethod === "courier" ? (
          <div className="space-y-3 rounded-xl border border-black/10 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted">Get live shipping quotes for your address</p>
              <AppButton size="sm" variant="secondary" label={props.loadingCourierRates ? "Loading rates..." : props.courierRates.length ? "Refresh rates" : "Get courier rates"} isLoading={props.loadingCourierRates} onPress={props.onFetchCourierRates} />
            </div>
            {props.courierRatesError ? <p role="alert" className="text-xs text-danger">{props.courierRatesError}</p> : null}
            {props.courierRates.length > 0 ? (
              <ChoiceCards
                layout="list"
                label="Choose a courier"
                value={selectedCourierRate?.service_code ?? ""}
                onChange={props.setSelectedCourierCode}
                options={props.courierRates.map((rate) => ({
                  key: rate.service_code,
                  label: rate.courier_name,
                  description: [formatMinorAmount(rate.total_minor, props.currency, props.currencyExponent), rate.estimate_text].filter(Boolean).join(" · "),
                  icon: Truck,
                }))}
              />
            ) : null}
          </div>
        ) : null}
        {props.freeDeliveryThreshold && props.deliveryMethod === "merchant_delivery" ? <p className="text-xs text-muted">Free delivery over {formatMinorAmount(props.freeDeliveryThreshold, props.currency, props.currencyExponent)}.</p> : null}

        {paymentOptions.length > 0 ? (
          <>
            <h2 className="pt-2 text-lg font-semibold">3. Payment method</h2>
            <ChoiceCards layout="list" label="Choose how to pay" value={props.paymentMethod} onChange={props.setPaymentMethod} options={paymentOptions} />
            {props.paymentMethod === "manual_transfer" && props.manualBankDetails ? (
              <div className="rounded-xl bg-black/5 p-3 text-xs space-y-1">
                <p className="font-semibold">Transfer to {props.manualBankDetails.bank_name}</p>
                <p className="font-mono text-sm">{props.manualBankDetails.account_number}</p>
                <p className="text-muted">{props.manualBankDetails.account_name}</p>
              </div>
            ) : null}
          </>
        ) : props.deliveryMethod === "courier" ? (
          <p className="text-xs text-danger">Courier delivery requires an online payment method enabled on this store.</p>
        ) : null}

        <AppInput label="Note for the store (optional)" value={props.customerNote} onChange={(event) => props.setCustomerNote(event.target.value)} placeholder="Preferred delivery or pickup time" />
        {props.signedInShopper ? (
          <label className="flex items-start gap-2 text-xs text-muted">
            <input className="mt-0.5" type="checkbox" checked={props.saveDetails} onChange={(event) => props.setSaveDetails(event.target.checked)} />
            <span>Save my details for faster checkout next time.</span>
          </label>
        ) : null}
        <label className="flex items-start gap-2 text-xs text-muted"><input className="mt-0.5" type="checkbox" checked={props.policyAccepted} onChange={(event) => props.setPolicyAccepted(event.target.checked)} /><span>Items are held briefly while you complete checkout.</span></label>
        <div className="space-y-2 border-t border-black/10 pt-4 text-sm">
          <div className="flex items-center justify-between"><span>Items subtotal</span><span>{formatMinorAmount(subtotalBig.toString(), props.currency, props.currencyExponent)}</span></div>
          {props.deliveryMethod === "merchant_delivery" || props.deliveryMethod === "courier" ? (
            <div className="flex items-center justify-between"><span>{props.deliveryMethod === "courier" ? "Courier shipping" : "Delivery"}</span><span>{props.deliveryMethod === "courier" && !selectedCourierRate ? "Select rate" : deliveryMinorBig === BigInt(0) ? "Free" : formatMinorAmount(deliveryMinorBig.toString(), props.currency, props.currencyExponent)}</span></div>
          ) : null}
          {processingFeeBig > BigInt(0) ? (
            <div className="flex items-center justify-between"><span>Payment processing fee</span><span>{formatMinorAmount(processingFeeBig.toString(), props.currency, props.currencyExponent)}</span></div>
          ) : null}
          <div className="flex items-center justify-between border-t border-black/10 pt-2 text-base font-bold">
            <span>Total</span>
            <strong className="tabular-nums">{formatMinorAmount(finalTotalBig.toString(), props.currency, props.currencyExponent)}</strong>
          </div>
          <AppButton className="mt-4 w-full" type="submit" isLoading={props.isSubmitting} isDisabled={!props.policyAccepted || (props.deliveryMethod === "courier" && (!selectedCourierRate || paymentOptions.length === 0))} label={isOnlinePay ? `Pay ${formatMinorAmount(finalTotalBig.toString(), props.currency, props.currencyExponent)}` : "Place order"} />
        </div>
      </section>}
    </form>}
  </main>;
}
