"use client";

import { CheckCircle, MagnifyingGlass, ShoppingBag, ShoppingCart, Trash, Warning } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { FormDrawer } from "@/components/ui/form-drawer";
import { StatusPill } from "@/components/ui/page";
import { createIdempotencyKey } from "@/lib/utils";
import { financeApi, formatMinorAmount } from "@/lib/money";
import type { GuestCheckoutConfirmation, PublicStorefrontProduct, ValidatedCart } from "@/types/finance";

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
      text: p.available_quantity ? `In stock (${p.available_quantity})` : "In stock",
      tone: "success",
    };
  }
  if (p.availability_state === "low_stock") return { text: "Low stock", tone: "warning" };
  if (p.availability_state === "request_only") return { text: "Available on request", tone: "neutral" };
  return { text: "Out of stock", tone: "danger" };
}

export function PublicStorefrontClient({ slug }: { slug: string }) {
  const [searchText, setSearchText] = useState("");
  const [selectedCol, setSelectedCol] = useState("");
  const [cart, setCart] = useState<CartDraftLine[]>([]);
  const [cartToken, setCartToken] = useState("");
  const [validatedCart, setValidatedCart] = useState<ValidatedCart | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [activeProductGroup, setActiveProductGroup] = useState<PublicStorefrontProduct[] | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<number>(0);

  // Checkout state
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [policyAccepted, setPolicyAccepted] = useState(true);
  const [checkoutError, setCheckoutError] = useState("");
  const [confirmedOrder, setConfirmedOrder] = useState<GuestCheckoutConfirmation | null>(null);

  const storeQuery = useQuery({
    queryKey: ["public-storefront", slug, searchText, selectedCol],
    queryFn: () => financeApi.getPublicStorefront(slug, { q: searchText || undefined, collection: selectedCol || undefined }),
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
      }),
    onSuccess: (data) => setValidatedCart(data),
  });

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

  const openCart = () => {
    if (cart.length > 0) validateCartMutation.mutate(cart);
    setIsCartOpen(true);
  };

  const totalCount = cart.reduce((acc, i) => acc + i.quantity, 0);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: sf.background_color, color: sf.text_color }}>
      <header className="sticky top-0 z-20 border-b border-black/10 text-white" style={{ backgroundColor: sf.primary_color }}>
        <div className="mx-auto max-w-6xl px-4 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {sf.logo_url ? <img src={sf.logo_url} alt={sf.name} className="h-9 w-9 rounded-lg object-cover bg-white" /> : null}
            <div className="min-w-0">
              <p className="font-bold text-base truncate">{sf.name}</p>
              {sf.tagline ? <p className="text-xs opacity-85 truncate">{sf.tagline}</p> : null}
            </div>
          </div>
          <AppButton
            size="sm"
            variant="secondary"
            startContent={<ShoppingCart weight="duotone" />}
            label={`Request cart (${totalCount})`}
            onPress={openCart}
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 space-y-6">
        {sf.description ? (
          <section className="rounded-2xl border border-black/10 p-5 bg-black/[0.02]">
            <p className="text-sm opacity-90">{sf.description}</p>
            <p className="text-xs opacity-70 mt-2">Submit an order request without an account — we confirm availability, delivery and payment directly.</p>
          </section>
        ) : null}

        <section className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[220px]">
            <AppInput
              placeholder="Search products or services…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              startContent={<MagnifyingGlass size={16} />}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <AppButton size="sm" variant={selectedCol === "" ? "primary" : "secondary"} label="All" onPress={() => setSelectedCol("")} />
            {sf.collections.map((c) => (
              <AppButton key={c.id} size="sm" variant={selectedCol === c.slug ? "primary" : "secondary"} label={c.name} onPress={() => setSelectedCol(c.slug)} />
            ))}
          </div>
        </section>

        {Array.from(productGroups.values()).length === 0 ? (
          <div className="rounded-2xl border border-black/10 p-8 text-center space-y-2">
            <p className="font-semibold">No matching items found</p>
            <p className="text-xs opacity-75">Try another search or contact {sf.contact_phone || sf.contact_email || "the merchant"} directly.</p>
          </div>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from(productGroups.values()).map((variants) => {
              const primary = variants[0];
              const badge = availabilityLabel(primary);
              return (
                <div key={primary.product_id} className="rounded-2xl border border-black/10 bg-white/80 p-4 flex flex-col justify-between gap-3 shadow-xs">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-semibold text-sm text-gray-900">{primary.title}</h2>
                      <StatusPill tone={badge.tone}>{badge.text}</StatusPill>
                    </div>
                    {primary.description ? <p className="text-xs text-gray-600 line-clamp-2">{primary.description}</p> : null}
                    <p className="text-base font-bold tabular" style={{ color: sf.accent_color }}>
                      {formatMinorAmount(primary.price_minor, primary.currency, primary.currency_exponent)}
                      {variants.length > 1 ? ` · ${variants.length} options` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <AppButton
                      size="sm"
                      variant="secondary"
                      label={variants.length > 1 ? "Select option" : "View & add"}
                      onPress={() => {
                        setActiveProductGroup(variants);
                        setSelectedVariantId(primary.id);
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </main>

      <footer className="border-t border-black/10 px-4 py-6 text-xs opacity-80">
        <div className="mx-auto max-w-6xl grid sm:grid-cols-3 gap-4">
          <div>
            <p className="font-semibold">Contact</p>
            <p>{sf.contact_phone || "—"} {sf.contact_email ? `· ${sf.contact_email}` : ""}</p>
            <p>{sf.address || ""}</p>
          </div>
          <div>
            <p className="font-semibold">Delivery & Pickup</p>
            <p>{sf.delivery_guidance || sf.delivery_methods.join(", ")}</p>
          </div>
          <div>
            <p className="font-semibold">Policies</p>
            <p>{sf.return_policy || sf.terms_policy || "Standard merchant terms apply."}</p>
          </div>
        </div>
      </footer>

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
                </div>
              );
            })()}
          </div>
        ) : null}
      </FormDrawer>

      <FormDrawer
        isOpen={isCartOpen}
        onOpenChange={(open) => !open && setIsCartOpen(false)}
        title={confirmedOrder ? `Order request ${confirmedOrder.order_reference}` : "Order request cart"}
        description={
          confirmedOrder
            ? confirmedOrder.message
            : "No online payment is charged now. Submitting sends your request to the merchant to confirm stock, price, and payment arrangement."
        }
        submitLabel={confirmedOrder ? "Close" : "Submit order request"}
        isSubmitting={submitCheckout.isPending}
        onSubmit={(e) => {
          e.preventDefault();
          if (confirmedOrder) {
            setConfirmedOrder(null);
            setIsCartOpen(false);
          } else {
            submitCheckout.mutate();
          }
        }}
      >
        {confirmedOrder ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-xl bg-default p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <CheckCircle size={18} className="text-success" />
                Reference: {confirmedOrder.order_reference}
              </div>
              <p className="text-xs text-muted">Status: {confirmedOrder.commercial_status} · Estimated total: {formatMinorAmount(confirmedOrder.total_minor, confirmedOrder.currency, sf.currency_exponent)}</p>
              {confirmedOrder.status_token ? (
                <Link
                  href={`/orders/status/${confirmedOrder.status_token}`}
                  className="inline-block mt-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white"
                >
                  Track & Manage Order Status
                </Link>
              ) : null}
            </div>
          </div>
        ) : cart.length === 0 ? (
          <p className="text-sm text-muted">Your cart is empty.</p>
        ) : (
          <div className="space-y-4">
            {validatedCart?.has_changes ? (
              <div className="rounded-xl border border-warning bg-warning/10 p-3 text-xs flex items-start gap-2">
                <Warning size={16} className="shrink-0 mt-0.5" />
                <span>Some cart item prices or availability changed. Review updated totals before submitting.</span>
              </div>
            ) : null}
            {checkoutError ? <p className="text-xs text-danger font-medium">{checkoutError}</p> : null}
            <div className="space-y-2">
              {cart.map((item) => (
                <div key={item.storefront_product_id} className="flex items-center justify-between gap-2 rounded-xl bg-default p-2.5 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{item.title}</p>
                    <p className="text-muted tabular">{formatMinorAmount(item.price_minor, sf.currency, sf.currency_exponent)} × {item.quantity}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <AppButton size="sm" variant="secondary" label="-" onPress={() => setCart((c) => c.map((x) => (x.storefront_product_id === item.storefront_product_id ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x)))} />
                    <AppButton size="sm" variant="secondary" label="+" onPress={() => setCart((c) => c.map((x) => (x.storefront_product_id === item.storefront_product_id ? { ...x, quantity: Math.min(x.max_qty, x.quantity + 1) } : x)))} />
                    <AppButton isIconOnly size="sm" variant="ghost" aria-label="Remove item" startContent={<Trash />} onPress={() => setCart((c) => c.filter((x) => x.storefront_product_id !== item.storefront_product_id))} />
                  </div>
                </div>
              ))}
              {validatedCart ? (
                <div className="flex justify-between text-xs font-semibold pt-1">
                  <span>Estimated Total ({deliveryMethod === "merchant_delivery" ? "incl. est. delivery" : "pickup"})</span>
                  <span className="tabular">{formatMinorAmount(validatedCart.estimated_total_minor, validatedCart.currency, validatedCart.currency_exponent)}</span>
                </div>
              ) : null}
            </div>

            <div className="space-y-2.5 pt-2 border-t border-default">
              <AppInput label="Your name" isRequired value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Ada Lovelace" />
              <div className="grid grid-cols-2 gap-2">
                <AppInput label="Phone / WhatsApp" isRequired={sf.checkout_require_phone} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="+234800..." />
                <AppInput label="Email" isRequired={sf.checkout_require_email} value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="ada@example.com" />
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {sf.delivery_methods.map((m) => (
                  <AppButton key={m} size="sm" variant={deliveryMethod === m ? "primary" : "secondary"} label={m.replace("_", " ")} onPress={() => setDeliveryMethod(m)} />
                ))}
              </div>
              {deliveryMethod === "merchant_delivery" ? (
                <AppInput label="Delivery address" isRequired value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Street address & landmark" />
              ) : null}
              <AppInput label="Note for merchant (optional)" value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} placeholder="Preferred pickup/delivery time" />
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={policyAccepted} onChange={(e) => setPolicyAccepted(e.target.checked)} />
                I acknowledge this is an order request subject to merchant confirmation.
              </label>
            </div>
          </div>
        )}
      </FormDrawer>
    </div>
  );
}
