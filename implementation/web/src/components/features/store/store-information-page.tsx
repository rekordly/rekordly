"use client";

import { ArrowLeft, ArrowRight, ImageSquare, UploadSimple } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useFinanceAction, WorkspaceGate, type WorkspaceInfo } from "@/components/features/finance/shared";
import { AppButton } from "@/components/ui/app-button";
import { AppComboBox } from "@/components/ui/app-combo-box";
import { AppInput } from "@/components/ui/app-input";
import { AppSelect } from "@/components/ui/app-select";
import { FormPage, FormSection, StepNav } from "@/components/ui/form-kit";
import { Page, PageHeader } from "@/components/ui/page";
import { financeApi, moneyKeys } from "@/lib/money";
import { uploadProductImage } from "@/lib/products";
import { StoreBrandFields } from "./store-brand-fields";
import type { BrandSettings } from "@/lib/store-themes";
import { parseStoreAddress, displayStoreAddress } from "@/lib/store-address";

type StoreInfoDraft = {
  store_name: string;
  business_name: string;
  timezone: string;
  sector: string;
  tagline: string;
  description: string;
  currency: string;
  phone: string;
  address: string;
  country: string;
  state: string;
  city: string;
  zip_code: string;
  logo_url: string;
};

const STEPS = ["Store identity", "Your brand", "Contact & location", "Review"] as const;
const SECTORS = ["Fashion", "Electronics", "Food & groceries", "Beauty & personal care", "Home & living", "Health & wellness", "Automotive", "Professional services", "Other"];
const CURRENCIES = ["NGN", "USD", "GBP", "EUR", "GHS", "KES", "ZAR"];
const COUNTRIES = [{ code: "NG", name: "Nigeria" }, { code: "GH", name: "Ghana" }, { code: "KE", name: "Kenya" }, { code: "ZA", name: "South Africa" }, { code: "US", name: "United States" }, { code: "GB", name: "United Kingdom" }];
const TIMEZONES = ["Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "Africa/Johannesburg", "Africa/Cairo", "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "America/New_York", "America/Chicago", "America/Los_Angeles", "UTC"];
const STATES: Record<string, string[]> = {
  NG: ["Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Federal Capital Territory", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara"],
  GH: ["Ahafo", "Ashanti", "Bono", "Bono East", "Central", "Eastern", "Greater Accra", "North East", "Northern", "Oti", "Savannah", "Upper East", "Upper West", "Volta", "Western", "Western North"],
  KE: ["Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo-Marakwet", "Embu", "Garissa", "Homa Bay", "Isiolo", "Kajiado", "Kakamega", "Kericho", "Kiambu", "Kilifi", "Kirinyaga", "Kisii", "Kisumu", "Kitui", "Kwale", "Laikipia", "Lamu", "Machakos", "Makueni", "Mandera", "Marsabit", "Meru", "Migori", "Mombasa", "Murang'a", "Nairobi", "Nakuru", "Nandi", "Narok", "Nyamira", "Nyandarua", "Nyeri", "Samburu", "Siaya", "Taita-Taveta", "Tana River", "Tharaka-Nithi", "Trans Nzoia", "Turkana", "Uasin Gishu", "Vihiga", "Wajir", "West Pokot"],
  ZA: ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "Northern Cape", "North West", "Western Cape"],
  US: ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming", "District of Columbia"],
  GB: ["England", "Northern Ireland", "Scotland", "Wales"],
};
const countryName = (code: string) => COUNTRIES.find((country) => country.code === code)?.name ?? code;

function sanitizeText(value: string, maxLength: number) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, maxLength);
}

function safeTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    return "Africa/Lagos";
  }
}

function parseAddress(address?: string | null) {
  return parseStoreAddress(address);
}

function formattedAddress(form: StoreInfoDraft) {
  return sanitizeText([form.address.trim(), form.city.trim() ? `City: ${form.city.trim()}` : "", form.state.trim() ? `State: ${form.state.trim()}` : "", form.zip_code.trim() ? `Zip Code: ${form.zip_code.trim()}` : "", form.country.trim() ? `Country: ${countryName(form.country)}` : ""].filter(Boolean).join("\n"), 300);
}

