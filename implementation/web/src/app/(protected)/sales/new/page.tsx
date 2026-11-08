import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export default function NewSalePage() {
  return <ModulePlaceholder title="New sale" description="Create a sale for the active Business workspace and link it to a customer or inventory item." permission="sales.create" actionLabel="Back to sales" actionHref="/sales" />;
}
