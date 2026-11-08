import { SearchX } from "lucide-react";
import Link from "next/link";

import { Button, SurfaceCard } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <SurfaceCard className="max-w-md items-center text-center shadow-none">
        <div className="grid size-12 place-items-center rounded-xl bg-primary-soft text-primary">
          <SearchX className="size-6" aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wider text-primary uppercase">404</p>
          <h1 className="mt-1 font-heading text-2xl font-semibold">Page not found</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            The page may have moved, or the address may be incorrect.
          </p>
        </div>
        <Link href="/dashboard">
          <Button variant="primary">Go to dashboard</Button>
        </Link>
      </SurfaceCard>
    </main>
  );
}
