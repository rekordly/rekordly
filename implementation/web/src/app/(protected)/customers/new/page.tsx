import type { Metadata } from "next";

import { ContactsPage } from "@/components/features/finance/contacts-page";

export const metadata: Metadata = {
  title: "Add contact — Rekordly",
  description: "Add a customer or supplier.",
};

export default function Page() {
  return <ContactsPage startOpen />;
}
