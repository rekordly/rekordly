import Link from "next/link";

import { AppButton } from "@/components/ui/app-button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background p-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- next/image does not optimise SVG */}
      <img src="/404.svg" alt="Page not found" className="w-full max-w-sm" />
      <Link href="/dashboard" className="mt-6">
        <AppButton label="Go to dashboard" />
      </Link>
    </main>
  );
}
