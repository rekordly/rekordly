import type { Metadata } from "next";
import { FeatureScaffold } from "@/components/features";

export const metadata: Metadata = {
  title: "AI Capture — Rekordly",
  description: "Type what happened in everyday words to generate verified financial drafts.",
};

export default function CapturePage() {
  return <FeatureScaffold featureId="ai-capture" defaultSpace="business" />;
}
