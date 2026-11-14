"use client";

// "What are you selling?" as three cards, the same way everywhere a product is made.
//
//   <ProductTypePicker value={kind} onChange={setKind} />

import { Cube, HandHeart, Package } from "@phosphor-icons/react";

import { ChoiceCards, type Choice } from "@/components/ui/form-kit";
import type { ProductKind } from "@/types/products";

export const PRODUCT_TYPES: Choice<ProductKind>[] = [
  { key: "non_stock", label: "Product", description: "Something you sell, without counting stock", icon: Package },
  { key: "stock_tracked", label: "Product with stock", description: "Count what you have in each outlet", icon: Cube },
  { key: "service", label: "Service", description: "Work or time, like a repair or a session", icon: HandHeart },
];

export function productTypeLabel(kind: ProductKind): string {
  return PRODUCT_TYPES.find((type) => type.key === kind)?.label ?? kind;
}

export function ProductTypePicker({ value, onChange, label = "What are you selling?" }: { value: ProductKind; onChange: (kind: ProductKind) => void; label?: string }) {
  return <ChoiceCards<ProductKind> label={label} options={PRODUCT_TYPES} value={value} onChange={onChange} />;
}
