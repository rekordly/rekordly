import type { Metadata } from "next";

import { CardGallery } from "@/components/features/design/card-gallery";

export const metadata: Metadata = {
  title: "Card gallery — Rekordly",
  description: "Every stat card in the Rekordly card family, with sample figures.",
};

export default function Page() {
  return <CardGallery />;
}