function StoreInformationContent({ workspaceId }: WorkspaceInfo) {
  const client = useQueryClient();
  const overviewQuery = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "storefront", "overview", "30d"], queryFn: () => financeApi.getStorefrontOverview(workspaceId, "30d"), retry: false });
  const workspaceQuery = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "workspace-settings"], queryFn: () => financeApi.getWorkspaceSettings(workspaceId), retry: false });
  const overview = overviewQuery.data;
  const storefront = overview?.storefront;
  const workspace = workspaceQuery.data;
  const designQuery = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "storefront-design"], queryFn: () => financeApi.getStorefrontDesign(workspaceId), enabled: Boolean(storefront), retry: false });
  const [brand, setBrand] = useState<BrandSettings>({ palette: "green", font_style: "modern" });
  const [brandInitialized, setBrandInitialized] = useState(false);
  useEffect(() => { if (designQuery.data && !brandInitialized) { setBrand(designQuery.data.published_brand); setBrandInitialized(true); } }, [designQuery.data, brandInitialized]);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<StoreInfoDraft>({ store_name: "", business_name: "", timezone: "Africa/Lagos", sector: "", tagline: "", description: "", currency: "NGN", phone: "", address: "", country: "NG", state: "", city: "", zip_code: "", logo_url: "" });
  const [initialized, setInitialized] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const loading = overviewQuery.isPending || workspaceQuery.isPending;

  useEffect(() => {
    if (!workspace || loading || initialized) return;
    const location = parseAddress(storefront?.settings.address ?? workspace.address);
    setForm({
      store_name: storefront?.name ?? "",
      business_name: workspace.name ?? "",
      timezone: safeTimezone(workspace.timezone || "Africa/Lagos"),
      sector: workspace.business_type ?? "",
      tagline: storefront?.settings.tagline ?? "",
      description: (storefront?.settings.description ?? "").slice(0, 180),
      currency: storefront?.currency ?? workspace.base_currency ?? "NGN",
      phone: storefront?.settings.contact_phone ?? workspace.contact_phone ?? "",
      address: location.address,
      country: workspace.country ?? "NG",
      state: location.state,
      city: location.city,
      zip_code: location.zip_code,
      logo_url: storefront?.settings.logo_url ?? "",
    });
    setInitialized(true);
  }, [workspace, storefront, loading, initialized]);

  const save = useFinanceAction(workspaceId, async () => {
    if (!workspace) throw new Error("Workspace information is unavailable.");
    if (storefront && !brandInitialized) throw new Error("Wait for your store’s brand settings to load before saving.");
    const cleanForm: StoreInfoDraft = {
      ...form,
      store_name: sanitizeText(form.store_name, 120).trim(),
      business_name: sanitizeText(form.business_name, 120).trim(),
      tagline: sanitizeText(form.tagline, 160).trim(),
      description: sanitizeText(form.description, 180).trim(),
      phone: form.phone.replace(/[^0-9+()\-\s]/g, "").slice(0, 40).trim(),
      address: sanitizeText(form.address, 300).trim(),
      city: sanitizeText(form.city, 120).trim(),
      zip_code: sanitizeText(form.zip_code, 24).trim(),
    };
    const storeName = cleanForm.store_name;
    const slug = (storefront?.slug || storeName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40));
    await financeApi.updateWorkspaceSettings(workspaceId, {
      name: cleanForm.business_name || workspace.name,
      timezone: safeTimezone(cleanForm.timezone.trim() || "Africa/Lagos"),
      business_type: cleanForm.sector,
      country: cleanForm.country,
      address: formattedAddress(cleanForm),
      contact_phone: cleanForm.phone,
      contact_email: workspace.contact_email ?? "",
    });
    let savedStore = storefront;
    if (!savedStore) {
      savedStore = await financeApi.createStorefront(workspaceId, { name: storeName, slug, theme_key: "simple", currency: form.currency });
    }
    await financeApi.updateStorefrontSettings(workspaceId, {
      card: "details", idempotency_key: crypto.randomUUID(), name: storeName, slug: savedStore.slug,
      contact_phone: cleanForm.phone, contact_email: storefront?.settings.contact_email ?? "",
      whatsapp_number: storefront?.settings.whatsapp_number ?? "", address: formattedAddress(cleanForm),
    });
    await financeApi.updateStorefrontSettings(workspaceId, {
      card: "shoppers", idempotency_key: crypto.randomUUID(), tagline: cleanForm.tagline,
      description: cleanForm.description, logo_url: cleanForm.logo_url,
    });
    await financeApi.updateStorefrontSettings(workspaceId, { card: "brand", idempotency_key: crypto.randomUUID(), brand });
    return true;
  }, { success: "Store information saved", onDone: async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: [...moneyKeys.workspace(workspaceId), "storefront"] }),
      client.invalidateQueries({ queryKey: [...moneyKeys.workspace(workspaceId), "storefront-settings"] }),
      client.invalidateQueries({ queryKey: [...moneyKeys.workspace(workspaceId), "workspace-settings"] }),
    ]);
    window.location.assign("/store");
  } });

  const update = (key: keyof StoreInfoDraft, value: string) => {
    const limits: Partial<Record<keyof StoreInfoDraft, number>> = { store_name: 120, business_name: 120, tagline: 160, description: 180, phone: 40, address: 300, city: 120, zip_code: 24 };
    const cleanValue = key === "phone" ? value.replace(/[^0-9+()\-\s]/g, "").slice(0, 40) : limits[key] ? sanitizeText(value, limits[key]!) : value;
    setForm((current) => ({ ...current, [key]: cleanValue }));
  };
  const stateOptions = STATES[form.country] ?? [];
  const timezoneOptions = TIMEZONES.includes(form.timezone) ? TIMEZONES : [form.timezone, ...TIMEZONES].filter(Boolean);
  const availableStates = form.state && !stateOptions.includes(form.state) ? [form.state, ...stateOptions] : stateOptions;
  const canContinue = useMemo(() => {
    if (step === 0) {
      const slug = form.store_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
      return form.store_name.trim().length >= 2 && (Boolean(storefront) || slug.length >= 3) && form.sector.length > 0;
    }
    if (step === 2) return form.phone.trim().length > 0 && form.country.trim().length > 0 && form.state.trim().length > 0 && form.city.trim().length > 0;
    return true;
  }, [form, step, storefront]);

  if (loading) return <Page><PageHeader title="Store information" description="Loading your store profile…" /></Page>;
  if (overviewQuery.isError || workspaceQuery.isError || !workspace) return <Page><PageHeader title="Store information" description="Could not load your store information." /></Page>;

  return <FormPage title="Store information" back={{ href: "/store", label: "Store overview" }} aside={step === 3 ? undefined : <StoreInformationPreview form={form} />} actions={<>
    <Link href="/store" className="mr-auto inline-flex h-10 items-center rounded-full px-5 text-sm font-medium text-muted hover:bg-surface-secondary">Cancel</Link>
    {step > 0 ? <AppButton variant="secondary" startContent={<ArrowLeft size={15} />} label="Back" onPress={() => setStep((current) => current - 1)} /> : null}
    {step < STEPS.length - 1 ? <AppButton endContent={<ArrowRight size={15} />} label="Continue" isDisabled={!canContinue} onPress={() => setStep((current) => current + 1)} /> : <AppButton label={storefront ? "Save store information" : "Create my store"} isLoading={save.isPending} onPress={() => save.mutate(undefined)} />}
  </>}>
    <StepNav steps={STEPS.map((label) => ({ label }))} current={step + 1} onStep={(target) => setStep(target - 1)} />
    {step === 0 ? <FormSection title="Store identity">
        <div className="flex flex-wrap items-center gap-4"><div className="grid size-20 place-items-center overflow-hidden rounded-full bg-default">{form.logo_url ? <Image src={form.logo_url} alt="Store logo" width={80} height={80} unoptimized className="size-full object-cover" /> : <ImageSquare size={30} className="text-muted" />}</div><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-default px-4 py-2.5 text-sm font-medium"><UploadSimple size={16} />{uploading ? "Uploading…" : form.logo_url ? "Change image" : "Upload store logo"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={async (event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (!file) return; setUploading(true); setUploadError(""); try { update("logo_url", await uploadProductImage(workspaceId, file)); } catch (error) { setUploadError(error instanceof Error ? error.message : "Could not upload image."); } finally { setUploading(false); } }} /></label></div>
        {uploadError ? <p role="alert" className="text-sm text-danger">{uploadError}</p> : null}
        <div className="grid gap-4 md:grid-cols-2"><AppInput label="Store name" value={form.store_name} onChange={(event) => update("store_name", event.target.value)} maxLength={120} isRequired placeholder="Your public store name" /><AppInput label="Business name (optional)" value={form.business_name} onChange={(event) => update("business_name", event.target.value)} maxLength={120} /><AppComboBox label="Timezone" placeholder="Search timezones" allowsCustomValue={false} options={timezoneOptions.map((timezone) => ({ key: timezone, label: timezone.replace(/_/g, " ") }))} selectedKey={form.timezone} onSelectionChange={(value) => { if (value) update("timezone", value); }} /><AppSelect label="Business sector" placeholder="Choose a sector" isRequired options={SECTORS.map((sector) => ({ key: sector, label: sector }))} selectedKey={form.sector || undefined} onSelectionChange={(value) => update("sector", value)} /></div>
    </FormSection> : null}
    {step === 1 ? <FormSection title="Your brand"><AppInput label="Store tagline (optional)" value={form.tagline} onChange={(event) => update("tagline", event.target.value)} maxLength={160} placeholder="Your business slogan" /><AppInput label="Short store description (optional)" value={form.description} onChange={(event) => update("description", event.target.value)} maxLength={180} placeholder="Describe your store in one sentence." /><StoreBrandFields brand={brand} onChange={setBrand} /></FormSection> : null}
    {step === 2 ? <FormSection title="Contact & location"><div className="grid gap-4 md:grid-cols-2"><AppSelect label="Store currency" isRequired isDisabled={Boolean(storefront)} options={CURRENCIES.map((currency) => ({ key: currency, label: currency }))} selectedKey={form.currency} onSelectionChange={(value) => update("currency", value)} /><AppInput label="Contact phone" value={form.phone} onChange={(event) => update("phone", event.target.value)} maxLength={40} isRequired placeholder="+234…" /><div className="md:col-span-2"><AppInput label="Address (optional)" value={form.address} onChange={(event) => update("address", event.target.value)} maxLength={300} placeholder="Street address" /></div><AppComboBox label="Country" placeholder="Search countries" isRequired allowsCustomValue={false} options={COUNTRIES.map((country) => ({ key: country.code, label: country.name }))} selectedKey={form.country || null} onSelectionChange={(value) => { if (value && value !== form.country) { update("country", value); update("state", ""); } }} /><AppComboBox label="State" placeholder={stateOptions.length ? "Search states" : "Choose a country first"} isDisabled={!stateOptions.length} isRequired allowsCustomValue={false} options={availableStates.map((state) => ({ key: state, label: state }))} selectedKey={form.state || null} onSelectionChange={(value) => update("state", value ?? "")} /><AppInput label="City" value={form.city} onChange={(event) => update("city", event.target.value)} maxLength={120} isRequired /><AppInput label="Zip code (optional)" value={form.zip_code} onChange={(event) => update("zip_code", event.target.value)} maxLength={24} /></div></FormSection> : null}
    {step === 3 ? <FormSection title="Review"><ExpandedStorePreview form={form} /></FormSection> : null}
  </FormPage>;
}

