"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bank, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { AppButton } from "@/components/ui/app-button";
import { AppComboBox } from "@/components/ui/app-combo-box";
import { AppInput } from "@/components/ui/app-input";
import { AppSelect } from "@/components/ui/app-select";
import { AppSwitch } from "@/components/ui/app-switch";
import { AppTextarea } from "@/components/ui/app-textarea";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { SideSheet } from "@/components/ui/side-sheet";
import { Page, PageHeader } from "@/components/ui/page";
import { toast } from "@heroui/react";
import { financeApi, moneyKeys } from "@/lib/money";
import { hasWorkspacePermission, useActiveWorkspace } from "@/stores/workspace-store";
import { WorkspaceGate, useFinanceAction, type WorkspaceInfo } from "../finance/shared";
import type { InventoryOutlet, Storefront, StorefrontPaymentSettingsView } from "@/types/finance";
import { uploadProductImage } from "@/lib/products";

type CardKey = "details" | "delivery" | "payments" | "shoppers" | "policies" | "sharing";
type DeliveryAreaDraft = { id: number; name: string; fee: string; description: string; state: string; estimate_text: string; outlet_id: string };
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

function PaymentsForm({
  workspaceId,
  draft,
  set,
  paymentSettings,
  refetchPayments,
}: {
  workspaceId: number;
  draft: Record<string, unknown>;
  set: (key: string, value: unknown) => void;
  paymentSettings?: StorefrontPaymentSettingsView;
  refetchPayments: () => void;
}) {
  const [isChangingAccount, setIsChangingAccount] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [resolvedName, setResolvedName] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState("");
  const [isSavingPayout, setIsSavingPayout] = useState(false);

  const banksQuery = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "payment-banks"],
    queryFn: () => financeApi.listPaymentBanks(workspaceId, "paystack"),
  });
  const banks = banksQuery.data ?? [];
  const payout = paymentSettings?.payout_account;

  const handleResolve = async (bCode: string, accNum: string) => {
    if (!bCode || accNum.length !== 10) return;
    setIsResolving(true);
    setResolveError("");
    try {
      const res = await financeApi.resolveStorefrontBankAccount(workspaceId, {
        bank_code: bCode,
        account_number: accNum,
      });
      setResolvedName(res.account_name);
    } catch (err: unknown) {
      setResolvedName("");
      setResolveError((err as Error)?.message || "Could not resolve bank account");
    } finally {
      setIsResolving(false);
    }
  };

  const handleSavePayoutAccount = async () => {
    if (!bankCode || accountNumber.length !== 10 || !resolvedName) return;
    setIsSavingPayout(true);
    try {
      await financeApi.saveStorefrontPayoutAccount(workspaceId, {
        bank_code: bankCode,
        account_number: accountNumber,
        account_name: resolvedName,
      });
      setIsChangingAccount(false);
      setBankCode("");
      setAccountNumber("");
      setResolvedName("");
      refetchPayments();
    } catch (err: unknown) {
      setResolveError((err as Error)?.message || "Failed to save payout account");
    } finally {
      setIsSavingPayout(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Payout Account */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Merchant payout account</p>
          {payout && !isChangingAccount ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle size={12} weight="fill" />
              {payout.status === "active" ? "Connected" : payout.status}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted">Customer payments are collected by the provider and settled directly into this account.</p>

        {payout && !isChangingAccount ? (
          <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Bank size={20} className="text-primary" />
              <span className="font-semibold text-sm">{payout.account_name}</span>
            </div>
            <p className="text-xs text-muted">Account ending in •••• {payout.account_number_last4} ({payout.provider.toUpperCase()})</p>
            <AppButton
              size="sm"
              variant="tertiary"
              label="Change account"
              onPress={() => setIsChangingAccount(true)}
            />
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
            <p className="text-xs font-semibold text-foreground">Connect bank account</p>
            <AppComboBox
              label="Settlement bank"
              placeholder="Search or select bank..."
              options={banks.map((b) => ({ key: b.code, label: b.name }))}
              selectedKey={bankCode}
              onSelectionChange={(key) => {
                setBankCode(key ?? "");
                setResolvedName("");
                setResolveError("");
                if (key && accountNumber.length === 10) {
                  void handleResolve(key, accountNumber);
                }
              }}
            />
            <AppInput
              label="Account number (10 digits)"
              placeholder="0123456789"
              maxLength={10}
              value={accountNumber}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                setAccountNumber(val);
                setResolvedName("");
                setResolveError("");
                if (val.length === 10 && bankCode) {
                  void handleResolve(bankCode, val);
                }
              }}
            />
            {isResolving && <p className="text-xs text-muted">Resolving account name…</p>}
            {resolvedName && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-2.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle size={16} weight="fill" />
                <span>{resolvedName}</span>
              </div>
            )}
            {resolveError && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 p-2.5 text-xs text-rose-600 dark:text-rose-400">
                <WarningCircle size={16} />
                <span>{resolveError}</span>
              </div>
            )}
            <div className="flex items-center gap-2 pt-1">
              <AppButton
                size="sm"
                variant="secondary"
                label="Save payout account"
                isDisabled={!bankCode || accountNumber.length !== 10 || !resolvedName || isSavingPayout}
                isLoading={isSavingPayout}
                onPress={handleSavePayoutAccount}
              />
              {payout && (
                <AppButton
                  size="sm"
                  variant="tertiary"
                  label="Cancel"
                  onPress={() => setIsChangingAccount(false)}
                />
              )}
            </div>
          </div>
        )}
      </section>

      {/* Payment methods */}
      <section className="space-y-3 pt-2">
        <p className="text-sm font-semibold">Payment methods</p>
        <div className="space-y-2 rounded-xl border border-border bg-surface-raised p-3">
          <AppSwitch
            label="Bank transfer (Virtual account)"
            description="Shopper receives an instant virtual account for mobile app transfers."
            isSelected={Boolean(draft.payment_bank_transfer_enabled)}
            onChange={(v) => set("payment_bank_transfer_enabled", v)}
          />
          <AppSwitch
            label="Card payment"
            description="Debit and credit card payments (Mastercard, Visa, Verve)."
            isSelected={Boolean(draft.payment_card_enabled)}
            onChange={(v) => set("payment_card_enabled", v)}
          />
          <AppSwitch
            label="Manual bank transfer"
            description="Customer transfers to your bank account and awaits your manual confirmation."
            isSelected={Boolean(draft.payment_manual_transfer_enabled)}
            onChange={(v) => set("payment_manual_transfer_enabled", v)}
          />
          {Boolean(draft.payment_manual_transfer_enabled) && (
            <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
              <p className="text-xs font-medium text-muted">Bank account shown to shoppers for manual transfer</p>
              <AppInput
                label="Bank name"
                placeholder="e.g. Guaranty Trust Bank"
                value={String(draft.manual_bank_name ?? "")}
                onChange={(e) => set("manual_bank_name", e.target.value)}
              />
              <AppInput
                label="Account number"
                placeholder="0123456789"
                maxLength={20}
                value={String(draft.manual_bank_account_number ?? "")}
                onChange={(e) => set("manual_bank_account_number", e.target.value)}
              />
              <AppInput
                label="Account name"
                placeholder="Your Business Name"
                value={String(draft.manual_bank_account_name ?? "")}
                onChange={(e) => set("manual_bank_account_name", e.target.value)}
              />
            </div>
          )}
          <AppSwitch
            label="Pay on delivery / pickup"
            description="Customer pays with cash or POS upon package receipt or pickup."
            isSelected={Boolean(draft.payment_cod_enabled)}
            onChange={(v) => set("payment_cod_enabled", v)}
          />
        </div>
      </section>

      {/* Processing fee bearer */}
      <section className="space-y-2 pt-2">
        <p className="text-sm font-semibold">Payment processing fee bearer</p>
        <p className="text-xs text-muted">Providers charge a standard 1.5% transaction processing fee.</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`rounded-xl border p-3 text-left transition-colors ${
              draft.fee_bearer === "merchant"
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-border bg-surface text-foreground hover:bg-muted/10"
            }`}
            onClick={() => set("fee_bearer", "merchant")}
          >
            <div className="text-sm font-semibold">Me (Merchant)</div>
            <div className="text-xs text-muted">Merchant bears the 1.5% fee</div>
          </button>
          <button
            type="button"
            className={`rounded-xl border p-3 text-left transition-colors ${
              draft.fee_bearer === "customer"
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-border bg-surface text-foreground hover:bg-muted/10"
            }`}
            onClick={() => set("fee_bearer", "customer")}
          >
            <div className="text-sm font-semibold">Customer</div>
            <div className="text-xs text-muted">Fee added to total at checkout</div>
          </button>
        </div>
      </section>

      {/* Rekordly fee */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-surface-raised p-3">
        <div>
          <p className="text-sm font-medium">Rekordly fee</p>
          <p className="text-xs text-muted">Platform commission on storefront orders</p>
        </div>
        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          Free (0%)
        </span>
      </div>

      {/* Stock Hold Durations */}
      <section className="space-y-2 pt-2">
        <p className="text-sm font-semibold">Stock hold countdowns</p>
        <p className="text-xs text-muted">Inventory is temporarily reserved during checkout so items are not oversold.</p>
        <div className="grid grid-cols-2 gap-2">
          <AppInput
            label="Online payment (minutes)"
            type="number"
            min="5"
            max="120"
            value={String(draft.hold_payment_minutes ?? 15)}
            onChange={(e) => set("hold_payment_minutes", Number(e.target.value))}
          />
          <AppInput
            label="Manual transfer (hours)"
            type="number"
            min="1"
            max="72"
            value={String(draft.hold_manual_transfer_hours ?? 2)}
            onChange={(e) => set("hold_manual_transfer_hours", Number(e.target.value))}
          />
          <AppInput
            label="Review hold (hours)"
            type="number"
            min="1"
            max="72"
            value={String(draft.hold_confirmation_hours ?? 2)}
            onChange={(e) => set("hold_confirmation_hours", Number(e.target.value))}
          />
          <AppInput
            label="Pickup collection (hours)"
            type="number"
            min="1"
            max="168"
            value={String(draft.hold_pickup_hours ?? 48)}
            onChange={(e) => set("hold_pickup_hours", Number(e.target.value))}
          />
        </div>
      </section>

      {/* Shopper contact info */}
      <section className="space-y-2 pt-2">
        <p className="text-sm font-semibold">Customer checkout requirements</p>
        <div className="space-y-2 rounded-xl border border-border bg-surface-raised p-3">
          <AppSwitch
            label="Ask shoppers for email"
            description="Used for order tracking, receipt delivery, and login codes."
            isSelected={Boolean(draft.checkout_require_email)}
            onChange={(v) => set("checkout_require_email", v)}
          />
          <AppSwitch
            label="Ask shoppers for phone"
            description="Used for SMS delivery updates and courier dispatch."
            isSelected={Boolean(draft.checkout_require_phone)}
            onChange={(v) => set("checkout_require_phone", v)}
          />
        </div>
      </section>
    </div>
  );
}

