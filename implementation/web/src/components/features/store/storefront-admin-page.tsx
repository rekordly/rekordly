"use client";

import {
  CheckCircle,
  DeviceMobile,
  Desktop,
  Globe,
  LinkSimple,
  Package,
  Plus,
  ShoppingBag,
  Storefront as StorefrontIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppSelect } from "@/components/ui/app-select";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader, Segmented, StatusPill } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { formatDate } from "@/lib/format";
import { financeApi, formatMinorAmount, moneyKeys } from "@/lib/money";
import { hasWorkspacePermission, useActiveWorkspace } from "@/stores/workspace-store";
import type { Permission } from "@/types/auth";
import type { CatalogueItem, MerchantOrder, Storefront, StorefrontDomain } from "@/types/finance";

import { StatusBadge, useFinanceAction, WorkspaceGate, type WorkspaceInfo } from "../finance/shared";
import { MerchantOrderDetailDrawer, PublishVariantDrawer } from "./storefront-admin-drawers";
import { StorefrontStats } from "../finance/section-stats";

const ADMIN_TABS = [
  { key: "overview", label: "Overview" },
  { key: "appearance", label: "Appearance & policies" },
  { key: "catalogue", label: "Catalogue" },
  { key: "orders", label: "Orders" },
  { key: "domains", label: "Domains" },
  { key: "analytics", label: "Analytics" },
] as const;

