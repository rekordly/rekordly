"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppSwitch } from "@/components/ui/app-switch";
import { AppTextarea } from "@/components/ui/app-textarea";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { SideSheet } from "@/components/ui/side-sheet";
import { Page, PageHeader } from "@/components/ui/page";
import { financeApi, moneyKeys } from "@/lib/money";
import { hasWorkspacePermission, useActiveWorkspace } from "@/stores/workspace-store";
import { WorkspaceGate, useFinanceAction, type WorkspaceInfo } from "../finance/shared";
import type { Storefront } from "@/types/finance";
import { uploadProductImage } from "@/lib/products";

type CardKey = "details" | "delivery" | "payments" | "shoppers" | "policies" | "sharing";
type DeliveryAreaDraft = { id: number; name: string; fee: string; description: string };
function minorToMajor(minor: string, exponent: number) {
  const value = BigInt(minor || "0");
  if (exponent <= 0) return value.toString();
  const scale = BigInt(10) ** BigInt(exponent);
  return `${value / scale}.${(value % scale).toString().padStart(exponent, "0")}`;
}
const CARD_INFO: Record<CardKey, { title: string; summary: (sf: Storefront) => string }> = {
  details: { title: "Store details", summary: (sf) => `${sf.name} · ${sf.slug}.rekordly.com` },
  delivery: { title: "Delivery", summary: (sf) => `${sf.settings.delivery_areas.filter((area) => area.is_active).length} delivery areas · ${sf.settings.free_delivery_threshold_minor ? `free over ${sf.currency} ${minorToMajor(sf.settings.free_delivery_threshold_minor, sf.currency_exponent)}` : "no free-delivery minimum"}` },
  payments: { title: "Payments & checkout", summary: (sf) => `Email ${sf.settings.checkout_require_email ? "required" : "optional"} · Phone ${sf.settings.checkout_require_phone ? "required" : "optional"}` },
  shoppers: { title: "What shoppers see", summary: (sf) => `${sf.settings.show_sold_out ? "Sold-out items shown" : "Sold-out items hidden"} · ${sf.settings.show_stock_count ? "Stock count shown" : `Low stock notice at ${sf.settings.low_stock_threshold}`}` },
  policies: { title: "Policies", summary: (sf) => [sf.settings.return_policy && "Returns", sf.settings.privacy_policy && "Privacy", sf.settings.terms_policy && "Terms"].filter(Boolean).join(" · ") || "Add clear policies for shoppers" },
  sharing: { title: "Link & sharing", summary: (sf) => `${sf.slug}.rekordly.com · ${sf.settings.seo_title || sf.name}` },
};

