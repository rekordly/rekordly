import type { Metadata } from "next";

import { OtpVerificationScreen } from "@/components/auth/otp-verification-screen";
import type { OtpPurpose } from "@/lib/api/types";

export const metadata: Metadata = {
  title: "Verify code | Rekordly",
  description: "Enter your single-use verification code to continue to Rekordly.",
};

interface OtpPageProps {
  searchParams?: Promise<{
    email?: string;
    purpose?: string;
  }>;
}

export default async function OtpPage({ searchParams }: OtpPageProps) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  const rawPurpose = resolvedParams?.purpose;
  const initialPurpose: OtpPurpose | undefined =
    rawPurpose === "registration" || rawPurpose === "sign_in"
      ? rawPurpose
      : undefined;

  return (
    <OtpVerificationScreen
      initialEmail={resolvedParams?.email}
      initialPurpose={initialPurpose}
    />
  );
}
