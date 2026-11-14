"use client";

// Add or edit a product, in three steps:
// 1. Basics: type, name, unit, prices, SKU   2. Store details   3. Stock and where it is sold
// A live preview sits on the right. Editing can jump to any step and save from any step.

import { ArrowLeft, ArrowRight, Barcode, ImageSquare, Info } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppSelect } from "@/components/ui/app-select";
import { FormGrid, FormPage, FormSection, StepNav } from "@/components/ui/form-kit";
import { MoneyInput } from "@/components/ui/money-input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  CollectionPicker,
  ImageUploader,
  OutletPicker,
  ProductTypePicker,
  productTypeLabel,
  toMinor,
  UnitPicker,
  unitLabel,
} from "@/components/pickers";
import { useFinanceAction, WorkspaceGate, type WorkspaceInfo } from "@/components/features/finance/shared";
import { formatMinorAmount } from "@/lib/money";
import { productKeys, productsApi } from "@/lib/products";
import type { ProductDetail, ProductKind, SaveProductPayload } from "@/types/products";

const STEPS = [
  { label: "Basics", description: "Type, name and price" },
  { label: "Store details", description: "Images and descriptions" },
  { label: "Stock & availability", description: "Outlets and collections" },
];

const EXPONENT = 2;

interface FormState {
  kind: ProductKind;
  name: string;
  unit: string;
  status: "active" | "draft";
  price: string;
  cost: string;
  compareAt: string;
  sku: string;
  barcode: string;
  outletIds: number[];
  collectionIds: number[];
  openingStock: string;
  images: string[];
  shortDescription: string;
  longDescription: string;
}

type Errors = Partial<Record<"name" | "price" | "compareAt" | "openingStock" | "shortDescription", string>>;

function minorToMajor(minor?: string | null, exponent = EXPONENT): string {
  if (!minor || minor === "0") return "";
  const value = BigInt(minor);
  const base = BigInt(10 ** exponent);
  const fraction = (value % base).toString().padStart(exponent, "0");
  return `${value / base}.${fraction}`.replace(/\.00$/, "");
}

function fromDetail(detail?: ProductDetail): FormState {
  const product = detail?.product;
  return {
    kind: product?.kind ?? "non_stock",
    name: product?.name ?? "",
    unit: product?.unit_name ?? "pc",
    status: product?.status === "draft" ? "draft" : "active",
    price: minorToMajor(product?.selling_price_minor, product?.currency_exponent),
    cost: minorToMajor(product?.cost_price_minor, product?.currency_exponent),
    compareAt: minorToMajor(product?.compare_at_price_minor, product?.currency_exponent),
    sku: product?.sku ?? "",
    barcode: product?.barcode ?? "",
    outletIds: detail?.outlet_ids ?? [],
    collectionIds: detail?.collection_ids ?? [],
    openingStock: "",
    images: product?.image_urls ?? [],
    shortDescription: product?.short_description ?? "",
    longDescription: product?.long_description ?? "",
  };
}

