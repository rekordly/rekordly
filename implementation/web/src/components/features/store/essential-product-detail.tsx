"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { PublicProductActions } from "./public-product-actions";
import { formatMinorAmount } from "@/lib/money";
import type { PublicStorefrontProduct } from "@/types/finance";

export function EssentialProductDetail({ slug, product, products }: { slug: string; product: PublicStorefrontProduct; products: PublicStorefrontProduct[] }) {
  const [image, setImage] = useState(0);
  const variants = products.filter((item) => item.product_id === product.product_id);
  return <main className="mx-auto max-w-[1440px] px-5 py-10 sm:px-10">
    <Link href={`/s/${slug}/shop`} className="text-sm text-muted">← Back to shop</Link>
    <div className="mt-8 grid items-start gap-10 md:grid-cols-2 lg:gap-20">
      <div><div className="relative aspect-square overflow-hidden bg-[#f4f3ef]">{product.image_urls.length ? <Image src={product.image_urls[image] || product.image_urls[0]} alt={product.title} fill sizes="(max-width:768px) 100vw, 50vw" unoptimized className="object-cover" /> : <div className="grid h-full place-items-center text-muted">No image available</div>}</div><div className="mt-4 flex gap-3">{product.image_urls.map((url, index) => <button key={url} type="button" onClick={() => setImage(index)} aria-label={`View image ${index + 1}`} aria-pressed={image === index} className={`relative size-20 overflow-hidden border ${image === index ? "border-black" : "border-transparent"}`}><Image src={url} alt="" fill sizes="80px" unoptimized className="object-cover" /></button>)}</div></div>
      <div className="space-y-6"><h1 className="text-4xl font-medium tracking-tight" style={{ fontFamily: "var(--store-heading-font)" }}>{product.title}</h1><p className="text-xl">{formatMinorAmount(product.price_minor, product.currency, product.currency_exponent)}</p><p className="text-sm leading-7 text-muted">{product.description}</p>
        {variants.length > 1 ? <div><h2 className="mb-3 text-sm font-medium">Options</h2><div className="flex flex-wrap gap-2">{variants.map((variant) => <Link key={variant.id} href={`/s/${slug}/products/${variant.id}`} className={`rounded-full border px-4 py-2 text-sm ${variant.id === product.id ? "border-current" : "border-black/15"}`}>{variant.variant_name || variant.title}</Link>)}</div></div> : null}
        <PublicProductActions slug={slug} productID={product.id} priceMinor={product.price_minor} unavailable={product.availability_state === "out_of_stock"} />
        <div className="divide-y divide-black/10 border-y border-black/10">{[["Product description", product.description || "Contact the store for further details."], ["Delivery & returns", "See this store’s delivery and return policies before placing your order."]].map(([title, content]) => <details key={title} className="py-5"><summary className="cursor-pointer text-sm font-medium">{title}</summary><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-muted">{content}</p>{title === "Delivery & returns" ? <Link href={`/s/${slug}/policies`} className="mt-3 inline-block text-sm underline">Read store policies</Link> : null}</details>)}</div>
      </div>
    </div>
  </main>;
}