function SettingsContent({ workspaceId }: WorkspaceInfo) {
  const workspace = useActiveWorkspace();
  const canEdit = hasWorkspacePermission(workspace, ["storefront.manage_appearance", "storefront.manage_checkout"]);
  const query = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "storefront-settings"], queryFn: () => financeApi.getStorefrontSettings(workspaceId), retry: false });
  const paymentSettingsQuery = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "storefront-payments"],
    queryFn: () => financeApi.getStorefrontPayments(workspaceId),
    retry: false,
  });
  const outletsQuery = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "outlets"],
    queryFn: () => financeApi.listOutlets(workspaceId),
    retry: false,
  });

  const [active, setActive] = useState<CardKey | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const sf = query.data;
  const paySettings = paymentSettingsQuery.data;
  const outlets = outletsQuery.data ?? [];

  const update = useFinanceAction(workspaceId, (body: unknown) => financeApi.updateStorefrontSettings(workspaceId, body), {
    success: "Store settings saved",
    onDone: () => { setActive(null); void query.refetch(); },
  });

  const togglePickupPoint = async (outlet: InventoryOutlet, isPickup: boolean, note?: string) => {
    try {
      await financeApi.updateOutlet(workspaceId, outlet.id, {
        is_pickup_point: isPickup,
        pickup_note: note ?? outlet.pickup_note ?? "",
      });
      void outletsQuery.refetch();
      toast.success("Pickup point updated");
    } catch (err: unknown) {
      toast.danger((err as Error)?.message || "Could not update pickup point");
    }
  };

  const open = (key: CardKey) => {
    if (!sf) return;
    const s = sf.settings;
    const values: Record<CardKey, Record<string, unknown>> = {
      details: { name: sf.name, slug: sf.slug, contact_phone: s.contact_phone ?? "", contact_email: s.contact_email ?? "", address: s.address ?? "", whatsapp_number: s.whatsapp_number ?? "", business_hours: s.business_hours },
      delivery: {
        delivery_methods: s.delivery_methods,
        delivery_guidance: s.delivery_guidance ?? "",
        default_delivery_fee: minorToMajor(s.default_delivery_fee_minor, sf.currency_exponent),
        free_delivery_threshold: s.free_delivery_threshold_minor ? minorToMajor(s.free_delivery_threshold_minor, sf.currency_exponent) : "",
        delivery_areas: s.delivery_areas.filter((area) => area.is_active).map((area) => ({
          id: area.id,
          name: area.name,
          fee: minorToMajor(area.fee_minor, sf.currency_exponent),
          description: area.description,
          state: area.state ?? "",
          estimate_text: area.estimate_text ?? "",
          outlet_id: area.outlet_id ? String(area.outlet_id) : "",
        })),
      },
      payments: {
        checkout_require_email: s.checkout_require_email,
        checkout_require_phone: s.checkout_require_phone,
        reservation_ttl_hours: sf.reservation_ttl_hours,
        payment_bank_transfer_enabled: paySettings?.payment_bank_transfer_enabled ?? true,
        payment_card_enabled: paySettings?.payment_card_enabled ?? false,
        payment_manual_transfer_enabled: paySettings?.payment_manual_transfer_enabled ?? false,
        payment_cod_enabled: paySettings?.payment_cod_enabled ?? false,
        fee_bearer: paySettings?.fee_bearer ?? "merchant",
        hold_payment_minutes: paySettings?.hold_payment_minutes ?? 15,
        hold_manual_transfer_hours: paySettings?.hold_manual_transfer_hours ?? 2,
        hold_confirmation_hours: paySettings?.hold_confirmation_hours ?? 2,
        hold_pickup_hours: paySettings?.hold_pickup_hours ?? 48,
        manual_bank_name: paySettings?.manual_bank_name ?? "",
        manual_bank_account_number: paySettings?.manual_bank_account_number ?? "",
        manual_bank_account_name: paySettings?.manual_bank_account_name ?? "",
      },
      shoppers: { tagline: s.tagline ?? "", description: s.description ?? "", logo_url: s.logo_url ?? "", banner_url: s.banner_url ?? "", auto_show_new_products: s.auto_show_new_products, show_sold_out: s.show_sold_out, show_stock_count: s.show_stock_count, low_stock_threshold: s.low_stock_threshold },
      policies: { return_policy: s.return_policy ?? "", privacy_policy: s.privacy_policy ?? "", terms_policy: s.terms_policy ?? "", custom_policy: s.custom_policy ?? "" },
      sharing: { seo_title: s.seo_title ?? "", seo_description: s.seo_description ?? "", seo_image_url: s.seo_image_url ?? "", seo_indexable: s.seo_indexable },
    };
    setDraft(values[key]); setActive(key);
  };

  const set = (key: string, value: unknown) => setDraft((old) => ({ ...old, [key]: value }));
  const field = (key: string, label: string, placeholder = "") => <AppInput label={label} value={String(draft[key] ?? "")} onChange={(e) => set(key, e.target.value)} placeholder={placeholder} />;

  const save = async () => {
    if (!active) return;
    if (active === "payments") {
      try {
        await financeApi.updateStorefrontPaymentSettings(workspaceId, {
          payment_bank_transfer_enabled: Boolean(draft.payment_bank_transfer_enabled),
          payment_card_enabled: Boolean(draft.payment_card_enabled),
          payment_manual_transfer_enabled: Boolean(draft.payment_manual_transfer_enabled),
          payment_cod_enabled: Boolean(draft.payment_cod_enabled),
          fee_bearer: (draft.fee_bearer as "merchant" | "customer") || "merchant",
          hold_payment_minutes: Number(draft.hold_payment_minutes ?? 15),
          hold_manual_transfer_hours: Number(draft.hold_manual_transfer_hours ?? 2),
          hold_confirmation_hours: Number(draft.hold_confirmation_hours ?? 2),
          hold_pickup_hours: Number(draft.hold_pickup_hours ?? 48),
          manual_bank_name: String(draft.manual_bank_name ?? ""),
          manual_bank_account_number: String(draft.manual_bank_account_number ?? ""),
          manual_bank_account_name: String(draft.manual_bank_account_name ?? ""),
        });
        void paymentSettingsQuery.refetch();
      } catch (err: unknown) {
        toast.danger((err as Error)?.message || "Failed to save payment settings");
        return;
      }
      update.mutate({
        card: "payments",
        checkout_require_email: Boolean(draft.checkout_require_email),
        checkout_require_phone: Boolean(draft.checkout_require_phone),
        reservation_ttl_hours: Number(draft.reservation_ttl_hours ?? 48),
        idempotency_key: crypto.randomUUID(),
      });
      return;
    }
    if (active === "delivery") {
      const areasPayload = ((draft.delivery_areas as DeliveryAreaDraft[]) ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        fee: a.fee,
        description: a.description,
        state: a.state ? a.state : null,
        estimate_text: a.estimate_text ?? "",
        outlet_id: a.outlet_id ? Number(a.outlet_id) : null,
      }));
      update.mutate({ ...draft, delivery_areas: areasPayload, card: active, idempotency_key: crypto.randomUUID() });
      return;
    }
    update.mutate({ ...draft, card: active, idempotency_key: crypto.randomUUID() });
  };

  if (query.isPending) return <Page><p className="py-8 text-sm text-muted">Loading store settings…</p></Page>;
  if (!sf) return <Page><p className="py-8 text-sm text-muted">Create your store before changing its settings.</p></Page>;

  const getCardSummary = (key: CardKey): string => {
    if (key === "payments") {
      if (paySettings?.payout_account) {
        return `${paySettings.payout_account.account_name} · •••• ${paySettings.payout_account.account_number_last4}`;
      }
      return "Configure payout account, payment methods & stock holds";
    }
    return CARD_INFO[key].summary(sf);
  };

  return <Page><PageHeader title="Store settings" />
    <div className="grid gap-3 sm:grid-cols-2">
      {(Object.keys(CARD_INFO) as CardKey[]).map((key) => <section key={key} className="rounded-2xl border border-border bg-surface p-4"><h2 className="font-semibold">{CARD_INFO[key].title}</h2><p className="mt-1 truncate text-sm text-muted">{getCardSummary(key)}</p><AppButton className="mt-3" size="sm" variant="secondary" label="Edit" isDisabled={!canEdit} onPress={() => open(key)} /></section>)}
    </div>
    <SideSheet isOpen={Boolean(active)} onClose={() => setActive(null)} title={active ? CARD_INFO[active].title : "Edit settings"} footer={<><AppButton variant="tertiary" label="Cancel" onPress={() => setActive(null)} /><AppButton label="Save changes" isLoading={update.isPending} onPress={save} /></>}>
      <div className="space-y-4">
        {active === "details" && <>{field("name", "Store name")}{field("slug", "Store link", "your-store")}{field("contact_phone", "Phone")}{field("contact_email", "Email")}{field("whatsapp_number", "WhatsApp number")}{field("address", "Address")}<fieldset className="space-y-2"><legend className="text-sm font-semibold">Opening hours</legend>{["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map((day)=><AppInput key={day} label={day} value={String((draft.business_hours as Record<string,string>)?.[day.toLowerCase()]??"")} placeholder="9:00 AM–5:00 PM or Closed" onChange={(e)=>set("business_hours",{...(draft.business_hours as Record<string,string>??{}),[day.toLowerCase()]:e.target.value})} />)}</fieldset></>}
        {active === "delivery" && <>
          <p className="text-sm font-medium">Delivery options</p>
          {(["pickup", "merchant_delivery", "customer_arranged"] as const).map((method) => (
            <AppSwitch key={method} label={method === "pickup" ? "Pickup" : method === "merchant_delivery" ? "Store delivery" : "Customer arranges delivery"} isSelected={(draft.delivery_methods as string[] ?? []).includes(method)} onChange={(checked) => set("delivery_methods", checked ? [...(draft.delivery_methods as string[] ?? []), method] : (draft.delivery_methods as string[] ?? []).filter((x) => x !== method))} />
          ))}
          {field("default_delivery_fee", `Default delivery fee (${sf.currency})`)}
          <div className="space-y-2 pt-2">
            <p className="text-xs font-semibold">Delivery areas</p>
            {((draft.delivery_areas as DeliveryAreaDraft[]) ?? []).map((area, index) => (
              <div key={area.id || `new-${index}`} className="rounded-xl border border-default p-3 space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <AppInput label="Area name" value={area.name} onChange={(e) => set("delivery_areas", (draft.delivery_areas as DeliveryAreaDraft[]).map((item, i) => i === index ? { ...item, name: e.target.value } : item))} />
                  <AppInput label="State (optional)" placeholder="e.g. Lagos" value={area.state} onChange={(e) => set("delivery_areas", (draft.delivery_areas as DeliveryAreaDraft[]).map((item, i) => i === index ? { ...item, state: e.target.value } : item))} />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <AppInput label={`Delivery fee (${sf.currency})`} value={area.fee} onChange={(e) => set("delivery_areas", (draft.delivery_areas as DeliveryAreaDraft[]).map((item, i) => i === index ? { ...item, fee: e.target.value } : item))} />
                  <AppInput label="Estimated delivery time" placeholder="e.g. 1–2 days" value={area.estimate_text} onChange={(e) => set("delivery_areas", (draft.delivery_areas as DeliveryAreaDraft[]).map((item, i) => i === index ? { ...item, estimate_text: e.target.value } : item))} />
                </div>
                {outlets.length > 0 && (
                  <AppSelect
                    label="Fulfilling outlet (optional)"
                    placeholder="Default storefront outlet"
                    options={outlets.filter((o) => o.is_active).map((o) => ({ key: String(o.id), label: o.name }))}
                    selectedKey={area.outlet_id || undefined}
                    onSelectionChange={(k) => set("delivery_areas", (draft.delivery_areas as DeliveryAreaDraft[]).map((item, i) => i === index ? { ...item, outlet_id: k } : item))}
                  />
                )}
                <AppInput label="Delivery note" value={area.description} onChange={(e) => set("delivery_areas", (draft.delivery_areas as DeliveryAreaDraft[]).map((item, i) => i === index ? { ...item, description: e.target.value } : item))} />
                <AppButton size="sm" variant="tertiary" label="Remove area" onPress={() => set("delivery_areas", (draft.delivery_areas as DeliveryAreaDraft[]).filter((_, i) => i !== index))} />
              </div>
            ))}
            <AppButton size="sm" variant="secondary" label="Add delivery area" onPress={() => set("delivery_areas", [...(draft.delivery_areas as DeliveryAreaDraft[] ?? []), { id: 0, name: "", fee: "0", description: "", state: "", estimate_text: "", outlet_id: "" }])} />
          </div>
          {outlets.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-default">
              <p className="text-xs font-semibold">Pickup points</p>
              <p className="text-xs text-muted">Choose which active outlets shoppers can pick up orders from (stock is held at the selected outlet).</p>
              {outlets.filter((o) => o.is_active).map((outlet) => (
                <div key={outlet.id} className="rounded-xl border border-default p-3 space-y-2">
                  <AppSwitch
                    label={outlet.name}
                    description={outlet.address || "No street address saved on outlet"}
                    isSelected={Boolean(outlet.is_pickup_point)}
                    onChange={(checked) => void togglePickupPoint(outlet, checked)}
                  />
                  {outlet.is_pickup_point ? (
                    <AppInput
                      label="Pickup instructions"
                      placeholder="e.g. Call on arrival at gate"
                      defaultValue={outlet.pickup_note ?? ""}
                      onBlur={(e) => {
                        if (e.target.value !== (outlet.pickup_note ?? "")) {
                          void togglePickupPoint(outlet, true, e.target.value);
                        }
                      }}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          )}
          <AppInput label={`Free delivery on orders over (${sf.currency})`} value={String(draft.free_delivery_threshold ?? "")} onChange={(e) => set("free_delivery_threshold", e.target.value)} placeholder="Leave blank to turn off" />
          <AppTextarea label="Delivery guidance" value={String(draft.delivery_guidance ?? "")} onChange={(e) => set("delivery_guidance", e.target.value)} />
        </>}
        {active === "payments" && (
          <PaymentsForm
            workspaceId={workspaceId}
            draft={draft}
            set={set}
            paymentSettings={paySettings}
            refetchPayments={() => void paymentSettingsQuery.refetch()}
          />
        )}
        {active === "shoppers" && <>{field("tagline", "Short headline") }<AppTextarea label="Store description" value={String(draft.description ?? "")} onChange={(e) => set("description", e.target.value)} /><AppInput label="Logo image URL" value={String(draft.logo_url??"")} onChange={(e)=>set("logo_url",e.target.value)} /><label className="block space-y-2 text-sm font-medium">Upload logo<input className="block w-full text-sm" type="file" accept="image/*" onChange={(e)=>{const file=e.target.files?.[0];if(file)void uploadProductImage(workspaceId,file).then((url)=>set("logo_url",url));}} /></label><AppInput label="Banner image URL" value={String(draft.banner_url??"")} onChange={(e)=>set("banner_url",e.target.value)} /><label className="block space-y-2 text-sm font-medium">Upload banner<input className="block w-full text-sm" type="file" accept="image/*" onChange={(e)=>{const file=e.target.files?.[0];if(file)void uploadProductImage(workspaceId,file).then((url)=>set("banner_url",url));}} /></label><AppSwitch label="Show new products automatically" isSelected={Boolean(draft.auto_show_new_products)} onChange={(v) => set("auto_show_new_products", v)} /><AppSwitch label="Show sold-out products" isSelected={Boolean(draft.show_sold_out)} onChange={(v) => set("show_sold_out", v)} /><AppSwitch label="Show available stock count" isSelected={Boolean(draft.show_stock_count)} onChange={(v) => set("show_stock_count", v)} /><AppInput label="Show low-stock notice at" type="number" min="0" value={String(draft.low_stock_threshold ?? 0)} onChange={(e) => set("low_stock_threshold", Number(e.target.value))} /></>}
        {active === "policies" && <><div className="flex flex-wrap gap-2">{[{key:"return_policy",label:"Returns template",text:"<h2>Returns</h2><p>Contact us within 7 days of delivery to discuss a return. Items must be unused and in their original condition.</p>"},{key:"privacy_policy",label:"Privacy template",text:"<h2>Your privacy</h2><p>We use your contact and delivery details only to process and support your order.</p>"},{key:"terms_policy",label:"Terms template",text:"<h2>Terms of sale</h2><p>Orders are confirmed after we review item availability and delivery details.</p>"}].map((t)=><AppButton key={t.key} size="sm" variant="secondary" label={t.label} onPress={()=>set(t.key,t.text)} />)}</div>{(["return_policy","privacy_policy","terms_policy","custom_policy"] as const).map((k)=><RichTextEditor key={k} label={k.replace("_", " ").replace("_", " ")} value={String(draft[k]??"")} onChange={(v)=>set(k,v)} />)}</>}
        {active === "sharing" && <>{field("seo_title", "Link title")}{field("seo_description", "Link description")}<AppInput label="Preview image URL" value={String(draft.seo_image_url??"")} onChange={(e)=>set("seo_image_url",e.target.value)} /><AppSwitch label="Allow search engines to find the store" isSelected={Boolean(draft.seo_indexable)} onChange={(v)=>set("seo_indexable",v)} /><div className="rounded-2xl border border-default p-4"><p className="text-xs text-muted">WhatsApp link preview</p><div className="mt-2 aspect-[1.91/1] rounded-lg bg-default" style={draft.seo_image_url ? {backgroundImage:`url(${String(draft.seo_image_url)})`,backgroundSize:"cover",backgroundPosition:"center"}:undefined} /><p className="mt-2 font-semibold">{String(draft.seo_title||sf.name)}</p><p className="text-sm text-muted">{String(draft.seo_description||sf.settings.description||"Shop our latest collection")}</p><p className="text-xs text-muted">https://{sf.subdomain_host}</p></div></>}
      </div>
    </SideSheet>
  </Page>;
}

export function StorefrontSettingsPage() { return <WorkspaceGate businessOnly>{(ws) => <SettingsContent {...ws} />}</WorkspaceGate>; }
