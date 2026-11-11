import { redirect } from "next/navigation";

/** Record creation now opens in place from the app shell. */
export default function CapturePage() {
  redirect("/transactions");
}
