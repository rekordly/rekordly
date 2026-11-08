import type { Metadata } from "next";
import { MoneyCaptureForm } from "@/components/features/money-capture-form";

export const metadata: Metadata = {
  title: "AI Capture — Rekordly",
  description: "Type what happened in everyday words to generate verified financial drafts.",
};

export default function CapturePage() {
  return <main className="mx-auto max-w-3xl p-5 sm:p-7"><div className="mb-6"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Money capture</p><h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">Record what happened</h1><p className="mt-2 text-sm text-muted-foreground">Start with a confirmed manual record. AI-assisted capture will use this same review path.</p></div><MoneyCaptureForm /></main>;
}