function StoreInformationPreview({ form }: { form: StoreInfoDraft }) {
  return <section className="overflow-hidden rounded-2xl border border-border bg-surface">
    <div className="flex items-center justify-between border-b border-border px-4 py-3"><p className="text-[13px] font-semibold">Store preview</p><span className="rounded-full bg-surface-secondary px-2.5 py-1 text-[11px] font-medium text-muted">Live preview</span></div>
    <div className="p-4">
      <div className="grid min-h-48 place-items-center overflow-hidden rounded-xl bg-surface-secondary">{form.logo_url ? <Image src={form.logo_url} alt="Store logo" width={128} height={128} unoptimized className="size-32 rounded-full object-cover" /> : <ImageSquare size={34} className="text-muted" />}</div>
      <h2 className="mt-4 text-lg font-semibold">{form.store_name || "Your store name"}</h2>
      {form.tagline ? <p className="mt-1 text-sm text-muted">{form.tagline}</p> : <p className="mt-1 text-sm text-muted">Your store tagline will appear here.</p>}
      <div className="mt-4 space-y-3 border-t border-border pt-4 text-[13px]">
        <div><p className="font-medium">Business</p><p className="mt-0.5 text-muted">{form.business_name || "Business name"} · {form.sector || "Choose a sector"}</p></div>
        {form.description ? <p className="line-clamp-3 text-muted">{form.description}</p> : null}
        <div><p className="font-medium">Contact</p><p className="mt-0.5 text-muted">{form.phone || "Contact phone"}</p></div>
        <div><p className="font-medium">Location</p><p className="mt-0.5 whitespace-pre-line text-muted">{displayStoreAddress(formattedAddress(form)) || "Store address"}</p></div>
        <p className="border-t border-border pt-3 text-muted">Currency · {form.currency}</p>
      </div>
    </div>
  </section>;
}

