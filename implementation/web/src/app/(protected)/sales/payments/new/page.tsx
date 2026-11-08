import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function NewCustomerPaymentPage() {
  return <ModulePlaceholder title="Record customer payment" description="Link a customer payment to a sale or invoice, even when the payer is not a Rekordly user." permission="payments.create" actionLabel="Back to payments" actionHref="/payments" />;
}
