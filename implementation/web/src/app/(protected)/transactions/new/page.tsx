import { redirect } from "next/navigation";

/** Creation is an app-shell drawer, not a separate destination. */
export default function NewTransactionPage() {
  redirect("/transactions");
}
