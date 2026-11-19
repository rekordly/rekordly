import { notFound } from "next/navigation";
import { StorefrontDesignPage } from "@/components/features/store/storefront-design-page";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id !== "simple" && id !== "studio" && id !== "market") notFound();
  return <StorefrontDesignPage template={id} />;
}