function ProductPreview({ form, currency }: { form: FormState; currency: string }) {
  const show = (minor: bigint) => formatMinorAmount(minor.toString(), currency, EXPONENT);
  const price = toMinor(form.price);
  const cost = toMinor(form.cost);
  const compare = toMinor(form.compareAt);
  const profit = price - cost;
  const margin = price > BigInt(0) ? Number((profit * BigInt(1000)) / price) / 10 : 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="relative aspect-[4/5] max-h-64 w-full bg-surface-secondary">
        {form.images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={form.images[0]} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-muted">
            <ImageSquare size={36} aria-hidden="true" />
          </div>
        )}
        <span className="absolute top-3 left-3 rounded-full bg-surface/90 px-2.5 py-1 text-[11px] font-semibold backdrop-blur">{productTypeLabel(form.kind)}</span>
        {form.status === "draft" ? <span className="absolute top-3 right-3 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-[#2a1600]">Draft</span> : null}
      </div>
      <div className="space-y-3 p-4">
        <div>
          <p className="truncate text-[15px] font-semibold">{form.name || "Product name"}</p>
          {form.shortDescription ? <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{form.shortDescription}</p> : null}
        </div>
        <p className="flex items-baseline gap-2">
          <span key={form.price} className="animate-fade-up text-[22px] font-bold tabular">{show(price)}</span>
          {compare > price ? <span className="text-[13px] text-muted line-through tabular">{show(compare)}</span> : null}
          <span className="text-[12px] text-muted">/ {unitLabel(form.unit).replace(/ \(.*\)/, "").toLowerCase()}</span>
        </p>
        <div className="rounded-xl bg-surface-secondary px-3 py-2.5 text-[12px]">
          {cost > BigInt(0) && price > BigInt(0) ? (
            <p className="flex items-center justify-between">
              <span className="text-muted">Profit per {unitLabel(form.unit).replace(/ \(.*\)/, "").toLowerCase()}</span>
              <span className={`font-semibold tabular ${profit < BigInt(0) ? "text-danger" : "text-primary"}`}>
                {show(profit)} · {margin.toFixed(1)}%
              </span>
            </p>
          ) : (
            <p className="text-muted">Add a cost price to see your profit.</p>
          )}
        </div>
        <p className="flex items-center gap-1.5 text-[12px] text-muted">
          <Barcode size={14} aria-hidden="true" />
          {form.sku || "SKU is created automatically"}
        </p>
      </div>
    </section>
  );
}

