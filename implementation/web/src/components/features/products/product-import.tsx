"use client";

// Import products from a CSV file, and see past imports.

import { CheckCircle, DownloadSimple, FileCsv, WarningCircle } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { FormDrawer } from "@/components/ui/form-drawer";
import { buildCsv, csvToObjects, downloadCsv } from "@/lib/csv";
import { formatDate } from "@/lib/format";
import { productKeys, productsApi } from "@/lib/products";
import type { ProductImportBatch, ProductKind, SaveProductPayload } from "@/types/products";

const TEMPLATE_HEADER = ["name", "type", "price", "cost_price", "compare_at_price", "unit", "sku", "barcode", "status", "opening_stock", "short_description"];

const KIND_ALIASES: Record<string, ProductKind> = {
  product: "non_stock",
  non_stock: "non_stock",
  "product with stock": "stock_tracked",
  stock: "stock_tracked",
  stock_tracked: "stock_tracked",
  service: "service",
};

function toPayload(row: Record<string, string>, currency: string): SaveProductPayload {
  const status = row.status?.toLowerCase() === "draft" ? "draft" : "active";
  return {
    name: row.name ?? "",
    kind: KIND_ALIASES[(row.type ?? "").toLowerCase()] ?? "non_stock",
    status,
    selling_price: (row.price ?? "").replace(/,/g, ""),
    cost_price: (row.cost_price ?? "").replace(/,/g, "") || undefined,
    compare_at_price: (row.compare_at_price ?? "").replace(/,/g, "") || undefined,
    unit_name: row.unit || undefined,
    sku: row.sku || undefined,
    barcode: row.barcode || undefined,
    opening_stock: row.opening_stock || undefined,
    short_description: row.short_description || undefined,
    currency,
  };
}

export function downloadProductTemplate() {
  downloadCsv(
    "rekordly-products-template.csv",
    buildCsv(TEMPLATE_HEADER, [
      ["Ankara shirt", "product", "15000", "9000", "18000", "pc", "", "", "active", "", "Cotton, size M"],
      ["Rice 50kg", "product with stock", "62000", "55000", "", "bag", "", "", "active", "20", ""],
      ["Logo design", "service", "40000", "", "", "job", "", "", "active", "", ""],
    ]),
  );
}

