import type { Metadata } from "next";

import { CreatePasswordScreen } from "@/components/auth/create-password-screen";

export const metadata: Metadata = {
  title: "Create password | Rekordly",
  description: "Create a password to complete your Rekordly account verification.",
};

export default function CreatePasswordPage() {
  return <CreatePasswordScreen />;
}
