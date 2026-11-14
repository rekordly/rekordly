"use client";

// The Collections tab: create, rename and remove product collections.

import { FolderSimple, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppTextarea } from "@/components/ui/app-textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState } from "@/components/ui/page";
import { useProductCollections } from "@/components/pickers";
import { productKeys, productsApi } from "@/lib/products";
import type { ProductCollection } from "@/types/products";

export function ProductCollections({ workspaceId, onView }: { workspaceId: number; onView: (collection: ProductCollection) => void }) {
  const queryClient = useQueryClient();
  const collections = useProductCollections(workspaceId);
  const [editing, setEditing] = useState<ProductCollection | "new" | null>(null);
  const [deleting, setDeleting] = useState<ProductCollection | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const open = (target: ProductCollection | "new") => {
    setEditing(target);
    setName(target === "new" ? "" : target.name);
    setDescription(target === "new" ? "" : target.description ?? "");
    setError("");
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: productKeys.all(workspaceId) });

  const save = async () => {
    if (!name.trim()) return setError("Name the collection");
    setBusy(true);
    try {
      const body = { name: name.trim(), description: description.trim() || undefined };
      if (editing === "new") await productsApi.createCollection(workspaceId, body);
      else if (editing) await productsApi.updateCollection(workspaceId, editing.id, body);
      await refresh();
      setEditing(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the collection");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    await productsApi.deleteCollection(workspaceId, deleting.id);
    await refresh();
    setDeleting(null);
  };

  const list = collections.data ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted">Group products like “Shoes” or “New arrivals”. A product can be in more than one.</p>
        <AppButton size="sm" startContent={<Plus weight="bold" />} label="New collection" onPress={() => open("new")} />
      </div>

      {collections.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-28 animate-pulse rounded-2xl bg-default" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState
            icon={FolderSimple}
            title="No collections yet"
            description="Create one, then add products to it from the product form."
            action={<AppButton startContent={<Plus weight="bold" />} label="New collection" onPress={() => open("new")} />}
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((collection) => (
            <article key={collection.id} className="animate-fade-up flex flex-col justify-between rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                    <FolderSimple size={18} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold">{collection.name}</span>
                    <span className="block text-[12px] text-muted">
                      {collection.product_count} product{collection.product_count === 1 ? "" : "s"}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <button type="button" aria-label={`Rename ${collection.name}`} onClick={() => open(collection)} className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted hover:bg-surface-secondary hover:text-foreground">
                    <PencilSimple size={15} aria-hidden="true" />
                  </button>
                  <button type="button" aria-label={`Delete ${collection.name}`} onClick={() => setDeleting(collection)} className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger">
                    <Trash size={15} aria-hidden="true" />
                  </button>
                </span>
              </div>
              {collection.description ? <p className="mt-3 line-clamp-2 text-[12px] text-muted">{collection.description}</p> : null}
              <button type="button" onClick={() => onView(collection)} className="mt-4 w-fit cursor-pointer text-[13px] font-semibold text-primary hover:underline">
                View products
              </button>
            </article>
          ))}
        </div>
      )}

      <FormDrawer
        isOpen={editing !== null}
        onOpenChange={(value) => !value && setEditing(null)}
        title={editing === "new" ? "New collection" : "Rename collection"}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        submitLabel={editing === "new" ? "Create collection" : "Save"}
        isSubmitting={busy}
      >
        <AppInput label="Name" isRequired autoFocus placeholder="e.g. New arrivals" value={name} onChange={(event) => { setName(event.target.value); setError(""); }} errorMessage={error || undefined} />
        <AppTextarea label="Description" placeholder="Optional" value={description} onChange={(event) => setDescription(event.target.value)} />
      </FormDrawer>

      <ConfirmDialog
        isOpen={deleting !== null}
        onOpenChange={(value) => !value && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "collection"}?`}
        description="The products stay; they are only removed from this collection."
        confirmLabel="Delete collection"
        isDanger
        onConfirm={() => void remove()}
      />
    </section>
  );
}