function BatchResult({ batch }: { batch: ProductImportBatch }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-xl bg-surface-secondary p-3.5">
        {batch.failed_count === 0 ? (
          <CheckCircle size={22} weight="fill" className="shrink-0 text-primary" aria-hidden="true" />
        ) : (
          <WarningCircle size={22} weight="fill" className="shrink-0 text-secondary" aria-hidden="true" />
        )}
        <p className="text-[13px]">
          <span className="font-semibold">{batch.created_count}</span> of {batch.total_rows} products added
          {batch.failed_count ? (
            <>
              , <span className="font-semibold text-danger">{batch.failed_count}</span> need fixing
            </>
          ) : null}
          .
        </p>
      </div>
      {batch.errors.length ? (
        <ul className="max-h-56 space-y-1.5 overflow-y-auto">
          {batch.errors.map((error) => (
            <li key={`${error.row}-${error.message}`} className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-[12px]">
              <span className="font-semibold">Row {error.row}</span>
              {error.name ? ` · ${error.name}` : ""}: {error.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ProductImportDrawer({
  workspaceId,
  currency,
  isOpen,
  onClose,
}: {
  workspaceId: number;
  currency: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; rows: SaveProductPayload[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProductImportBatch | null>(null);

  const reset = () => {
    setFile(null);
    setError("");
    setResult(null);
    if (input.current) input.current.value = "";
  };

  const read = async (picked?: File) => {
    if (!picked) return;
    setError("");
    setResult(null);
    if (picked.size > 2 * 1024 * 1024) return setError("Use a CSV file under 2 MB.");
    const objects = csvToObjects(await picked.text());
    if (!objects.length) return setError("This file has no rows. Use the template to see the columns.");
    if (!("name" in objects[0]) || !("price" in objects[0])) return setError("The file needs at least a name column and a price column.");
    if (objects.length > 500) return setError("Import up to 500 products at a time.");
    setFile({ name: picked.name, rows: objects.map((row) => toPayload(row, currency)) });
  };

  const run = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const batch = await productsApi.importProducts(workspaceId, { file_name: file.name, currency, rows: file.rows });
      setResult(batch);
      await queryClient.invalidateQueries({ queryKey: productKeys.all(workspaceId) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The import failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDrawer
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onClose();
        }
      }}
      title="Import products"
      description="Add many products at once from a CSV file."
    >
      {result ? (
        <>
          <BatchResult batch={result} />
          <div className="flex gap-2 pt-2">
            <AppButton variant="ghost" label="Import another file" className="flex-1" onPress={reset} />
            <AppButton label="Done" className="flex-1" onPress={() => { reset(); onClose(); }} />
          </div>
        </>
      ) : (
        <>
          <button type="button" onClick={downloadProductTemplate} className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border p-3.5 text-left transition-colors hover:bg-surface-secondary">
            <span className="grid size-9 place-items-center rounded-lg bg-primary-soft text-primary-soft-foreground">
              <DownloadSimple size={18} aria-hidden="true" />
            </span>
            <span>
              <span className="block text-[14px] font-semibold">Download the template</span>
              <span className="block text-[12px] text-muted">Columns: name, type, price, cost price, unit, SKU, stock and more.</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => input.current?.click()}
            data-invalid={error ? true : undefined}
            style={{ borderStyle: "dashed" }}
            className="field-shell flex w-full cursor-pointer flex-col items-center gap-2 px-4 py-8 text-center"
          >
            <FileCsv size={28} className="text-muted" aria-hidden="true" />
            <span className="text-[14px] font-semibold">{file ? file.name : "Choose a CSV file"}</span>
            <span className="text-[12px] text-muted">{file ? `${file.rows.length} products ready to import` : "Up to 500 products, 2 MB"}</span>
          </button>
          <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => void read(event.target.files?.[0])} />
          {error ? <p className="animate-fade-up text-[12px] font-medium text-danger">{error}</p> : null}

          <div className="flex gap-2 pt-2">
            <AppButton variant="ghost" label="Cancel" className="flex-1" onPress={() => { reset(); onClose(); }} />
            <AppButton label={file ? `Import ${file.rows.length} products` : "Import"} className="flex-[2]" isDisabled={!file} isLoading={busy} onPress={() => void run()} />
          </div>
        </>
      )}
    </FormDrawer>
  );
}

export function ProductImportHistoryDrawer({ workspaceId, isOpen, onClose }: { workspaceId: number; isOpen: boolean; onClose: () => void }) {
  const batches = useQuery({ queryKey: productKeys.imports(workspaceId), queryFn: () => productsApi.imports(workspaceId), enabled: isOpen });
  const [open, setOpen] = useState<number | null>(null);

  return (
    <FormDrawer isOpen={isOpen} onOpenChange={(value) => !value && onClose()} title="Import history" description="Every product file you have imported.">
      {batches.isPending ? (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-14 animate-pulse rounded-xl bg-default" />
          ))}
        </div>
      ) : (batches.data ?? []).length === 0 ? (
        <p className="py-8 text-center text-[13px] text-muted">No imports yet.</p>
      ) : (
        <ul className="space-y-2">
          {(batches.data ?? []).map((batch) => (
            <li key={batch.id} className="rounded-xl border border-border">
              <button type="button" onClick={() => setOpen(open === batch.id ? null : batch.id)} className="flex w-full cursor-pointer items-center justify-between gap-3 p-3.5 text-left">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold">{batch.file_name}</span>
                  <span className="block text-[12px] text-muted">{formatDate(batch.created_at)}</span>
                </span>
                <span className="shrink-0 text-right text-[12px]">
                  <span className="block font-semibold text-primary">{batch.created_count} added</span>
                  {batch.failed_count ? <span className="block text-danger">{batch.failed_count} failed</span> : null}
                </span>
              </button>
              {open === batch.id && batch.errors.length ? (
                <div className="animate-fade-up border-t border-separator p-3.5">
                  <BatchResult batch={batch} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </FormDrawer>
  );
}
