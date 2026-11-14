"use client";

// Put a product into collections ("Shoes", "New arrivals"), with a new collection
// added in place. Collections belong to products; the online store reuses them.
//
//   <CollectionPicker workspaceId value={ids} onChange={setIds} />

import { Plus } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ChipMultiSelect } from "@/components/ui/form-kit";
import { productKeys, productsApi } from "@/lib/products";

export function useProductCollections(workspaceId: number) {
  return useQuery({ queryKey: productKeys.collections(workspaceId), queryFn: () => productsApi.collections(workspaceId) });
}

export function CollectionPicker({
  workspaceId,
  value,
  onChange,
  label = "Collections",
  description = "Group products so they are easy to find and show together on your store.",
}: {
  workspaceId: number;
  value: number[];
  onChange: (ids: number[]) => void;
  label?: string;
  description?: string;
}) {
  const queryClient = useQueryClient();
  const collections = useProductCollections(workspaceId);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim()) return setError("Name the collection");
    setSaving(true);
    try {
      const created = await productsApi.createCollection(workspaceId, { name: name.trim() });
      await queryClient.invalidateQueries({ queryKey: productKeys.collections(workspaceId) });
      onChange([...value, created.id]);
      setName("");
      setAdding(false);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the collection");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <ChipMultiSelect
        label={label}
        description={description}
        options={(collections.data ?? []).map((collection) => ({ key: String(collection.id), label: collection.name }))}
        value={value.map(String)}
        onChange={(keys) => onChange(keys.map(Number))}
        trailing={
          adding ? null : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-primary/50 px-3.5 text-[13px] font-semibold text-primary transition-colors hover:bg-primary-soft"
            >
              <Plus size={13} weight="bold" aria-hidden="true" />
              New collection
            </button>
          )
        }
      />
      {adding ? (
        <div className="animate-fade-up flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <input
              autoFocus
              aria-label="Collection name"
              placeholder="e.g. New arrivals"
              value={name}
              data-invalid={error ? true : undefined}
              onChange={(event) => {
                setName(event.target.value);
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void create();
                }
                if (event.key === "Escape") setAdding(false);
              }}
              className="field-shell h-10 w-full px-3.5 text-[14px] placeholder:text-field-placeholder"
            />
            {error ? <p className="animate-fade-up mt-1 text-[12px] font-medium text-danger">{error}</p> : null}
          </div>
          <button type="button" onClick={() => void create()} disabled={saving} className="h-10 cursor-pointer rounded-full bg-primary px-4 text-[13px] font-semibold text-white disabled:opacity-60">
            {saving ? "Adding…" : "Add"}
          </button>
          <button type="button" onClick={() => setAdding(false)} className="h-10 cursor-pointer rounded-full px-3 text-[13px] font-medium text-muted hover:text-foreground">
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