function ProductForm({ workspaceId, currency, detail }: WorkspaceInfo & { detail?: ProductDetail }) {
  const router = useRouter();
  const isEdit = Boolean(detail);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(() => fromDetail(detail));
  const [errors, setErrors] = useState<Errors>({});
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (key in errors) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const show = (minor: bigint) => formatMinorAmount(minor.toString(), currency, EXPONENT);
  const price = toMinor(form.price);
  const cost = toMinor(form.cost);

  const validateStep = (which: number): Errors => {
    const next: Errors = {};
    if (which === 1) {
      if (!form.name.trim()) next.name = "Name this product";
      if (price <= BigInt(0)) next.price = "Enter a selling price";
      if (form.compareAt && toMinor(form.compareAt) <= price) next.compareAt = "Make it higher than the selling price, or leave it empty";
    }
    if (which === 3 && !isEdit && form.kind === "stock_tracked" && form.openingStock) {
      if (!/^\d+(\.\d{1,4})?$/.test(form.openingStock)) next.openingStock = "Enter a number";
      else if (Number(form.openingStock) > 0 && cost <= BigInt(0)) next.openingStock = "Add a cost price in Basics so this stock can be valued";
    }
    if (which === 2 && form.shortDescription.length > 300) next.shortDescription = "Keep this under 300 characters";
    return next;
  };

  const payload = (status: "active" | "draft"): SaveProductPayload => ({
    name: form.name.trim(),
    kind: form.kind,
    status,
    unit_name: form.unit,
    selling_price: form.price,
    cost_price: form.cost || undefined,
    compare_at_price: form.compareAt || undefined,
    sku: form.sku.trim() || undefined,
    barcode: form.barcode.trim() || undefined,
    currency,
    outlet_ids: form.outletIds,
    collection_ids: form.collectionIds,
    opening_stock: !isEdit && form.kind === "stock_tracked" ? form.openingStock || undefined : undefined,
    image_urls: form.images,
    short_description: form.shortDescription.trim() || undefined,
    long_description: form.longDescription.trim() || undefined,
  });

  const save = useFinanceAction(
    workspaceId,
    (status: "active" | "draft", key: string) =>
      detail ? productsApi.update(workspaceId, detail.product.id, payload(status)) : productsApi.create(workspaceId, payload(status), key),
    {
      success: isEdit ? "Product updated" : "Product added",
      onDone: (data) => router.push(`/products/${(data as ProductDetail).product.id}`),
    },
  );

  const goTo = (target: number) => {
    if (target > step) {
      for (let s = step; s < target; s++) {
        const found = validateStep(s);
        if (Object.keys(found).length) {
          setErrors(found);
          setStep(s);
          return;
        }
      }
    }
    setErrors({});
    setStep(target);
    if (typeof window !== "undefined") document.querySelector("main")?.parentElement?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = (status: "active" | "draft") => {
    for (const s of [1, 2, 3]) {
      const found = validateStep(s);
      if (Object.keys(found).length) {
        setErrors(found);
        setStep(s);
        return;
      }
    }
    save.mutate(status);
  };

  const profitHint =
    cost > BigInt(0) && price > BigInt(0)
      ? `Profit ${show(price - cost)} per sale`
      : "Profit can't be worked out without a cost price";

  return (
    <FormPage
      title={isEdit ? `Edit ${detail?.product.name}` : "Add a product"}
      description={isEdit ? "Changes to the price are kept in its price history." : "Only the basics are required. You can add the rest later."}
      back={isEdit && detail ? { href: `/products/${detail.product.id}`, label: detail.product.name } : { href: "/products", label: "Products" }}
      aside={<ProductPreview form={form} currency={currency} />}
      actions={
        <>
          {step > 1 ? (
            <AppButton variant="ghost" startContent={<ArrowLeft size={16} />} label="Back" onPress={() => goTo(step - 1)} className="mr-auto" />
          ) : (
            <Link
              href={isEdit && detail ? `/products/${detail.product.id}` : "/products"}
              className="mr-auto inline-flex h-10 items-center rounded-full px-5 text-[14px] font-medium text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
            >
              Cancel
            </Link>
          )}
          {!isEdit || detail?.product.status === "draft" ? (
            <AppButton variant="secondary" label="Save as draft" isDisabled={save.isPending} onPress={() => submit("draft")} />
          ) : null}
          {step < STEPS.length && !isEdit ? (
            <AppButton endContent={<ArrowRight size={16} />} label="Next" onPress={() => goTo(step + 1)} />
          ) : null}
          {step === STEPS.length || isEdit ? (
            <AppButton label={isEdit ? "Save changes" : "Add product"} isLoading={save.isPending} onPress={() => submit("active")} className="min-w-32" />
          ) : null}
        </>
      }
    >
      <StepNav steps={STEPS} current={step} onStep={goTo} canJump={isEdit} />

      {step === 1 ? (
        <div className="animate-fade-up space-y-4">
          <FormSection title="What are you selling?" description="This decides how it is counted and sold.">
            <ProductTypePicker value={form.kind} onChange={(kind) => set("kind", kind)} label="" />
          </FormSection>

          <FormSection title="Name and price">
            <AppInput label="Product name" isRequired placeholder="e.g. Ankara shirt" value={form.name} onChange={(event) => set("name", event.target.value)} errorMessage={errors.name} />
            <FormGrid>
              <UnitPicker value={form.unit} onChange={(unit) => set("unit", unit)} kind={form.kind} />
              <AppSelect
                label="Status"
                options={[
                  { key: "active", label: "Active", description: "Ready to sell" },
                  { key: "draft", label: "Draft", description: "Hidden until you are ready" },
                ]}
                selectedKey={form.status}
                onSelectionChange={(key) => set("status", key as "active" | "draft")}
              />
            </FormGrid>
            <FormGrid>
              <MoneyInput label="Selling price" isRequired currency={currency} exponent={EXPONENT} placeholder="0.00" value={form.price} onValueChange={(value) => set("price", value)} errorMessage={errors.price} />
              <MoneyInput label="Cost price" currency={currency} exponent={EXPONENT} placeholder="0.00" value={form.cost} onValueChange={(value) => set("cost", value)} description={profitHint} />
            </FormGrid>
            <MoneyInput
              label="Compare-at price"
              currency={currency}
              exponent={EXPONENT}
              placeholder="Optional"
              value={form.compareAt}
              onValueChange={(value) => set("compareAt", value)}
              errorMessage={errors.compareAt}
              description="Shown crossed out next to your price, to show a saving."
            />
          </FormSection>

          <FormSection title="Codes" description="Used to find the product quickly and to scan it at the till." collapsible defaultOpen={isEdit}>
            <FormGrid>
              <AppInput label="SKU" placeholder="Leave blank to create one" value={form.sku} onChange={(event) => set("sku", event.target.value.toUpperCase())} description="We create a code like ANKSHI-0012 if you leave this empty." />
              <AppInput label="Barcode" placeholder="Optional" value={form.barcode} onChange={(event) => set("barcode", event.target.value)} startContent={<Barcode />} />
            </FormGrid>
          </FormSection>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="animate-fade-up space-y-4">
          <FormSection title="Images" description="Shown on your online store and on shared links.">
            <ImageUploader workspaceId={workspaceId} value={form.images} onChange={(urls) => set("images", urls)} />
          </FormSection>
          <FormSection title="Descriptions" description="For your public store. Both are optional.">
            <AppInput
              label="Short description"
              placeholder="One line shoppers see first"
              value={form.shortDescription}
              onChange={(event) => set("shortDescription", event.target.value)}
              errorMessage={errors.shortDescription}
              description={`${form.shortDescription.length} / 300`}
            />
            <RichTextEditor
              label="Long description"
              placeholder="Materials, sizes, care, what is included…"
              value={form.longDescription}
              onChange={(html) => set("longDescription", html)}
            />
          </FormSection>
        </div>
      ) : null}
      {step === 3 ? (
        <div className="animate-fade-up space-y-4">
          <FormSection title="Where it is sold">
            <OutletPicker workspaceId={workspaceId} value={form.outletIds} onChange={(ids) => set("outletIds", ids)} label="" />
          </FormSection>

          {form.kind === "stock_tracked" ? (
            <FormSection title="Stock" description="How many you have right now.">
              {isEdit ? (
                <div className="flex items-start gap-3 rounded-xl bg-surface-secondary p-3.5 text-[13px]">
                  <Info size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
                  <p>
                    You have <span className="font-semibold tabular">{Number(detail?.product.quantity_on_hand ?? 0)}</span> {unitLabel(form.unit).toLowerCase()} in stock. To change stock, use a stock count or adjustment in{" "}
                    <Link href="/inventory" className="font-semibold text-primary hover:underline">
                      Inventory
                    </Link>
                    , so every change is recorded.
                  </p>
                </div>
              ) : (
                <AppInput
                  label="Opening stock"
                  inputMode="decimal"
                  placeholder="0"
                  value={form.openingStock}
                  onChange={(event) => set("openingStock", event.target.value.replace(/[^\d.]/g, ""))}
                  errorMessage={errors.openingStock}
                  endContent={<span className="text-[13px] text-muted">{unitLabel(form.unit).replace(/ \(.*\)/, "").toLowerCase()}</span>}
                  description={form.outletIds.length ? "Recorded in the first outlet you chose." : "Recorded in your main outlet."}
                />
              )}
            </FormSection>
          ) : null}

          <FormSection title="Collections">
            <CollectionPicker workspaceId={workspaceId} value={form.collectionIds} onChange={(ids) => set("collectionIds", ids)} label="" />
          </FormSection>
        </div>
      ) : null}

    </FormPage>
  );
}

function EditLoader({ workspaceId, currency, isBusiness, productId }: WorkspaceInfo & { productId: number }) {
  const detail = useQuery({ queryKey: productKeys.detail(workspaceId, productId), queryFn: () => productsApi.get(workspaceId, productId) });
  if (detail.isPending) {
    return <div className="mx-auto h-96 w-full max-w-[1120px] animate-pulse rounded-2xl bg-default" />;
  }
  if (detail.isError || !detail.data) {
    return <Alert status="error" description="This product could not be loaded. It may have been removed." />;
  }
  return <ProductForm key={detail.data.product.updated_at} workspaceId={workspaceId} currency={currency} isBusiness={isBusiness} detail={detail.data} />;
}

export function ProductFormPage({ productId }: { productId?: number }) {
  return (
    <WorkspaceGate businessOnly>
      {(workspace) => (productId ? <EditLoader {...workspace} productId={productId} /> : <ProductForm {...workspace} />)}
    </WorkspaceGate>
  );
}
