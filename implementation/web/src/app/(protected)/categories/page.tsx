import type { Metadata } from "next";
import { CategoriesPage } from "@/components/features/personal/categories-page";

export const metadata: Metadata = {
  title: "Categories & Tags — Rekordly",
  description: "Manage personal categories, hierarchy, archiving, and tags.",
};

export default function Page() {
  return <CategoriesPage />;
}
