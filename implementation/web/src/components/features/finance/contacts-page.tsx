"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, UserCircle, UsersThree } from "@phosphor-icons/react";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { AppButton } from "@/components/ui/app-button";
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
  const contacts = useContacts(workspaceId, kind);
  const singular = kind === "customers" ? "customer" : "supplier";

  const form = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: "", email: "", phone: "", notes: "" },
  });
  const close = () => {
    setIsOpen(false);
    form.reset();
  };
  const create = useFinanceAction(
    workspaceId,
    (values: ContactValues) => financeApi.createContact(workspaceId, kind, { ...values, party_type: singular }),
    { success: "Contact added", onDone: close },
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
          { key: "name", label: "Name", render: (row) => <span className="font-medium text-foreground">{row.name}</span> },
          { key: "phone", label: "Phone", render: (row) => row.phone || "—" },
          { key: "email", label: "Email", render: (row) => row.email || "—" },
        ]}
        renderCard={(row) => (
          <RecordCard
            icon={<UserCircle size={18} aria-hidden="true" />}
            iconClassName="bg-primary-soft text-primary"
            title={row.name}
            amount={row.phone || "No phone"}
            meta={[{ label: "Email", value: row.email || "—" }]}
          />
        )}
      />
      <FormDrawer
        isOpen={isOpen}
        onOpenChange={(open) => !open && close()}
        title={`Add ${singular}`}
        submitLabel={`Add ${singular}`}
        isSubmitting={create.isPending}
        onSubmit={form.handleSubmit((values) => create.mutate(values))}
      >
        <TextInputField control={form.control} name="name" label="Name" isRequired />
        <TextInputField control={form.control} name="phone" label="Phone" type="tel" placeholder="080..." />
        <TextInputField control={form.control} name="email" label="Email" type="email" placeholder="name@example.com" />
        <NotesField control={form.control} name="notes" label="Notes" />
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
