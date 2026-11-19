"use client";

// Essential template: one product's page, on the shared store width.

import { ArrowLeft, ImageSquare } from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { formatMinorAmount } from "@/lib/money";
import { STORE_SURFACE, STORE_WRAP } from "@/lib/store-themes/layout";
import type { PublicStorefrontProduct } from "@/types/finance";

import { PremiumCartButton, PremiumGrid } from "@/lib/store-themes/premium";
import { PublicProductActions } from "./public-product-actions";
import { ChoiceCards } from "@/components/ui/form-kit";

export function EssentialProductDetail({ slug, product: initialProduct, products, layout = "essential", contact, cartQuantities, onAddToCart, onViewCart }: { slug: string; product: PublicStorefrontProduct; products: PublicStorefrontProduct[]; layout?: "essential" | "studio" | "market"; contact?: { phone?: string | null; email?: string | null }; cartQuantities?: Readonly<Record<number, number>>; onAddToCart?: (product: PublicStorefrontProduct) => void; onViewCart?: () => void }) {
  const [image, setImage] = useState(0);
  const [selectedID, setSelectedID] = useState(initialProduct.id);
  const variants = products.filter((item) => item.product_id === initialProduct.product_id);
  const product = variants.find((item) => item.id === selectedID) ?? initialProduct;
  const studio = layout === "studio";
  const market = layout === "market";
  const related = new Map<number, PublicStorefrontProduct[]>();
  if (studio || market) {
    for (const item of products) {
      if (item.product_id === product.product_id || item.collection_id !== product.collection_id) continue;
      const group = related.get(item.product_id);
      if (group) group.push(item);
      else related.set(item.product_id, [item]);
    }
  }
  const soldOut = product.availability_state === "out_of_stock";
  const contactLink = contact?.phone ? "tel:" + contact.phone : contact?.email ? "mailto:" + contact.email : undefined;
  const stock =
    product.availability_state === "low_stock" && product.available_quantity
      ? `Only ${Number(product.available_quantity)} left`
      : product.availability_state === "request_only"
        ? "Available on request"
        : soldOut
          ? "Sold out"
          : "In stock";

  return (
    <main className={`${STORE_WRAP} py-8 sm:py-12`}>
      <Link href={`/s/${slug}/shop`} className="inline-flex items-center gap-1.5 text-[13px] text-[#6E736D] hover:text-current">
        <ArrowLeft size={14} aria-hidden="true" />
        Shop
      </Link>
      <div className={studio ? "mt-6 grid items-start gap-8 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-16" : "mt-6 grid items-start gap-10 md:grid-cols-2 lg:gap-16"}>
        <div>
          <div className={studio ? "relative aspect-[4/5] overflow-hidden" : "relative aspect-square overflow-hidden rounded-2xl"} style={{ background: STORE_SURFACE }}>
            {product.image_urls.length ? (
              <Image src={product.image_urls[image] || product.image_urls[0]} alt={product.title} fill sizes="(max-width:768px) 100vw, 50vw" unoptimized className="object-cover" />
            ) : (
              <div className="grid h-full place-items-center">
                <ImageSquare size={40} className="text-black/20" aria-hidden="true" />
              </div>
            )}
          </div>
          {product.image_urls.length > 1 ? (
            <div className="mt-3 flex gap-3 overflow-x-auto">
              {product.image_urls.map((url, index) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setImage(index)}
                  aria-label={`Image ${index + 1}`}
                  aria-pressed={image === index}
                  className={`relative size-20 shrink-0 cursor-pointer overflow-hidden rounded-xl border-2 ${image === index ? "border-[var(--store-primary)]" : "border-transparent"}`}
                  style={{ background: STORE_SURFACE }}
                >
                  <Image src={url} alt="" fill sizes="80px" unoptimized className="object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className={market ? "space-y-6 rounded-xl border border-black/10 bg-white p-5 md:sticky md:top-28 sm:p-7" : "space-y-6 md:sticky md:top-28"}>
          <div>
            <h1 className={studio ? "break-words text-4xl leading-tight font-medium tracking-tight lg:text-6xl" : "break-words text-3xl leading-tight font-semibold tracking-tight sm:text-4xl"} style={{ fontFamily: "var(--store-heading-font)" }}>{product.title}</h1>
            <p className="mt-3 text-2xl font-semibold tabular">{formatMinorAmount(product.price_minor, product.currency, product.currency_exponent)}</p>
            <p className="mt-1 text-[13px] text-[#6E736D]">{stock}</p>
          </div>

          {variants.length > 1 ? (
            <div>
              <h2 className="mb-2.5 text-[12px] font-semibold tracking-[0.14em] text-[#6E736D] uppercase">Options</h2>
              <ChoiceCards value={String(product.id)} options={variants.map((variant) => ({ key: String(variant.id), label: variant.variant_name || variant.title, description: variant.availability_state === "out_of_stock" ? "Sold out" : formatMinorAmount(variant.price_minor, variant.currency, variant.currency_exponent) }))} onChange={(value) => {
                setSelectedID(Number(value));
                setImage(0);
                window.history.replaceState(null, "", `/s/${encodeURIComponent(slug)}/products/${value}`);
              }} />
            </div>
          ) : null}

          {product.contact_only ? <div className="rounded-lg border border-black/10 p-4 text-sm">
            {contactLink ? <a className="font-semibold underline underline-offset-4" href={contactLink}>Contact the store to order</a> : <p>Contact the store to order.</p>}
          </div> : !soldOut && onAddToCart && onViewCart ? <PremiumCartButton quantity={cartQuantities?.[product.id]} onAdd={() => onAddToCart(product)} onView={onViewCart} /> : <PublicProductActions key={product.id} slug={slug} productID={product.id} priceMinor={product.price_minor} unavailable={soldOut} />}

          <div className="divide-y divide-black/10 border-y border-black/10">
            {product.description ? (
              <details open className="group py-4">
                <summary className="cursor-pointer list-none text-[14px] font-semibold">Description</summary>
                <p className="mt-3 text-[14px] leading-7 whitespace-pre-wrap text-[#6E736D]">{product.description}</p>
              </details>
            ) : null}
            <details className="py-4">
              <summary className="cursor-pointer list-none text-[14px] font-semibold">Delivery & returns</summary>
              <Link href={`/s/${slug}/policies`} className="mt-3 inline-block text-[14px] underline underline-offset-4">
                Read the store’s policies
              </Link>
            </details>
          </div>
        </div>
      </div>
      {related.size ? <section className="mt-14 space-y-6 border-t border-black/10 pt-9" aria-labelledby="related-products">
        <h2 id="related-products" className="text-2xl font-semibold" style={{ fontFamily: "var(--store-heading-font)" }}>Related products</h2>
        <PremiumGrid store={{ slug, name: "", collections: [], products }} products={Array.from(related.values()).slice(0, 4)} compact={market} />
      </section> : null}
    </main>
  );
}
