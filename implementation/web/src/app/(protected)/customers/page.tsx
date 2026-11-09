import type { Metadata } from "next";

import { ContactsPage } from "@/components/features/finance/contacts-page";

export const metadata: Metadata = {
  title: "Contacts — Rekordly",
  description: "Customers and suppliers.",
};

export default function Page() {
  return <ContactsPage />;
}
