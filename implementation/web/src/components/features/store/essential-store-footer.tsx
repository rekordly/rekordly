// Essential template: service cards above the footer, and the footer itself.
// Both sit on the shared store width; the footer uses the store's primary colour and logo.

import { ArrowUUpLeft, CreditCard, EnvelopeSimple, Headset, MapPin, Phone, Truck, WhatsappLogo } from "@phosphor-icons/react";
import Image from "next/image";
import type { ReactNode } from "react";

import { displayStoreAddress } from "@/lib/store-address";
import type { BrandSettings, ThemeStoreData } from "@/lib/store-themes";
import { resolveStoreBrand } from "@/lib/store-themes/brand";
import { readableOn, STORE_SURFACE, STORE_WRAP } from "@/lib/store-themes/layout";

function ContactLine({ href, icon, children }: { href?: string; icon: ReactNode; children: ReactNode }) {
  const body = (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-current/10">{icon}</span>
      <span className="min-w-0 break-words opacity-85">{children}</span>
    </>
  );
  return href ? <a href={href} className="flex items-center gap-3 hover:opacity-100">{body}</a> : <p className="flex items-center gap-3">{body}</p>;
}

function FooterLinks({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h2 className="mb-4 text-[15px] font-semibold">{title}</h2>
      <nav className="grid gap-2.5 text-[14px]">
        {links.map((link) => (
          <a key={link.href + link.label} href={link.href} className="opacity-75 transition-opacity hover:opacity-100">
            {link.label}
          </a>
        ))}
      </nav>
    </div>
  );
}

export function EssentialStoreFooter({ store, brand, showContact = true }: { store: ThemeStoreData; brand: BrandSettings; showContact?: boolean }) {
  const { palette, heading } = resolveStoreBrand(brand);
  const base = `/s/${encodeURIComponent(store.slug)}`;
  const address = displayStoreAddress(store.address);
  const logo = brand.logo_url || store.logo_url;
  const whatsapp = store.whatsapp_number?.replace(/\D/g, "");

  return (
    <footer style={{ background: palette.primary, color: readableOn(palette.primary) }}>
      <div className={`${STORE_WRAP} py-14 sm:py-20`}>
        <a href={base} className="inline-flex max-w-full items-center gap-4">
          {logo ? <Image src={logo} alt={`${store.name} logo`} width={64} height={64} unoptimized className="size-14 shrink-0 rounded-full object-cover sm:size-16" /> : null}
          <span className="truncate text-3xl font-semibold tracking-[-0.03em] sm:text-5xl" style={{ fontFamily: heading.headingFamily }}>{store.name}</span>
        </a>

        <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div className="space-y-5 text-[14px]">
            {store.description || store.tagline ? <p className="max-w-sm leading-6 opacity-80">{store.description || store.tagline}</p> : null}
            {showContact && (store.email || store.phone || whatsapp || address) ? (
              <address className="space-y-3 not-italic">
                <h2 className="text-[15px] font-semibold">Contact & address</h2>
                {store.email ? <ContactLine href={`mailto:${store.email}`} icon={<EnvelopeSimple size={16} aria-hidden="true" />}>{store.email}</ContactLine> : null}
                {store.phone ? <ContactLine href={`tel:${store.phone}`} icon={<Phone size={16} aria-hidden="true" />}>{store.phone}</ContactLine> : null}
                {whatsapp ? <ContactLine href={`https://wa.me/${whatsapp}`} icon={<WhatsappLogo size={16} aria-hidden="true" />}>Chat on WhatsApp</ContactLine> : null}
                {address ? <ContactLine icon={<MapPin size={16} aria-hidden="true" />}>{address}</ContactLine> : null}
              </address>
            ) : null}
          </div>
          <FooterLinks title="Links" links={[{ href: `${base}/shop`, label: "Shop" }, { href: `${base}/about`, label: "About us" }, { href: `${base}/cart`, label: "Cart" }, { href: `${base}/orders`, label: "Track my order" }]} />
          <FooterLinks
            title="Categories"
            links={store.collections.length ? store.collections.slice(0, 6).map((category) => ({ href: `${base}/collections/${encodeURIComponent(category.slug ?? String(category.id))}`, label: category.name })) : [{ href: `${base}/shop`, label: "All products" }]}
          />
          <FooterLinks
            title="Support"
            links={[
              { href: `${base}/delivery`, label: "Delivery" },
              { href: `${base}/returns`, label: "Returns & refunds" },
              { href: `${base}/privacy`, label: "Privacy policy" },
              { href: `${base}/terms`, label: "Terms" },
            ]}
          />
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-current/15 pt-6 text-[12px] opacity-70">
          <span>© {new Date().getFullYear()} {store.name}</span>
          <span>Powered by Rekordly</span>
        </div>
      </div>
    </footer>
  );
}

export function StoreServiceCards({ slug, delivery, returns, support }: { slug: string; delivery?: string | null; returns?: string | null; support?: string | null }) {
  const base = `/s/${encodeURIComponent(slug)}`;
  const cards = [
    { icon: Truck, title: "Delivery", body: delivery ? "See delivery options" : "Pickup and delivery", href: `${base}/delivery` },
    { icon: CreditCard, title: "Easy payment", body: "Pay the store directly", href: `${base}/cart` },
    { icon: ArrowUUpLeft, title: "Returns", body: returns ? "Read our return policy" : "Ask us about returns", href: `${base}/returns` },
    { icon: Headset, title: "Support", body: "We’re here to help", href: support || `${base}/policies` },
  ];
  return (
    <section aria-label="Shopping information" style={{ background: STORE_SURFACE }}>
      <div className={`${STORE_WRAP} grid grid-cols-2 gap-3 py-12 sm:gap-4 sm:py-16 lg:grid-cols-4`}>
        {cards.map(({ icon: Icon, title, body, href }) => (
          <a key={title} href={href} className="flex flex-col items-center rounded-2xl bg-white px-4 py-8 text-center transition-shadow hover:shadow-md">
            <span className="mb-4 grid size-12 place-items-center rounded-full border border-current">
              <Icon size={22} aria-hidden="true" />
            </span>
            <h2 className="text-[15px] font-semibold">{title}</h2>
            <p className="mt-1 text-[13px] leading-5 text-[#6E736D]">{body}</p>
          </a>
        ))}
      </div>
    </section>
  );
}
