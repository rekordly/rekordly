import { ModulePlaceholder } from "@/components/layout/module-placeholder";
export default function SalesPage() { return <ModulePlaceholder title="Sales" description="Manage sales, invoices, receipts, and customer payments." permission="sales.view" actionLabel="New sale" actionHref="/sales/new" />; }
