import type { Metadata } from "next";

import { PasswordSignInScreen } from "@/components/auth/password-sign-in-screen";

export const metadata: Metadata = {
  title: "Sign in with password | Rekordly",
  description: "Enter your password to sign in to your Rekordly account.",
};

export default function LoginPasswordPage() {
  return <PasswordSignInScreen />;
}
