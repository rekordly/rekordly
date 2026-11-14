// Products API client and query keys.

import type {
  ImageUploadAuthorization,
  Product,
  ProductCollection,
  ProductDetail,
  ProductEvent,
  ProductImportBatch,
  ProductKind,
  ProductPriceChange,
  SaveProductPayload,
} from "@/types/products";

import { apiClient, workspaceHeaders } from "./api.ts";
import { moneyKeys } from "./money.ts";
import { buildQueryString } from "./utils.ts";

export interface ProductFilter {
  search?: string;
  status?: string;
  kind?: ProductKind;
  collection_id?: number;
  limit?: number;
}

const headers = (workspaceId: number, idempotencyKey?: string) => ({
  headers: { ...workspaceHeaders(workspaceId), ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
});

export const productsApi = {
  async list(workspaceId: number, filter: ProductFilter = {}) {
    const query = buildQueryString({ limit: 200, ...filter } as Record<string, string | number | undefined>);
    const result = await apiClient.get<{ products: Product[] }>(`/api/v1/catalogue/products${query}`, headers(workspaceId));
    return result.products ?? [];
  },
  get: (workspaceId: number, id: number) => apiClient.get<ProductDetail>(`/api/v1/catalogue/products/${id}`, headers(workspaceId)),
  create: (workspaceId: number, body: SaveProductPayload, key: string) =>
    apiClient.post<unknown, ProductDetail>("/api/v1/catalogue/products", { ...body, idempotency_key: key }, headers(workspaceId, key)),
  update: (workspaceId: number, id: number, body: SaveProductPayload) =>
    apiClient.patch<unknown, ProductDetail>(`/api/v1/catalogue/products/${id}`, body, headers(workspaceId)),
  archive: (workspaceId: number, id: number) => apiClient.post<unknown, ProductDetail>(`/api/v1/catalogue/products/${id}/archive`, {}, headers(workspaceId)),
  restore: (workspaceId: number, id: number) => apiClient.post<unknown, ProductDetail>(`/api/v1/catalogue/products/${id}/restore`, {}, headers(workspaceId)),
  async priceHistory(workspaceId: number, id: number) {
    const result = await apiClient.get<{ history: ProductPriceChange[] }>(`/api/v1/catalogue/products/${id}/price-history`, headers(workspaceId));
    return result.history ?? [];
  },
  async events(workspaceId: number, id: number) {
    const result = await apiClient.get<{ events: ProductEvent[] }>(`/api/v1/catalogue/products/${id}/events`, headers(workspaceId));
    return result.events ?? [];
  },
  async collections(workspaceId: number) {
    const result = await apiClient.get<{ collections: ProductCollection[] }>("/api/v1/catalogue/collections", headers(workspaceId));
    return result.collections ?? [];
  },
  async createCollection(workspaceId: number, body: { name: string; description?: string }) {
    const result = await apiClient.post<unknown, { collection: ProductCollection }>("/api/v1/catalogue/collections", body, headers(workspaceId));
    return result.collection;
  },
  async updateCollection(workspaceId: number, id: number, body: { name: string; description?: string }) {
    const result = await apiClient.patch<unknown, { collection: ProductCollection }>(`/api/v1/catalogue/collections/${id}`, body, headers(workspaceId));
    return result.collection;
  },
  deleteCollection: (workspaceId: number, id: number) => apiClient.delete(`/api/v1/catalogue/collections/${id}`, headers(workspaceId)),
  async importProducts(workspaceId: number, body: { file_name: string; currency: string; rows: SaveProductPayload[] }) {
    const result = await apiClient.post<unknown, { batch: ProductImportBatch }>("/api/v1/catalogue/products/import", body, headers(workspaceId));
    return result.batch;
  },
  async imports(workspaceId: number) {
    const result = await apiClient.get<{ batches: ProductImportBatch[] }>("/api/v1/catalogue/product-imports", headers(workspaceId));
    return result.batches ?? [];
  },
  async authorizeImage(workspaceId: number, file: { mime_type: string; byte_size: number }) {
    const result = await apiClient.post<unknown, { authorization: ImageUploadAuthorization }>("/api/v1/catalogue/product-images/authorize", file, headers(workspaceId));
    return result.authorization;
  },
};

/** Uploads one image straight to the image host with a server-signed request; returns its public URL. */
export async function uploadProductImage(workspaceId: number, file: File): Promise<string> {
  const auth = await productsApi.authorizeImage(workspaceId, { mime_type: file.type, byte_size: file.size });
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", auth.api_key);
  form.append("timestamp", auth.timestamp);
  form.append("signature", auth.signature);
  form.append("folder", auth.folder);
  form.append("public_id", auth.public_id);
  form.append("type", auth.type);
  const response = await fetch(auth.upload_url, { method: "POST", body: form });
  if (!response.ok) throw new Error("The image could not be uploaded. Try again.");
  const body = (await response.json()) as { secure_url?: string };
  if (!body.secure_url) throw new Error("The image host did not return a link.");
  return body.secure_url;
}

/** Product queries live under the workspace money key so money changes refresh them too. */
export const productKeys = {
  all: (workspaceId: number) => [...moneyKeys.workspace(workspaceId), "products"] as const,
  list: (workspaceId: number, filter: ProductFilter) => [...moneyKeys.workspace(workspaceId), "products", "list", filter] as const,
  detail: (workspaceId: number, id: number) => [...moneyKeys.workspace(workspaceId), "products", "detail", id] as const,
  priceHistory: (workspaceId: number, id: number) => [...moneyKeys.workspace(workspaceId), "products", "price-history", id] as const,
  events: (workspaceId: number, id: number) => [...moneyKeys.workspace(workspaceId), "products", "events", id] as const,
  collections: (workspaceId: number) => [...moneyKeys.workspace(workspaceId), "products", "collections"] as const,
  imports: (workspaceId: number) => [...moneyKeys.workspace(workspaceId), "products", "imports"] as const,
};
