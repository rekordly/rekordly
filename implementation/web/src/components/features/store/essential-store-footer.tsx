import { EnvelopeSimple, Phone, MapPin, Truck, CreditCard, ArrowUUpLeft, Headset } from "@phosphor-icons/react";
import { displayStoreAddress } from "@/lib/store-address";
import { resolveStoreBrand } from "@/lib/store-themes/brand";
import type { BrandSettings, ThemeStoreData } from "@/lib/store-themes";

function foregroundFor(background: string) {
  const hex = background.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((digit) => digit + digit).join("") : hex;
  const rgb = [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 > .179 ? "#17211b" : "#ffffff";
}

export function EssentialStoreFooter({ store, brand, showContact = true }: { store: ThemeStoreData; brand: BrandSettings; showContact?: boolean }) {
  const { palette, heading } = resolveStoreBrand(brand);
  const base = `/s/${encodeURIComponent(store.slug)}`;
  const address = displayStoreAddress(store.address);
  return <footer style={{ background: palette.primary, color: foregroundFor(palette.primary) }} className="px-5 py-12 sm:px-10 sm:py-16">
    <div className="mx-auto max-w-[1440px]">
      <a href={base} className="block max-w-full break-words text-4xl font-medium tracking-tight sm:text-6xl" style={{ fontFamily: heading.headingFamily }}>{store.name}</a>
      <div className="mt-10 grid gap-10 text-sm leading-6 sm:grid-cols-2 lg:mt-14 lg:grid-cols-[2fr_1fr_1fr_1.4fr]">
        <div className="space-y-5"><p className="max-w-sm opacity-80">{store.description || store.tagline}</p>{showContact ? <address className="space-y-4 not-italic">{store.email ? <a href={`mailto:${store.email}`} className="flex items-center gap-3"><EnvelopeSimple size={20} className="shrink-0" /><span className="break-all opacity-85">{store.email}</span></a> : null}{store.phone ? <a href={`tel:${store.phone}`} className="flex items-center gap-3"><Phone size={20} className="shrink-0" /><span className="opacity-85">{store.phone}</span></a> : null}{address ? <p className="flex items-start gap-3"><MapPin size={20} className="mt-0.5 shrink-0" /><span className="max-w-sm opacity-85">{address}</span></p> : null}{store.whatsapp_number ? <a href={`https://wa.me/${store.whatsapp_number.replace(/\D/g, "")}`} className="inline-block underline underline-offset-4">Message us on WhatsApp</a> : null}</address> : null}</div>
        <div><h2 className="mb-5 font-semibold">Links</h2><nav className="grid gap-3 opacity-80"><a href={`${base}/shop`}>Shop</a><a href={`${base}/about`}>About us</a><a href={`${base}/cart`}>Your cart</a></nav></div>
        <div><h2 className="mb-5 font-semibold">Categories</h2><nav className="grid gap-3 opacity-80">{store.collections.map((category) => <a key={category.id} href={`${base}/collections/${encodeURIComponent(category.slug ?? String(category.id))}`}>{category.name}</a>)}{!store.collections.length ? <a href={`${base}/shop`}>All products</a> : null}</nav></div>
        <div><h2 className="mb-5 font-semibold">Support</h2><nav className="grid gap-3 opacity-80"><a href={`${base}/delivery`}>Shipping information</a><a href={`${base}/returns`}>Return & refund policy</a><a href={`${base}/privacy`}>Privacy policy</a><a href={`${base}/terms`}>Terms & conditions</a>{showContact && store.email ? <a href={`mailto:${store.email}`}>Contact us</a> : null}</nav></div>
      </div>
      <p className="mt-10 border-t border-current/20 pt-6 text-xs opacity-70">© {new Date().getFullYear()} {store.name}. All rights reserved.</p>
    </div>
  </footer>;
}

export function StoreServiceCards({ slug, delivery, returns, support }: { slug: string; delivery?: string | null; returns?: string | null; support?: string | null }) {
  const base = `/s/${encodeURIComponent(slug)}`;
  const cards = [
    { icon: Truck, title: "Delivery & pickup", body: delivery || "See delivery options for your order", href: `${base}/delivery` },
    { icon: CreditCard, title: "Payment arrangements", body: "Confirm payment directly with the store", href: `${base}/cart` },
    { icon: ArrowUUpLeft, title: "Returns & refunds", body: returns ? "Read our store’s return policy" : "Contact us for return arrangements", href: `${base}/returns` },
    { icon: Headset, title: "Customer support", body: support ? "Get help with your order" : "View store information and policies", href: support || `${base}/policies` },
  ];
  return <section aria-label="Shopping information" className="bg-[#f3f3f1] px-5 py-10 sm:px-10"><div className="mx-auto grid max-w-[1440px] gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(({ icon: Icon, title, body, href }) => <a key={title} href={href} className="flex flex-col items-center rounded-xl border border-black/10 bg-white px-5 py-7 text-center"><span className="mb-4 grid size-12 place-items-center rounded-full border border-current"><Icon size={23} /></span><h2 className="text-base font-medium">{title}</h2><p className="mt-2 max-w-56 text-sm leading-6 text-[#71766f]">{body}</p></a>)}</div></section>;
}
