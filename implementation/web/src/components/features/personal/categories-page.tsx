"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, ArrowCounterClockwise, Plus, Tag } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader, Segmented, StatusPill } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { financeApi, moneyApi, moneyKeys } from "@/lib/money";
import { personalApi, personalKeys } from "@/lib/personal-finance";
import { categorySchema, type CategoryValues } from "@/lib/schemas/finance.schemas";
import type { PersonalCategoryWithMeta, PersonalTag } from "@/types/personal-finance";

import { SelectField, TextInputField } from "../finance/fields";
import { useFinanceAction, WorkspaceGate, type WorkspaceInfo } from "../finance/shared";

const TABS = [
  { key: "categories", label: "Categories" },
  { key: "tags", label: "Tags" },
] as const;

const DIRECTIONS = [
  { key: "money_out", label: "Expense" },
  { key: "money_in", label: "Income" },
  { key: "both", label: "Both" },
];

function CategoriesContent({ workspaceId, isBusiness }: WorkspaceInfo) {
  const [tab, setTab] = useState<"categories" | "tags">("categories");
  const [catOpen, setCatOpen] = useState(false);
  const [tagName, setTagName] = useState("");
  const [tagOpen, setTagOpen] = useState(false);

  const categories = useQuery({
    queryKey: moneyKeys.categories(workspaceId, "all"),
    queryFn: () => moneyApi.listCategories({ workspaceId }),
  });

  const tags = useQuery({
    queryKey: personalKeys.tags(workspaceId),
    queryFn: () => personalApi.listTags(workspaceId),
    enabled: !isBusiness,
  });

  const form = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: "", direction: "money_out" },
  });

  const createCat = useFinanceAction(
    workspaceId,
    (v: CategoryValues) =>
      financeApi.createCategory(workspaceId, {
        ...v,
        scope: isBusiness ? "business" : "personal",
        account_class: v.direction === "money_in" ? "income" : "expense",
      }),
    {
      success: "Category created",
      onDone: () => {
        setCatOpen(false);
        form.reset();
        categories.refetch();
      },
    },
  );

  const seedDefaults = useFinanceAction(
    workspaceId,
    () => personalApi.seedDefaultCategories(workspaceId),
    {
      success: "Default personal categories added",
      onDone: () => categories.refetch(),
    },
  );

  const toggleArchive = useFinanceAction(
    workspaceId,
    (cat: PersonalCategoryWithMeta) => personalApi.archiveCategory(workspaceId, cat.id, cat.is_active),
    {
      success: "Category updated",
      onDone: () => categories.refetch(),
    },
  );

  const createTag = useFinanceAction(
    workspaceId,
    () => personalApi.createTag(workspaceId, { name: tagName }),
    {
      success: "Tag added",
      onDone: () => {
        setTagOpen(false);
        setTagName("");
        tags.refetch();
      },
    },
  );

  const removeTag = useFinanceAction(
    workspaceId,
    (t: PersonalTag) => personalApi.archiveTag(workspaceId, t.id),
    {
      success: "Tag archived",
      onDone: () => tags.refetch(),
    },
  );

  if (isBusiness) {
    return (
      <Page>
        <PageHeader title="Categories" description="Business categories are managed in Accounts & Categories." />
        <Alert status="info" description="Switch to Personal space to manage Personal categories and tags." />
      </Page>
    );
  }

  const catRows = (categories.data ?? []) as PersonalCategoryWithMeta[];

  return (
    <Page>
      <PageHeader
        title="Categories & Tags"
        description="Renaming or archiving a category never rewrites historical journal effects."
        actions={
          <div className="flex flex-wrap gap-2">
            <AppButton variant="secondary" label="Seed defaults" isLoading={seedDefaults.isPending} onPress={() => seedDefaults.mutate(undefined)} />
            {tab === "categories" ? (
              <AppButton startContent={<Plus weight="bold" />} label="New category" onPress={() => setCatOpen(true)} />
            ) : (
              <AppButton startContent={<Plus weight="bold" />} label="New tag" onPress={() => setTagOpen(true)} />
            )}
          </div>
        }
      />

      <Segmented aria-label="Categories or Tags" options={TABS} value={tab} onChange={setTab} />

      {tab === "categories" ? (
        <DataView
          title="Personal categories"
          rows={catRows}
          rowKey={(r) => r.id}
          isLoading={categories.isPending}
          isError={categories.isError}
          columns={[
            { key: "name", label: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
            { key: "direction", label: "Direction", render: (r) => <span className="text-xs text-muted capitalize">{r.direction.replace(/_/g, " ")}</span> },
            { key: "class", label: "Accounting class", render: (r) => <span className="text-xs text-muted capitalize">{r.account_class}</span> },
            { key: "status", label: "Status", render: (r) => <StatusPill tone={r.is_active ? "success" : "neutral"}>{r.is_active ? "Active" : "Archived"}</StatusPill> },
            {
              key: "actions",
              label: "",
              align: "right",
              render: (r) => (
                <AppButton
                  size="sm"
                  variant="ghost"
                  startContent={r.is_active ? <Archive size={14} /> : <ArrowCounterClockwise size={14} />}
                  label={r.is_active ? "Archive" : "Reactivate"}
                  onPress={() => toggleArchive.mutate(r)}
                />
              ),
            },
          ]}
          renderCard={(r) => (
            <RecordCard
              icon={<Tag size={18} weight="duotone" aria-hidden="true" />}
              reference={r.account_class}
              title={r.name}
              amount={r.direction.replace(/_/g, " ")}
              status={<StatusPill tone={r.is_active ? "success" : "neutral"}>{r.is_active ? "Active" : "Archived"}</StatusPill>}
              actions={
                <AppButton
                  size="sm"
                  variant="ghost"
                  label={r.is_active ? "Archive" : "Reactivate"}
                  onPress={() => toggleArchive.mutate(r)}
                />
              }
            />
          )}
          empty={
            <EmptyState
              icon={Tag}
              title="No categories yet"
              description="Seed default Personal categories or create custom ones."
              action={<AppButton label="Seed defaults" onPress={() => seedDefaults.mutate(undefined)} />}
            />
          }
        />
      ) : (
        <DataView
          title="Personal tags"
          rows={tags.data ?? []}
          rowKey={(r) => r.id}
          isLoading={tags.isPending}
          isError={tags.isError}
          columns={[
            { key: "name", label: "Tag", render: (r) => <span className="font-medium">#{r.name}</span> },
            {
              key: "actions",
              label: "",
              align: "right",
              render: (r) => <AppButton size="sm" variant="ghost" label="Archive" onPress={() => removeTag.mutate(r)} />,
            },
          ]}
          renderCard={(r) => (
            <RecordCard
              icon={<Tag size={18} weight="duotone" aria-hidden="true" />}
              title={`#${r.name}`}
              amount="Tag"
              actions={<AppButton size="sm" variant="ghost" label="Archive" onPress={() => removeTag.mutate(r)} />}
            />
          )}
          empty={
            <EmptyState
              icon={Tag}
              title="No tags yet"
              description="Tags give cross-category context without changing accounting."
              action={<AppButton startContent={<Plus weight="bold" />} label="New tag" onPress={() => setTagOpen(true)} />}
            />
          }
        />
      )}

      <FormDrawer
        isOpen={catOpen}
        onOpenChange={setCatOpen}
        title="New personal category"
        submitLabel="Create category"
        isSubmitting={createCat.isPending}
        onSubmit={form.handleSubmit((v) => createCat.mutate(v))}
      >
        <TextInputField control={form.control} name="name" label="Category name" placeholder="e.g. Groceries" />
        <SelectField control={form.control} name="direction" label="Direction" options={DIRECTIONS} />
      </FormDrawer>

      <FormDrawer
        isOpen={tagOpen}
        onOpenChange={setTagOpen}
        title="New tag"
        submitLabel="Save tag"
        isSubmitting={createTag.isPending}
        onSubmit={(e) => {
          e.preventDefault();
          createTag.mutate(undefined);
        }}
      >
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Tag name</label>
          <input
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
            placeholder="e.g. travel-2026"
            required
          />
        </div>
      </FormDrawer>
    </Page>
  );
}

export function CategoriesPage() {
  return (
    <WorkspaceGate>
      {(info) => <CategoriesContent {...info} />}
    </WorkspaceGate>
  );
}
