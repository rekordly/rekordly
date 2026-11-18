"use client";

import { useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { financeApi } from "@/lib/money";

export function PublicProductActions({ slug, productID, priceMinor, unavailable }: { slug: string; productID: number; priceMinor: string; unavailable?: boolean }) {
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState("");

  const addToCart = async () => {
    setIsAdding(true);
    setError("");
    try {
      const storageKey = `rekordly_cart:${slug}`;
      const existingToken = window.localStorage.getItem(storageKey) ?? undefined;
      const current = existingToken ? await financeApi.getPublicCart(slug, existingToken, "pickup").catch(() => null) : null;
      const lines = (current?.lines ?? []).map((line) => ({
        storefront_product_id: line.storefront_product_id,
        quantity: String(Number(line.quantity) || 1),
        expected_price_minor: line.unit_price_minor,
      }));
      const existingLine = lines.find((line) => line.storefront_product_id === productID);
      if (existingLine) existingLine.quantity = String(Number(existingLine.quantity) + 1);
      else lines.push({ storefront_product_id: productID, quantity: "1", expected_price_minor: priceMinor });

      const updated = await financeApi.upsertPublicCart(slug, { cart_token: current?.cart_token ?? existingToken, lines, delivery_method: "pickup" });
      if (updated.cart_token) window.localStorage.setItem(storageKey, updated.cart_token);
      window.location.assign(`/s/${encodeURIComponent(slug)}/cart`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add this item to your cart.");
      setIsAdding(false);
    }
  };

  return <div className="space-y-2 pt-2">
    <AppButton className="w-full" size="lg" isLoading={isAdding} isDisabled={unavailable} label={unavailable ? "Out of stock" : "Add to cart"} onPress={addToCart} />
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
  </div>;
}