function SettingsContent({ workspaceId }: WorkspaceInfo) {
  const workspace = useActiveWorkspace();
  const canEdit = hasWorkspacePermission(workspace, ["storefront.manage_appearance", "storefront.manage_checkout"]);
  const query = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "storefront-settings"], queryFn: () => financeApi.getStorefrontSettings(workspaceId), retry: false });
  const [active, setActive] = useState<CardKey | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const sf = query.data;
  const update = useFinanceAction(workspaceId, (body: unknown) => financeApi.updateStorefrontSettings(workspaceId, body), {
    success: "Store settings saved",
    onDone: () => { setActive(null); void query.refetch(); },
  });
  const open = (key: CardKey) => {
    if (!sf) return;
    const s = sf.settings;
    const values: Record<CardKey, Record<string, unknown>> = {
      details: { name: sf.name, slug: sf.slug, contact_phone: s.contact_phone ?? "", contact_email: s.contact_email ?? "", address: s.address ?? "", whatsapp_number: s.whatsapp_number ?? "", business_hours: s.business_hours },
      delivery: { delivery_methods: s.delivery_methods, delivery_guidance: s.delivery_guidance ?? "", default_delivery_fee: minorToMajor(s.default_delivery_fee_minor, sf.currency_exponent), free_delivery_threshold: s.free_delivery_threshold_minor ? minorToMajor(s.free_delivery_threshold_minor, sf.currency_exponent) : "", delivery_areas: s.delivery_areas.filter((area) => area.is_active).map((area) => ({ id: area.id, name: area.name, fee: minorToMajor(area.fee_minor, sf.currency_exponent), description: area.description })) },
      payments: { checkout_require_email: s.checkout_require_email, checkout_require_phone: s.checkout_require_phone, reservation_ttl_hours: sf.reservation_ttl_hours },
      shoppers: { tagline: s.tagline ?? "", description: s.description ?? "", logo_url: s.logo_url ?? "", banner_url: s.banner_url ?? "", auto_show_new_products: s.auto_show_new_products, show_sold_out: s.show_sold_out, show_stock_count: s.show_stock_count, low_stock_threshold: s.low_stock_threshold },
      policies: { return_policy: s.return_policy ?? "", privacy_policy: s.privacy_policy ?? "", terms_policy: s.terms_policy ?? "", custom_policy: s.custom_policy ?? "" },
      sharing: { seo_title: s.seo_title ?? "", seo_description: s.seo_description ?? "", seo_image_url: s.seo_image_url ?? "", seo_indexable: s.seo_indexable },
    };
    setDraft(values[key]); setActive(key);
  };
  const set = (key: string, value: unknown) => setDraft((old) => ({ ...old, [key]: value }));
  const field = (key: string, label: string, placeholder = "") => <AppInput label={label} value={String(draft[key] ?? "")} onChange={(e) => set(key, e.target.value)} placeholder={placeholder} />;
  const save = () => { if (active) update.mutate({ ...draft, card: active, idempotency_key: crypto.randomUUID() }); };
  if (query.isPending) return <Page><p className="py-8 text-sm text-muted">Loading store settings…</p></Page>;
  if (!sf) return <Page><p className="py-8 text-sm text-muted">Create your store before changing its settings.</p></Page>;
  return <Page><PageHeader title="Store settings" description="Keep the details, delivery and policies shoppers see in one place." />
    <div className="grid gap-3 sm:grid-cols-2">
      {(Object.keys(CARD_INFO) as CardKey[]).map((key) => <section key={key} className="rounded-2xl border border-border bg-surface p-4"><h2 className="font-semibold">{CARD_INFO[key].title}</h2><p className="mt-1 truncate text-sm text-muted">{CARD_INFO[key].summary(sf)}</p><AppButton className="mt-3" size="sm" variant="secondary" label="Edit" isDisabled={!canEdit} onPress={() => open(key)} /></section>)}
    </div>
    <SideSheet isOpen={Boolean(active)} onClose={() => setActive(null)} title={active ? CARD_INFO[active].title : "Edit settings"} description="Changes are saved together for this section." footer={<><AppButton variant="tertiary" label="Cancel" onPress={() => setActive(null)} /><AppButton label="Save changes" isLoading={update.isPending} onPress={save} /></>}>
      <div className="space-y-4">
        {active === "details" && <>{field("name", "Store name")}{field("slug", "Store link", "your-store")}{field("contact_phone", "Phone")}{field("contact_email", "Email")}{field("whatsapp_number", "WhatsApp number")}{field("address", "Address")}<fieldset className="space-y-2"><legend className="text-sm font-semibold">Opening hours</legend>{["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map((day)=><AppInput key={day} label={day} value={String((draft.business_hours as Record<string,string>)?.[day.toLowerCase()]??"")} placeholder="9:00 AM–5:00 PM or Closed" onChange={(e)=>set("business_hours",{...(draft.business_hours as Record<string,string>??{}),[day.toLowerCase()]:e.target.value})} />)}</fieldset></>}
        {active === "delivery" && <><p className="text-sm font-medium">Delivery options</p>{(["pickup", "merchant_delivery", "customer_arranged"] as const).map((method) => <AppSwitch key={method} label={method === "pickup" ? "Pickup" : method === "merchant_delivery" ? "Store delivery" : "Customer arranges delivery"} isSelected={(draft.delivery_methods as string[] ?? []).includes(method)} onChange={(checked) => set("delivery_methods", checked ? [...(draft.delivery_methods as string[] ?? []), method] : (draft.delivery_methods as string[] ?? []).filter((x) => x !== method))} />)}{field("default_delivery_fee", `Default delivery fee (${sf.currency})`)}<p className="text-xs font-semibold">Delivery areas</p>{((draft.delivery_areas as DeliveryAreaDraft[]) ?? []).map((area,index)=><div key={area.id || `new-${index}`} className="rounded-xl border border-default p-3 space-y-2"><AppInput label="Area name" value={area.name} onChange={(e)=>set("delivery_areas",(draft.delivery_areas as DeliveryAreaDraft[]).map((item,i)=>i===index?{...item,name:e.target.value}:item))} /><AppInput label={`Delivery fee (${sf.currency})`} value={area.fee} onChange={(e)=>set("delivery_areas",(draft.delivery_areas as DeliveryAreaDraft[]).map((item,i)=>i===index?{...item,fee:e.target.value}:item))} /><AppInput label="Delivery note" value={area.description} onChange={(e)=>set("delivery_areas",(draft.delivery_areas as DeliveryAreaDraft[]).map((item,i)=>i===index?{...item,description:e.target.value}:item))} /><AppButton size="sm" variant="tertiary" label="Remove area" onPress={()=>set("delivery_areas",(draft.delivery_areas as DeliveryAreaDraft[]).filter((_,i)=>i!==index))} /></div>)}<AppButton size="sm" variant="secondary" label="Add delivery area" onPress={()=>set("delivery_areas",[...(draft.delivery_areas as DeliveryAreaDraft[] ?? []),{id:0,name:"",fee:"0",description:""}])} /><AppInput label={`Free delivery on orders over (${sf.currency})`} value={String(draft.free_delivery_threshold??"")} onChange={(e)=>set("free_delivery_threshold",e.target.value)} placeholder="Leave blank to turn off" /><AppTextarea label="Delivery guidance" value={String(draft.delivery_guidance ?? "")} onChange={(e) => set("delivery_guidance", e.target.value)} /></>}
        {active === "payments" && <><AppSwitch label="Ask shoppers for email" isSelected={Boolean(draft.checkout_require_email)} onChange={(v) => set("checkout_require_email", v)} /><AppSwitch label="Ask shoppers for phone" isSelected={Boolean(draft.checkout_require_phone)} onChange={(v) => set("checkout_require_phone", v)} /><AppInput label="Hold confirmed stock for (hours)" type="number" min="0" max="720" value={String(draft.reservation_ttl_hours ?? 0)} onChange={(e) => set("reservation_ttl_hours", Number(e.target.value))} /></>}
        {active === "shoppers" && <>{field("tagline", "Short headline") }<AppTextarea label="Store description" value={String(draft.description ?? "")} onChange={(e) => set("description", e.target.value)} /><AppInput label="Logo image URL" value={String(draft.logo_url??"")} onChange={(e)=>set("logo_url",e.target.value)} /><label className="block space-y-2 text-sm font-medium">Upload logo<input className="block w-full text-sm" type="file" accept="image/*" onChange={(e)=>{const file=e.target.files?.[0];if(file)void uploadProductImage(workspaceId,file).then((url)=>set("logo_url",url));}} /></label><AppInput label="Banner image URL" value={String(draft.banner_url??"")} onChange={(e)=>set("banner_url",e.target.value)} /><label className="block space-y-2 text-sm font-medium">Upload banner<input className="block w-full text-sm" type="file" accept="image/*" onChange={(e)=>{const file=e.target.files?.[0];if(file)void uploadProductImage(workspaceId,file).then((url)=>set("banner_url",url));}} /></label><AppSwitch label="Show new products automatically" isSelected={Boolean(draft.auto_show_new_products)} onChange={(v) => set("auto_show_new_products", v)} /><AppSwitch label="Show sold-out products" isSelected={Boolean(draft.show_sold_out)} onChange={(v) => set("show_sold_out", v)} /><AppSwitch label="Show available stock count" isSelected={Boolean(draft.show_stock_count)} onChange={(v) => set("show_stock_count", v)} /><AppInput label="Show low-stock notice at" type="number" min="0" value={String(draft.low_stock_threshold ?? 0)} onChange={(e) => set("low_stock_threshold", Number(e.target.value))} /></>}
        {active === "policies" && <><p className="text-xs text-muted">Choose a starter and edit the wording. Your text is cleaned before it is shown publicly.</p><div className="flex flex-wrap gap-2">{[{key:"return_policy",label:"Returns template",text:"<h2>Returns</h2><p>Contact us within 7 days of delivery to discuss a return. Items must be unused and in their original condition.</p>"},{key:"privacy_policy",label:"Privacy template",text:"<h2>Your privacy</h2><p>We use your contact and delivery details only to process and support your order.</p>"},{key:"terms_policy",label:"Terms template",text:"<h2>Terms of sale</h2><p>Orders are confirmed after we review item availability and delivery details.</p>"}].map((t)=><AppButton key={t.key} size="sm" variant="secondary" label={t.label} onPress={()=>set(t.key,t.text)} />)}</div>{(["return_policy","privacy_policy","terms_policy","custom_policy"] as const).map((k)=><RichTextEditor key={k} label={k.replace("_", " ").replace("_", " ")} value={String(draft[k]??"")} onChange={(v)=>set(k,v)} />)}</>}
        {active === "sharing" && <>{field("seo_title", "Link title")}{field("seo_description", "Link description")}<AppInput label="Preview image URL" value={String(draft.seo_image_url??"")} onChange={(e)=>set("seo_image_url",e.target.value)} /><AppSwitch label="Allow search engines to find the store" isSelected={Boolean(draft.seo_indexable)} onChange={(v)=>set("seo_indexable",v)} /><div className="rounded-2xl border border-default p-4"><p className="text-xs text-muted">WhatsApp link preview</p><div className="mt-2 aspect-[1.91/1] rounded-lg bg-default" style={draft.seo_image_url ? {backgroundImage:`url(${String(draft.seo_image_url)})`,backgroundSize:"cover",backgroundPosition:"center"}:undefined} /><p className="mt-2 font-semibold">{String(draft.seo_title||sf.name)}</p><p className="text-sm text-muted">{String(draft.seo_description||sf.settings.description||"Shop our latest collection")}</p><p className="text-xs text-muted">https://{sf.subdomain_host}</p></div></>}
      </div>
    </SideSheet>
  </Page>;
}

export function StorefrontSettingsPage() { return <WorkspaceGate businessOnly>{(ws) => <SettingsContent {...ws} />}</WorkspaceGate>; }
