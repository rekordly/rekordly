// Products area. Money is minor units as strings; never parse it into floats for maths.

export type ProductKind = "service" | "non_stock" | "stock_tracked";
export type ProductStatus = "draft" | "active" | "archived";

export interface Product {
  id: number;
  name: string;
  description?: string | null;
  kind: ProductKind;
  status: ProductStatus;
  unit_name: string;
  short_description?: string | null;
  long_description?: string | null;
  image_urls: string[];
  default_variant_id: number;
  sku?: string | null;
  barcode?: string | null;
  selling_price_minor: string;
  cost_price_minor: string;
  compare_at_price_minor?: string | null;
  currency: string;
  currency_exponent: number;
  /** Decimal text, e.g. "12.0000". */
  quantity_on_hand: string;
  variant_count: number;
  collection_ids?: number[];
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductStockLine {
  location_id: number;
  location_name: string;
  quantity_on_hand: string;
  value_on_hand_minor: string;
}

export interface ProductDetail {
  product: Product;
  options: ProductOption[];
  variants: ProductVariant[];
  variant_stock: { variant_id: number; location_id: number; location_name: string; quantity_on_hand: string }[];
  outlet_ids: number[];
  collection_ids: number[];
  collections?: Array<{ id: number; name: string }>;
  outlets?: Array<{ id: number; name: string }>;
  stock: ProductStockLine[];
}

export interface ProductOptionValue { id: number; value: string }
export interface ProductOption { id: number; name: string; position: number; values: string[]; value_details: ProductOptionValue[] }
export interface ProductVariant {
  id: number; name: string; sku?: string | null; barcode?: string | null;
  selling_price_minor: string; cost_price_minor: string; compare_at_price_minor?: string | null;
  is_default: boolean; is_active: boolean; option_values?: Record<string, string>;
  archived_at?: string | null;
  quantity_on_hand: string;
}

export interface SaveOptionsPayload {
  options: { id?: number; name: string; values: { id?: number; value: string }[] }[];
  variants: { id?: number; option_values: string[]; selling_price: string; cost_price?: string;
    compare_at_price?: string; sku?: string; barcode?: string; is_active: boolean }[];
}

/** Shared by create, edit and import. Prices are major-unit decimal strings. */
export interface SaveProductPayload {
  name: string;
  kind: ProductKind;
  status?: "draft" | "active";
  unit_name?: string;
  short_description?: string;
  long_description?: string;
  image_urls?: string[];
  sku?: string;
  barcode?: string;
  selling_price: string;
  cost_price?: string;
  compare_at_price?: string;
  currency: string;
  outlet_ids?: number[];
  collection_ids?: number[];
  opening_stock?: string;
  opening_unit_cost?: string;
  opening_outlet_id?: number;
  options?: SaveOptionsPayload["options"];
  variants?: Array<SaveOptionsPayload["variants"][number] & {
    opening_stock?: string;
    opening_unit_cost?: string;
    outlet_id?: number;
  }>;
}

export interface ProductCollection {
  id: number;
  name: string;
  description?: string | null;
  product_count: number;
}

export interface ProductPriceChange {
  id: number;
  variant_id: number;
  old_selling_price_minor?: string | null;
  new_selling_price_minor: string;
  old_cost_price_minor?: string | null;
  new_cost_price_minor: string;
  currency: string;
  currency_exponent: number;
  changed_at: string;
}

export interface ProductEvent {
  id: number;
  event_type: "created" | "updated" | "price_changed" | "archived" | "restored" | "imported" | "stock_opened";
  summary: string;
  created_at: string;
}

export interface ProductImportError {
  row: number;
  name: string;
  message: string;
}

export interface ProductImportBatch {
  id: number;
  file_name: string;
  total_rows: number;
  created_count: number;
  failed_count: number;
  errors: ProductImportError[];
  created_at: string;
}

export interface ImageUploadAuthorization {
  provider: string;
  upload_url: string;
  api_key: string;
  timestamp: string;
  signature: string;
  folder: string;
  public_id: string;
  type: string;
  resource_type: string;
  max_bytes: string;
  expires_at: string;
}

export interface ProductStockMovement {
  id: number;
  variant_id?: number;
  variant_name?: string;
  kind: string;
  source_type: string;
  source_id?: number;
  /** Plain words, e.g. "Sold", "Bought", "Damaged". */
  summary: string;
  party?: string;
  reference?: string;
  location_id?: number;
  location_name: string;
  /** Signed decimal text: "-3" or "12.5". */
  quantity_delta: string;
  value_delta_minor: string;
  occurred_on: string;
  created_at: string;
}

export type StockAddReason = "restock" | "found" | "correction";
export type StockRemoveReason = "damage" | "lost" | "expired" | "internal_use" | "correction" | "other";

export interface ProductStockChange {
  variant_id?: number;
  direction: "add" | "remove";
  quantity: string;
  reason: StockAddReason | StockRemoveReason;
  unit_cost?: string;
  outlet_id?: number;
  note?: string;
}
