import type { Metadata } from "next";

import { ResetPasswordScreen } from "@/components/auth/reset-password-screen";

export const metadata: Metadata = {
  title: "Reset password | Rekordly",
  description: "Set a new password for your Rekordly account.",
};

interface ResetPasswordPageProps {
  searchParams?: Promise<{
    token?: string;
  }>;
}

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  return <ResetPasswordScreen initialToken={resolvedParams?.token} />;
}