function StorefrontAdminContent({ workspaceId, currency }: WorkspaceInfo) {
  const [tab, setTab] = useState<(typeof ADMIN_TABS)[number]["key"]>("overview");
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [publishItem, setPublishItem] = useState<CatalogueItem | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [isColOpen, setIsColOpen] = useState(false);

  const workspaceScope = useActiveWorkspace();
  const can = (...perms: Permission[]) => hasWorkspacePermission(workspaceScope, perms);
  const canPublish = can("storefront.publish");
  const canAppearance = can("storefront.manage_appearance", "storefront.manage_checkout");
  const canCatalogue = can("storefront.manage_catalogue");
  const canDomain = can("storefront.manage_domain");
  const canConfirmOrder = can("orders.confirm");
  const canFulfilOrder = can("orders.fulfil");
  const canCancelOrder = can("orders.cancel", "orders.review");

  const storefrontQuery = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "storefront"],
    queryFn: () => financeApi.getMerchantStorefront(workspaceId),
    retry: false,
  });
  const outletsQuery = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "outlets"], queryFn: () => financeApi.listOutlets(workspaceId) });
  const collectionsQuery = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "storefront-collections"],
    queryFn: () => financeApi.listStorefrontCollections(workspaceId),
    enabled: Boolean(storefrontQuery.data),
  });
  const catalogueQuery = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "catalogue"],
    queryFn: () => financeApi.listCatalogueItems(workspaceId),
  });
  const publishedQuery = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "storefront-products"],
    queryFn: () => financeApi.listMerchantStorefrontProducts(workspaceId),
    enabled: Boolean(storefrontQuery.data),
  });
  const domainsQuery = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "storefront-domains"],
    queryFn: () => financeApi.listStorefrontDomains(workspaceId),
    enabled: Boolean(storefrontQuery.data),
  });
  const ordersQuery = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "storefront-orders"],
    queryFn: () => financeApi.listMerchantOrders(workspaceId),
    enabled: Boolean(storefrontQuery.data),
  });
  const analyticsQuery = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "storefront-analytics"],
    queryFn: () => financeApi.getStorefrontAnalytics(workspaceId, 30),
    enabled: Boolean(storefrontQuery.data),
  });

  // Draft creation form state
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newTheme, setNewTheme] = useState("classic");
  const [newOutletId, setNewOutletId] = useState("");
  const createSF = useFinanceAction(
    workspaceId,
    () =>
      financeApi.createStorefront(workspaceId, {
        name: newName,
        slug: newSlug,
        theme_key: newTheme,
        default_outlet_id: newOutletId ? Number(newOutletId) : undefined,
        currency,
      }),
    { success: "Draft storefront created", onDone: () => setIsCreateOpen(false) },
  );

  // Domain & Collection inputs
  const [customHost, setCustomHost] = useState("");
  const [colName, setColName] = useState("");
  const [colSlug, setColSlug] = useState("");

  const publishAction = useFinanceAction(workspaceId, () => financeApi.publishStorefront(workspaceId), { success: "Storefront published" });
  const unpublishAction = useFinanceAction(workspaceId, () => financeApi.unpublishStorefront(workspaceId), { success: "Storefront unpublished" });
  const addDomainAction = useFinanceAction(workspaceId, () => financeApi.addCustomDomain(workspaceId, customHost), { success: "Custom domain added — configure DNS record below", onDone: () => setCustomHost("") });
  const recheckDomainAction = useFinanceAction(workspaceId, (domainId: number) => financeApi.recheckCustomDomain(workspaceId, domainId), { success: "DNS & TLS rechecked" });
  const disconnectDomainAction = useFinanceAction(workspaceId, (domainId: number) => financeApi.disconnectCustomDomain(workspaceId, domainId), { success: "Custom domain disconnected" });
  const createCollectionAction = useFinanceAction(workspaceId, () => financeApi.createStorefrontCollection(workspaceId, { name: colName, slug: colSlug || undefined }), {
    success: "Collection created",
    onDone: () => {
      setIsColOpen(false);
      setColName("");
      setColSlug("");
    },
  });

  const sf = storefrontQuery.data;

  if (storefrontQuery.isPending) {
    return (
      <Page>
        <PageHeader title="Storefront" description="Loading storefront configuration…" />
      </Page>
    );
  }

  if (!sf) {
    return (
      <Page>
        <PageHeader title="Storefront" description="Create an optional public storefront for your business without disrupting internal books or stock." />
        <EmptyState
          icon={StorefrontIcon}
          title="No storefront created yet"
          description="Set up a draft shop to customize branding, choose which catalogue products are visible, and accept customer order requests."
          action={<AppButton startContent={<Plus weight="bold" />} label="Create draft storefront" onPress={() => setIsCreateOpen(true)} />}
        />
        <FormDrawer isOpen={isCreateOpen} onOpenChange={setIsCreateOpen} title="Create business storefront" description="Your storefront starts safely in draft mode. Nothing goes public until you publish." submitLabel="Create draft" isSubmitting={createSF.isPending} onSubmit={(e) => { e.preventDefault(); createSF.mutate(undefined); }}>
          <AppInput label="Store display name" isRequired value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Kola Ventures" />
          <AppInput label="Subdomain slug" isRequired value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="kola-ventures" description="Customers can visit kola-ventures.rekordly.com" />
          <AppSelect label="Starter theme" selectedKey={newTheme} onSelectionChange={setNewTheme} options={[{ key: "classic", label: "Classic" }, { key: "modern", label: "Modern" }, { key: "editorial", label: "Editorial" }, { key: "minimal", label: "Minimal" }]} />
          <AppSelect label="Default fulfilment outlet" selectedKey={newOutletId} onSelectionChange={setNewOutletId} placeholder="Choose default outlet" options={(outletsQuery.data ?? []).map((o) => ({ key: String(o.id), label: o.name }))} />
        </FormDrawer>
      </Page>
    );
  }

  const publishedVariantIds = new Set((publishedQuery.data ?? []).filter((p) => p.is_published).map((p) => p.variant_id));

  return (
    <Page>
      <PageHeader
        title={sf.name}
        description={`Slug: ${sf.slug} · Theme: ${sf.theme_key} · Currency: ${sf.currency}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {sf.status === "published" ? (
              <Link href={`/s/${sf.slug}`} target="_blank" className="inline-flex items-center gap-1.5 rounded-xl border border-default bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-default">
                <LinkSimple size={15} />
                Open public shop
              </Link>
            ) : null}
            {canPublish ? (
              sf.status === "published" ? (
                <AppButton variant="secondary" label="Unpublish" isLoading={unpublishAction.isPending} onPress={() => unpublishAction.mutate(undefined)} />
              ) : (
                <AppButton variant="primary" startContent={<CheckCircle weight="duotone" />} label="Publish storefront" isLoading={publishAction.isPending} onPress={() => publishAction.mutate(undefined)} />
              )
            ) : null}
          </div>
        }
      />
      <StorefrontStats workspaceId={workspaceId} />

      <Segmented aria-label="Storefront sections" options={ADMIN_TABS} value={tab} onChange={setTab} />

      {tab === "overview" ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-default bg-surface p-4">
              <p className="text-xs text-muted">Storefront state</p>
              <div className="mt-2"><StatusBadge status={sf.status} /></div>
            </div>
            <div className="rounded-2xl border border-default bg-surface p-4">
              <p className="text-xs text-muted">Published items</p>
              <p className="mt-2 text-lg font-semibold tabular">{sf.published_product_count}</p>
            </div>
            <div className="rounded-2xl border border-default bg-surface p-4">
              <p className="text-xs text-muted">Rekordly subdomain</p>
              <p className="mt-2 text-xs font-semibold text-foreground">{sf.subdomain_host}</p>
            </div>
            <div className="rounded-2xl border border-default bg-surface p-4">
              <p className="text-xs text-muted">Plan entitlement</p>
              <div className="mt-2"><StatusPill tone={sf.entitlement_status === "active" ? "success" : "warning"}>{sf.entitlement_status}</StatusPill></div>
            </div>
          </div>

          <div className="rounded-2xl border border-default bg-surface p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Interactive Desktop / Mobile Preview</p>
                <p className="text-xs text-muted">Preview your safe theme tokens before publishing.</p>
              </div>
              <div className="flex gap-2">
                <AppButton size="sm" variant={previewMode === "desktop" ? "primary" : "secondary"} startContent={<Desktop />} label="Desktop" onPress={() => setPreviewMode("desktop")} />
                <AppButton size="sm" variant={previewMode === "mobile" ? "primary" : "secondary"} startContent={<DeviceMobile />} label="Mobile" onPress={() => setPreviewMode("mobile")} />
              </div>
            </div>
            <div
              className={`mx-auto rounded-2xl border border-default overflow-hidden transition-all ${previewMode === "mobile" ? "max-w-[380px]" : "w-full"}`}
              style={{ backgroundColor: sf.settings.background_color, color: sf.settings.text_color }}
            >
              <div className="p-4 flex items-center justify-between text-white" style={{ backgroundColor: sf.settings.primary_color }}>
                <span className="font-semibold text-sm">{sf.name}</span>
                <span className="text-xs opacity-90">{sf.settings.contact_phone || sf.settings.contact_email || "Request orders"}</span>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <p className="text-lg font-bold">{sf.settings.tagline || `Welcome to ${sf.name}`}</p>
                  <p className="text-xs opacity-80 mt-1">{sf.settings.description || "Browse our public catalogue and send an order request directly."}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(publishedQuery.data ?? []).filter((p) => p.is_published).slice(0, 4).map((p) => (
                    <div key={p.id} className="rounded-xl border p-3 text-xs space-y-1">
                      <p className="font-semibold">{p.public_title}</p>
                      <p className="tabular font-bold" style={{ color: sf.settings.accent_color }}>
                        {formatMinorAmount(p.public_price_minor, p.currency, sf.currency_exponent)}
                      </p>
                    </div>
                  ))}
                  {sf.published_product_count === 0 ? <p className="text-xs opacity-70">Publish products in the Catalogue tab to preview cards here.</p> : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : tab === "appearance" ? (
        <AppearanceAndPolicyForm key={`st-${sf.settings.version}`} workspaceId={workspaceId} storefront={sf} readOnly={!canAppearance} />
      ) : tab === "catalogue" ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Collections ({collectionsQuery.data?.length ?? 0})</p>
            {canCatalogue ? <AppButton size="sm" variant="secondary" startContent={<Plus />} label="New collection" onPress={() => setIsColOpen(true)} /> : null}
          </div>
          {(collectionsQuery.data?.length ?? 0) > 0 ? (
            <div className="flex flex-wrap gap-2">
              {collectionsQuery.data!.map((c) => (
                <StatusPill key={c.id} tone="neutral">{c.name} ({c.slug})</StatusPill>
              ))}
            </div>
          ) : null}

          <DataView<CatalogueItem>
            title="Internal catalogue items"
            rows={catalogueQuery.data ?? []}
            rowKey={(c) => c.id}
            isLoading={catalogueQuery.isPending}
            isError={catalogueQuery.isError}
            searchPlaceholder="Search catalogue items"
            getSearchText={(c) => `${c.name} ${c.kind} ${c.status}`}
            empty={<EmptyState icon={Package} title="No catalogue items" description="Add products or services in Inventory / Catalogue before publishing them." />}
            columns={[
              { key: "name", label: "Product / Service", render: (c) => <span className="font-medium text-foreground">{c.name}</span> },
              { key: "kind", label: "Type", render: (c) => c.kind },
              { key: "status", label: "Internal status", render: (c) => <StatusBadge status={c.status} /> },
              {
                key: "pub",
                label: "Storefront",
                render: (c) => (publishedVariantIds.size > 0 && (publishedQuery.data ?? []).some((p) => p.product_id === c.id && p.is_published) ? <StatusPill tone="success">Published</StatusPill> : <StatusPill tone="neutral">Hidden</StatusPill>),
              },
              {
                key: "actions",
                label: "",
                align: "right",
                render: (c) => <AppButton size="sm" variant="secondary" label="Configure / Publish" isDisabled={!canCatalogue} onPress={() => setPublishItem(c)} />,
              },
            ]}
            renderCard={(c) => <RecordCard icon={<Package size={18} />} iconClassName="bg-primary-soft text-primary" reference={c.kind} title={c.name} amount={c.status} actions={<AppButton size="sm" variant="secondary" label="Publish" onPress={() => setPublishItem(c)} />} />}
          />
        </div>
      ) : tab === "orders" ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <AppButton
              size="sm"
              variant="secondary"
              label="Export CSV"
              onPress={async () => {
                const blob = await financeApi.exportMerchantOrdersCsv(workspaceId);
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "storefront-orders.csv";
                a.click();
                URL.revokeObjectURL(url);
              }}
            />
          </div>
          <DataView<MerchantOrder>
            title="Storefront order requests"
            rows={ordersQuery.data ?? []}
            rowKey={(o) => o.id}
            isLoading={ordersQuery.isPending}
            isError={ordersQuery.isError}
            searchPlaceholder="Search order reference or customer"
            getSearchText={(o) => `${o.order_reference} ${o.customer_name} ${o.commercial_status}`}
            empty={<EmptyState icon={ShoppingBag} title="No order requests yet" description="Guest checkout requests from your storefront will appear here for confirmation and stock reservation." />}
            columns={[
              { key: "ref", label: "Reference", render: (o) => <span className="font-semibold text-foreground">{o.order_reference}</span> },
              { key: "customer", label: "Customer", render: (o) => o.customer_name },
              { key: "commercial", label: "Commercial", render: (o) => <StatusBadge status={o.commercial_status} /> },
              { key: "fulfilment", label: "Fulfilment", render: (o) => <StatusPill tone="neutral">{o.fulfilment_status}</StatusPill> },
              { key: "total", label: "Total", align: "right", render: (o) => <span className="tabular font-semibold">{formatMinorAmount(o.total_minor, o.currency, o.currency_exponent)}</span> },
              { key: "actions", label: "", align: "right", render: (o) => <AppButton size="sm" variant="secondary" label="Review" onPress={() => setSelectedOrderId(o.id)} /> },
            ]}
            renderCard={(o) => <RecordCard icon={<ShoppingBag size={18} />} iconClassName="bg-primary-soft text-primary" reference={o.order_reference} title={o.customer_name} amount={formatMinorAmount(o.total_minor, o.currency, o.currency_exponent)} status={<StatusBadge status={o.commercial_status} />} actions={<AppButton size="sm" variant="secondary" label="Review" onPress={() => setSelectedOrderId(o.id)} />} />}
          />
        </div>
      ) : tab === "domains" ? (
        <div className="space-y-6">
          {canDomain ? (
            <form
              className="rounded-2xl border border-default bg-surface p-4 flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (customHost.trim()) addDomainAction.mutate(undefined);
              }}
            >
              <div className="flex-1 min-w-[220px]">
                <AppInput label="Connect custom domain" value={customHost} onChange={(e) => setCustomHost(e.target.value)} placeholder="shop.yourbusiness.com" description="Enter hostname only without https:// or paths." />
              </div>
              <AppButton type="submit" startContent={<Globe />} label="Add domain" isLoading={addDomainAction.isPending} />
            </form>
          ) : null}

          <DataView<StorefrontDomain>
            title="Storefront domains"
            rows={domainsQuery.data ?? []}
            rowKey={(d) => d.id}
            isLoading={domainsQuery.isPending}
            isError={domainsQuery.isError}
            searchPlaceholder="Filter domains"
            getSearchText={(d) => `${d.hostname} ${d.status}`}
            empty={<EmptyState icon={Globe} title="No domains" description="Subdomain fallback is provisioned automatically." />}
            columns={[
              { key: "host", label: "Hostname", render: (d) => <span className="font-medium text-foreground">{d.hostname}</span> },
              { key: "type", label: "Type", render: (d) => d.domain_type },
              { key: "status", label: "Verification / TLS", render: (d) => <StatusPill tone={d.status === "active" ? "success" : "warning"}>{d.status} · TLS: {d.tls_status}</StatusPill> },
              {
                key: "dns",
                label: "DNS TXT challenge",
                render: (d) => (d.verification_txt_host && d.verification_token ? <span className="text-xs font-mono">{d.verification_txt_host} = {d.verification_token}</span> : "Automatic"),
              },
              {
                key: "actions",
                label: "",
                align: "right",
                render: (d) =>
                  d.domain_type === "custom" && canDomain ? (
                    <div className="flex gap-2 justify-end">
                      <AppButton size="sm" variant="secondary" label="Recheck DNS" isDisabled={d.status === "disconnected"} onPress={() => recheckDomainAction.mutate(d.id)} />
                      <AppButton size="sm" variant="tertiary" label="Disconnect" isDisabled={d.status === "disconnected"} onPress={() => disconnectDomainAction.mutate(d.id)} />
                    </div>
                  ) : null,
              },
            ]}
            renderCard={(d) => <RecordCard icon={<Globe size={18} />} iconClassName="bg-primary-soft text-primary" reference={d.domain_type} title={d.hostname} amount={d.status} />}
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Page views (30d)", analyticsQuery.data?.page_views ?? 0],
            ["Searches (30d)", analyticsQuery.data?.searches ?? 0],
            ["Add to carts", analyticsQuery.data?.add_to_carts ?? 0],
            ["Checkouts submitted", analyticsQuery.data?.checkouts_submitted ?? 0],
            ["Orders confirmed", analyticsQuery.data?.orders_confirmed ?? 0],
            ["Orders fulfilled", analyticsQuery.data?.orders_fulfilled ?? 0],
            ["Orders declined", analyticsQuery.data?.orders_declined ?? 0],
            ["Orders cancelled", analyticsQuery.data?.orders_cancelled ?? 0],
          ].map(([label, val]) => (
            <div key={String(label)} className="rounded-2xl border border-default bg-surface p-4">
              <p className="text-xs text-muted">{label}</p>
              <p className="mt-2 text-xl font-semibold tabular text-foreground">{val}</p>
            </div>
          ))}
          {analyticsQuery.data ? <p className="col-span-full text-xs text-muted">Aggregated since {formatDate(analyticsQuery.data.since_date)}. Visitor PII and raw search terms are omitted.</p> : null}
        </div>
      )}

      <FormDrawer isOpen={isColOpen} onOpenChange={setIsColOpen} title="New storefront collection" description="Group published catalogue items into public collections." submitLabel="Create collection" isSubmitting={createCollectionAction.isPending} onSubmit={(e) => { e.preventDefault(); createCollectionAction.mutate(undefined); }}>
        <AppInput label="Collection name" isRequired value={colName} onChange={(e) => setColName(e.target.value)} placeholder="Menswear" />
        <AppInput label="Slug (optional)" value={colSlug} onChange={(e) => setColSlug(e.target.value)} placeholder="menswear" />
      </FormDrawer>

      <PublishVariantDrawer workspaceId={workspaceId} storefront={sf} item={publishItem} collections={collectionsQuery.data ?? []} onClose={() => setPublishItem(null)} />

      <MerchantOrderDetailDrawer
        workspaceId={workspaceId}
        orderId={selectedOrderId}
        outlets={outletsQuery.data ?? []}
        canConfirm={canConfirmOrder}
        canFulfil={canFulfilOrder}
        canCancel={canCancelOrder}
        onClose={() => setSelectedOrderId(null)}
      />
    </Page>
  );
}

function AppearanceAndPolicyForm({ workspaceId, storefront, readOnly }: { workspaceId: number; storefront: Storefront; readOnly: boolean }) {
  const s = storefront.settings;
  const [name, setName] = useState(storefront.name);
  const [slug, setSlug] = useState(storefront.slug);
  const [theme, setTheme] = useState<string>(storefront.theme_key);
  const [tagline, setTagline] = useState(s.tagline ?? "");
  const [description, setDescription] = useState(s.description ?? "");
  const [primaryColor, setPrimaryColor] = useState(s.primary_color);
  const [accentColor, setAccentColor] = useState(s.accent_color);
  const [bgColor, setBgColor] = useState(s.background_color);
  const [textColor, setTextColor] = useState(s.text_color);
  const [fontFamily, setFontFamily] = useState(s.font_family);
  const [phone, setPhone] = useState(s.contact_phone ?? "");
  const [email, setEmail] = useState(s.contact_email ?? "");
  const [whatsapp, setWhatsapp] = useState(s.whatsapp_number ?? "");
  const [address, setAddress] = useState(s.address ?? "");
  const [delivFee, setDelivFee] = useState(String(Number(s.default_delivery_fee_minor || "0") / Math.pow(10, storefront.currency_exponent)));
  const [delivGuidance, setDelivGuidance] = useState(s.delivery_guidance ?? "");
  const [returnPolicy, setReturnPolicy] = useState(s.return_policy ?? "");
  const [termsPolicy, setTermsPolicy] = useState(s.terms_policy ?? "");
  const [seoTitle, setSeoTitle] = useState(s.seo_title ?? "");
  const [seoDesc, setSeoDesc] = useState(s.seo_description ?? "");

  const save = useFinanceAction(workspaceId, (body: unknown) => financeApi.updateStorefrontSettings(workspaceId, body), { success: "Storefront settings updated" });

  return (
    <form
      className="rounded-2xl border border-default bg-surface p-5 space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({
          name,
          slug,
          theme_key: theme,
          tagline,
          description,
          primary_color: primaryColor,
          accent_color: accentColor,
          background_color: bgColor,
          text_color: textColor,
          font_family: fontFamily,
          contact_phone: phone,
          contact_email: email,
          whatsapp_number: whatsapp,
          address,
          default_delivery_fee: delivFee || "0",
          delivery_guidance: delivGuidance,
          return_policy: returnPolicy,
          terms_policy: termsPolicy,
          seo_title: seoTitle,
          seo_description: seoDesc,
        });
      }}
    >
      <div className="grid sm:grid-cols-3 gap-3">
        <AppInput label="Storefront name" value={name} onChange={(e) => setName(e.target.value)} isDisabled={readOnly} />
        <AppInput label="Slug" value={slug} onChange={(e) => setSlug(e.target.value)} isDisabled={readOnly} />
        <AppSelect label="Theme" selectedKey={theme} onSelectionChange={setTheme} isDisabled={readOnly} options={[{ key: "classic", label: "Classic" }, { key: "modern", label: "Modern" }, { key: "editorial", label: "Editorial" }, { key: "minimal", label: "Minimal" }]} />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <AppInput label="Tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} isDisabled={readOnly} />
        <AppInput label="Short description" value={description} onChange={(e) => setDescription(e.target.value)} isDisabled={readOnly} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <AppInput label="Primary hex" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} isDisabled={readOnly} />
        <AppInput label="Accent hex" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} isDisabled={readOnly} />
        <AppInput label="Background hex" value={bgColor} onChange={(e) => setBgColor(e.target.value)} isDisabled={readOnly} />
        <AppInput label="Text hex" value={textColor} onChange={(e) => setTextColor(e.target.value)} isDisabled={readOnly} />
        <AppSelect label="Font" selectedKey={fontFamily} onSelectionChange={setFontFamily} isDisabled={readOnly} options={[{ key: "inter", label: "Inter" }, { key: "plus_jakarta", label: "Plus Jakarta" }, { key: "dm_sans", label: "DM Sans" }, { key: "merriweather", label: "Merriweather" }, { key: "system", label: "System" }]} />
      </div>
      <div className="grid sm:grid-cols-4 gap-3">
        <AppInput label="Public phone" value={phone} onChange={(e) => setPhone(e.target.value)} isDisabled={readOnly} />
        <AppInput label="Public email" value={email} onChange={(e) => setEmail(e.target.value)} isDisabled={readOnly} />
        <AppInput label="WhatsApp number" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} isDisabled={readOnly} />
        <AppInput label={`Delivery fee (${storefront.currency})`} value={delivFee} onChange={(e) => setDelivFee(e.target.value)} isDisabled={readOnly} />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <AppInput label="Address & business hours" value={address} onChange={(e) => setAddress(e.target.value)} isDisabled={readOnly} />
        <AppInput label="Delivery guidance" value={delivGuidance} onChange={(e) => setDelivGuidance(e.target.value)} isDisabled={readOnly} />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <AppInput label="Return policy" value={returnPolicy} onChange={(e) => setReturnPolicy(e.target.value)} isDisabled={readOnly} />
        <AppInput label="Terms policy" value={termsPolicy} onChange={(e) => setTermsPolicy(e.target.value)} isDisabled={readOnly} />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <AppInput label="SEO title" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} isDisabled={readOnly} />
        <AppInput label="SEO description" value={seoDesc} onChange={(e) => setSeoDesc(e.target.value)} isDisabled={readOnly} />
      </div>
      {!readOnly ? <AppButton type="submit" label="Save appearance & policies" isLoading={save.isPending} /> : null}
    </form>
  );
}

export function StorefrontAdminPage() {
  return <WorkspaceGate businessOnly>{(workspace) => <StorefrontAdminContent key={workspace.workspaceId} {...workspace} />}</WorkspaceGate>;
}
