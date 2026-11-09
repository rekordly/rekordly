import type { Metadata } from "next";

import { MoneyCaptureForm } from "@/components/features/money-capture-form";
import { Page, PageHeader } from "@/components/ui/page";

export const metadata: Metadata = {
  title: "AI Capture — Rekordly",
  description: "Type what happened in everyday words to generate verified financial drafts.",
};

export default function CapturePage() {
  return (
    <Page>
      <PageHeader
        title="Record what happened"
        description="Start with a confirmed manual record. AI-assisted capture will use this same review path."
      />
      <MoneyCaptureForm />
    </Page>
  );
}
