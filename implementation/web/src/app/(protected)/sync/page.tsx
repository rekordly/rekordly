import type { Metadata } from "next";
import { OfflineSyncWorkspace } from "@/components/features/offline-sync-workspace";

export const metadata: Metadata = {
  title: "Offline Drafts & Sync — Rekordly",
  description: "Monitor offline mutation queues and synchronization health.",
};

export default function SyncPage() {
  return <OfflineSyncWorkspace />;
}