function ExpandedStorePreview({ form }: { form: StoreInfoDraft }) {
  return <div className="overflow-hidden rounded-2xl border border-border bg-white text-[#17211b]">
    <header className="flex items-center justify-between gap-4 border-b border-[#e8ece9] px-5 py-4 sm:px-8">
      <div className="flex min-w-0 items-center gap-3">{form.logo_url ? <Image src={form.logo_url} alt="Store logo" width={40} height={40} unoptimized className="size-10 rounded-full object-cover" /> : <div className="grid size-10 place-items-center rounded-full bg-[#eef4ef]"><ImageSquare size={18} className="text-[#6b786f]" /></div>}<span className="truncate font-semibold">{form.store_name || "Your store name"}</span></div>
      <nav className="hidden items-center gap-5 text-sm text-[#526057] sm:flex"><span>Home</span><span>Shop</span><span>About</span></nav>
      <span className="text-xs text-[#526057]">{form.phone || "Contact"}</span>
    </header>
    <section className="grid min-h-64 items-center gap-6 bg-[#f0f5f1] px-6 py-10 sm:grid-cols-[1.1fr_0.9fr] sm:px-10">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#63786a]">Welcome to {form.store_name || "our store"}</p><h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{form.tagline || "Find something you’ll love."}</h2><p className="mt-3 max-w-lg text-sm leading-6 text-[#526057]">{form.description || "Your store description will introduce your business and products to shoppers."}</p><span className="mt-5 inline-flex rounded-full bg-[#138c43] px-5 py-2.5 text-sm font-semibold text-white">Shop products</span></div>
      <div className="grid h-44 place-items-center overflow-hidden rounded-2xl bg-[#dfe9e1]">{form.logo_url ? <Image src={form.logo_url} alt="Store brand" width={128} height={128} unoptimized className="size-32 rounded-full object-cover" /> : <ImageSquare size={36} className="text-[#829287]" />}</div>
    </section>
    <section className="px-5 py-8 sm:px-8"><div className="flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#738078]">The collection</p><h3 className="mt-1 text-xl font-semibold">Featured products</h3></div><span className="text-sm text-[#138c43]">View all</span></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="overflow-hidden rounded-xl border border-[#e8ece9]"><div className="grid aspect-[4/3] place-items-center bg-[#f4f6f4]"><ImageSquare size={25} className="text-[#a3ada6]" /></div><div className="p-3"><p className="truncate text-sm font-medium">Your product will appear here</p><p className="mt-1 text-xs text-[#738078]">Product price</p></div></div>)}</div></section>
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e8ece9] bg-[#f8faf8] px-5 py-4 text-xs text-[#738078] sm:px-8"><span>{form.business_name || form.store_name || "Your business"} · {form.sector || "Business sector"}</span><span>{[form.city, form.state, countryName(form.country)].filter(Boolean).join(", ") || "Business location"} · {form.currency}</span></footer>
  </div>;
}

export function StoreInformationPage() {
  return <WorkspaceGate businessOnly>{(workspace) => <StoreInformationContent {...workspace} />}</WorkspaceGate>;
}
