import type { Metadata } from "next";

import { ForgotPasswordScreen } from "@/components/auth/forgot-password-screen";

export const metadata: Metadata = {
  title: "Forgot password | Rekordly",
  description: "Request password reset instructions for your Rekordly account.",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordScreen />;
}
