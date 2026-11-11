"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowsMerge, PencilSimple, Plus, UserCircle, UsersThree } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { AppButton } from "@/components/ui/app-button";
import { AppRowActions } from "@/components/ui/app-row-actions";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader, Segmented } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { financeApi } from "@/lib/money";
import { contactSchema, type ContactValues } from "@/lib/schemas/finance.schemas";
import type { Contact } from "@/types/finance";

import { NotesField, TextInputField } from "./fields";
import { useContacts, useFinanceAction, WorkspaceGate, type WorkspaceInfo } from "./shared";

type Kind = "customers" | "suppliers";

const KIND_OPTIONS = [
  { key: "customers", label: "Customers" },
  { key: "suppliers", label: "Suppliers" },
] as const;

function ContactsContent({ workspaceId, startOpen }: WorkspaceInfo & { startOpen: boolean }) {
  const [kind, setKind] = useState<Kind>("customers");
  const [isOpen, setIsOpen] = useState(startOpen);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [mergingSource, setMergingSource] = useState<Contact | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  const contacts = useContacts(workspaceId, kind);
  const singular = kind === "customers" ? "customer" : "supplier";

  const form = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: "", email: "", phone: "", notes: "" },
  });
  const close = () => {
    setIsOpen(false);
    setEditing(null);
    form.reset({ name: "", email: "", phone: "", notes: "" });
  };
  const openEdit = (contact: Contact) => {
    setEditing(contact);
    form.reset({
      name: contact.name,
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      notes: contact.notes ?? "",
    });
    setIsOpen(true);
  };
  const save = useFinanceAction(
    workspaceId,
    (values: ContactValues) =>
      editing
        ? financeApi.updateContact(workspaceId, kind, editing.id, { ...values, party_type: editing.party_type || singular })
        : financeApi.createContact(workspaceId, kind, { ...values, party_type: singular }),
    { success: editing ? "Contact updated" : "Contact added", onDone: close },
  );

  const mergeAction = useFinanceAction(
    workspaceId,
    async (_: void) => {
      if (!mergingSource || !mergeTargetId) throw new Error("Choose a primary contact to merge into");
      return financeApi.mergeContacts(workspaceId, mergingSource.id, Number(mergeTargetId));
    },
    {
      success: "Duplicate contact merged cleanly",
      onDone: () => {
        setMergingSource(null);
        setMergeTargetId("");
        contacts.refetch();
      },
    },
  );

  const detailHref = (row: Contact) => `/${kind}/${row.id}`;
  const rowActions = (row: Contact) => (
    <AppRowActions
      ariaLabel="Contact actions"
      items={[
        {
          key: "edit",
          label: "Edit details",
          icon: <PencilSimple size={16} aria-hidden="true" />,
          onClick: () => openEdit(row),
        },
        {
          key: "merge",
          label: "Merge duplicate",
          icon: <ArrowsMerge size={16} aria-hidden="true" />,
          disabled: (contacts.data?.length ?? 0) < 2,
          onClick: () => {
            setMergingSource(row);
            setMergeTargetId("");
          },
        },
      ]}
    />
  );

  return (
    <Page>
      <PageHeader
        title="Contacts"
        description="The customers you sell to and the suppliers you buy from."
        actions={<AppButton startContent={<Plus weight="bold" />} label={`Add ${singular}`} onPress={() => setIsOpen(true)} />}
      />
      <Segmented aria-label="Contact type" options={KIND_OPTIONS} value={kind} onChange={setKind} />
      <DataView<Contact>
        key={kind}
        title={kind === "customers" ? "Customers" : "Suppliers"}
        rows={contacts.data ?? []}
        rowKey={(row) => row.id}
        isLoading={contacts.isPending}
        isError={contacts.isError}
        searchPlaceholder={`Search ${kind}`}
        getSearchText={(row) => `${row.name} ${row.phone ?? ""} ${row.email ?? ""}`}
        empty={
          <EmptyState
            icon={UsersThree}
            title={`No ${kind} yet`}
            description={`Add a ${singular} to link them to your records.`}
            action={<AppButton startContent={<Plus weight="bold" />} label={`Add ${singular}`} onPress={() => setIsOpen(true)} />}
          />
        }
        columns={[
          {
            key: "name",
            label: "Name",
            render: (row) => (
              <Link href={detailHref(row)} className="font-semibold text-primary hover:underline">
                {row.name}
              </Link>
            ),
          },
          { key: "phone", label: "Phone", render: (row) => row.phone || "—" },
          { key: "email", label: "Email", render: (row) => row.email || "—" },
          { key: "actions", label: "", align: "right", render: rowActions },
        ]}
        renderCard={(row) => (
          <RecordCard
            icon={<UserCircle size={18} aria-hidden="true" />}
            iconClassName="bg-primary-soft text-primary"
            title={row.name}
            amount={row.phone || "No phone"}
            meta={[{ label: "Email", value: row.email || "—" }]}
            actions={rowActions(row)}
          />
        )}
      />

      <FormDrawer
        isOpen={isOpen}
        onOpenChange={(open) => !open && close()}
        title={editing ? `Edit ${singular}` : `Add ${singular}`}
        submitLabel={editing ? "Save changes" : `Add ${singular}`}
        isSubmitting={save.isPending}
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
      >
        <TextInputField control={form.control} name="name" label="Name" isRequired />
        <TextInputField control={form.control} name="phone" label="Phone" type="tel" placeholder="080..." />
        <TextInputField control={form.control} name="email" label="Email" type="email" placeholder="name@example.com" />
        <NotesField control={form.control} name="notes" label="Notes" />
      </FormDrawer>

      <FormDrawer
        isOpen={mergingSource !== null}
        onOpenChange={(open) => !open && setMergingSource(null)}
        title="Merge Duplicate Contact"
        description={
          mergingSource
            ? `Reassign all invoices, sales, payments, and wallet entries from "${mergingSource.name}" into the primary contact.`
            : undefined
        }
        submitLabel="Merge records"
        isSubmitting={mergeAction.isPending}
        onSubmit={(e) => {
          e.preventDefault();
          mergeAction.mutate(undefined);
        }}
      >
        {mergingSource && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-surface-secondary/40 p-3 text-xs">
              <span className="text-muted">Duplicate to retire:</span>{" "}
              <strong className="text-foreground">{mergingSource.name}</strong>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Keep & Merge Into</label>
              <select
                value={mergeTargetId}
                onChange={(e) => setMergeTargetId(e.target.value)}
                className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground"
              >
                <option value="">Select primary contact...</option>
                {(contacts.data || [])
                  .filter((c) => c.id !== mergingSource.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ""}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        )}
      </FormDrawer>
    </Page>
  );
}

export function ContactsPage({ startOpen = false }: { startOpen?: boolean }) {
  return (
    <WorkspaceGate businessOnly>
      {(workspace) => <ContactsContent key={workspace.workspaceId} {...workspace} startOpen={startOpen} />}
    </WorkspaceGate>
  );
}
