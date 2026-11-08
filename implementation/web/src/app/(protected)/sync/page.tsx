import type { Metadata } from "next";
import { FeatureScaffold } from "@/components/features";

export const metadata: Metadata = {
  title: "Offline Drafts & Sync — Rekordly",
  description: "Monitor offline mutation queues and synchronization health.",
};

export default function SyncPage() {
  return <FeatureScaffold featureId="offline-sync" defaultSpace="business" />;
}
