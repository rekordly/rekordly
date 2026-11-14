"use client";

// Choose a customer or supplier, the same way on every screen.
// Shows the choice as a chip; opens a search drawer that can add a new contact in place.
//
//   <ContactPicker workspaceId kind="customers" value={contact} onChange={setContact} />
//   <ContactField control={form.control} name="customer_id" workspaceId kind="customers" />   (react-hook-form, stores the id)

import { useState } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";

import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { EntityField, PickerDrawer, type PickerItem } from "@/components/ui/form-kit";
import { useContacts } from "@/components/features/finance/shared";
import { financeApi } from "@/lib/money";

export type ContactKind = "customers" | "suppliers";

export interface ContactValue {
  id: string;
  name: string;
  description?: string;
}

const WORDS = {
  customers: { one: "customer", title: "Customer" },
  suppliers: { one: "supplier", title: "Supplier" },
} as const;

function NewContactForm({
  workspaceId,
  kind,
  initialName,
  onCreated,
  onCancel,
}: {
  workspaceId: number;
  kind: ContactKind;
  initialName: string;
  onCreated: (contact: ContactValue) => void;
  onCancel: () => void;
}) {
  const word = WORDS[kind].one;
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!name.trim()) return setError(`Enter the ${word}'s name`);
    setSaving(true);
    try {
      const created = (await financeApi.createContact(workspaceId, kind, {
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
      })) as { id?: number; customer?: { id: number }; supplier?: { id: number } } | undefined;
      const id = created?.id ?? created?.customer?.id ?? created?.supplier?.id;
      if (!id) throw new Error(`The ${word} was not saved. Try again.`);
      onCreated({ id: String(id), name: name.trim(), description: phone.trim() || email.trim() || undefined });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save. Try again.");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted">Only the name is needed. You can add more details later.</p>
      <AppInput
        label="Name"
        isRequired
        autoFocus
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setError("");
        }}
        errorMessage={error || undefined}
      />
      <AppInput label="Phone" type="tel" placeholder="Optional" value={phone} onChange={(event) => setPhone(event.target.value)} />
      <AppInput label="Email" type="email" placeholder="Optional" value={email} onChange={(event) => setEmail(event.target.value)} />
      <div className="flex gap-2 pt-2">
        <AppButton variant="ghost" label="Back" className="flex-1" onPress={onCancel} />
        <AppButton label={`Add ${word}`} className="flex-[2]" isLoading={saving} onPress={() => void save()} />
      </div>
    </div>
  );
}

export interface ContactPickerProps {
  workspaceId: number;
  kind: ContactKind;
  value: ContactValue | null;
  onChange: (value: ContactValue | null) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  /** Hide the remove button when a contact is required. */
  clearable?: boolean;
}

export function ContactPicker({ workspaceId, kind, value, onChange, label, placeholder, error, clearable = true }: ContactPickerProps) {
  const words = WORDS[kind];
  const contacts = useContacts(workspaceId, kind);
  const [open, setOpen] = useState(false);

  const items: PickerItem[] = (contacts.data ?? [])
    .filter((contact) => contact.is_active)
    .map((contact) => ({ id: String(contact.id), label: contact.name, description: contact.phone || contact.email || undefined }));

  return (
    <>
      <EntityField
        label={label ?? words.title}
        value={value?.name}
        meta={value?.description}
        placeholder={placeholder ?? `Choose or add a ${words.one}`}
        onOpen={() => setOpen(true)}
        onClear={clearable ? () => onChange(null) : undefined}
        error={error}
      />
      <PickerDrawer
        isOpen={open}
        onOpenChange={setOpen}
        title={`Choose a ${words.one}`}
        items={items}
        isLoading={contacts.isPending}
        selectedId={value?.id}
        onSelect={(item) => onChange({ id: item.id, name: item.label, description: item.description })}
        searchPlaceholder={`Search ${kind}`}
        emptyText={`No ${kind} yet. Add your first one above.`}
        createLabel={`New ${words.one}`}
        renderCreate={({ initialName, done, cancel }) => (
          <NewContactForm
            workspaceId={workspaceId}
            kind={kind}
            initialName={initialName}
            onCancel={cancel}
            onCreated={(contact) => {
              void contacts.refetch();
              done({ id: contact.id, label: contact.name, description: contact.description });
            }}
          />
        )}
      />
    </>
  );
}

/** react-hook-form version: the form value is the contact id as a string ("" when none). */
export function ContactField<T extends FieldValues>({
  control,
  name,
  workspaceId,
  kind,
  label,
  placeholder,
  clearable,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  workspaceId: number;
  kind: ContactKind;
  label?: string;
  placeholder?: string;
  clearable?: boolean;
}) {
  const contacts = useContacts(workspaceId, kind);
  // Remembers a contact created a moment ago, before the list has refreshed.
  const [recent, setRecent] = useState<ContactValue | null>(null);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const id = String(field.value ?? "");
        const found = contacts.data?.find((contact) => String(contact.id) === id);
        const value: ContactValue | null = found
          ? { id, name: found.name, description: found.phone || found.email || undefined }
          : recent && recent.id === id
            ? recent
            : null;
        return (
          <ContactPicker
            workspaceId={workspaceId}
            kind={kind}
            label={label}
            placeholder={placeholder}
            clearable={clearable}
            value={value}
            error={fieldState.error?.message}
            onChange={(next) => {
              setRecent(next);
              field.onChange(next?.id ?? "");
              field.onBlur();
            }}
          />
        );
      }}
    />
  );
}
