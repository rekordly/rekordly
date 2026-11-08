import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function NewInvoicePage() {
  return <ModulePlaceholder title="New invoice" description="Prepare a branded invoice with customer details, line items, tax, and payment terms." permission="invoices.create" actionLabel="Back to invoices" actionHref="/invoices" />;
}
