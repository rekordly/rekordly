import type { Metadata } from "next";

import { AccountSecurityPrivacyPanel } from "@/components/features/bp16-settings-panels";
import { Page, PageHeader } from "@/components/ui/page";

export const metadata: Metadata = {
  title: "Privacy, Exports & Deletion — Rekordly",
  description: "Manage privacy choices, complete ownership exports, and 60-day recoverable account deletion.",
};

export default function PrivacyPage() {
  return (
    <Page>
      <PageHeader
        title="Privacy, exports & deletion"
        description="Account-scoped privacy controls, ownership portability exports, and recoverable deletion."
      />
      <AccountSecurityPrivacyPanel />
    </Page>
  );
}
