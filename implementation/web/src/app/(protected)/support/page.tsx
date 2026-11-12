import type { Metadata } from "next";

import { SupportWorkspacePanel } from "@/components/features/bp16-settings-panels";
import { Page, PageHeader } from "@/components/ui/page";

export const metadata: Metadata = {
  title: "Support — Rekordly",
  description: "Open support requests and manage time-bound diagnostic access grants.",
};

export default function SupportPage() {
  return (
    <Page>
      <PageHeader
        title="Support & diagnostics"
        description="Report issues safely without sharing passwords, OTPs, or full card numbers."
      />
      <SupportWorkspacePanel />
    </Page>
  );
}
