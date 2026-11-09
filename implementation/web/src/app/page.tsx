"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

import { Button, StatusBadge, SurfaceCard, ThemeToggle } from "@/components/ui";
import { AUTH_ROUTES } from "@/lib/auth-routes";

export default function HomePage() {
  const router = useRouter();

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-between px-6 py-10">
      <header className="flex items-center justify-between gap-4">
        <Image
          src="/rekordly-logo.svg"
          alt="Rekordly"
          width={148}
          height={36}
          priority
          className="h-8 w-auto object-contain"
        />
        <ThemeToggle />
      </header>

      <SurfaceCard className="my-auto w-full">
        <StatusBadge tone="primary">Rekordly V2 foundation</StatusBadge>
        <div className="max-w-2xl space-y-3">
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Say what happened. Review it. Know your numbers.
          </h1>
          <p className="font-sans text-base leading-relaxed text-muted-foreground sm:text-lg">
            Trustworthy books for Nigerian service and retail businesses, without accounting-software complexity.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            size="lg"
            onPress={() => router.push(AUTH_ROUTES.LOGIN)}
          >
            Sign in or get started
          </Button>
        </div>
      </SurfaceCard>

      <footer className="text-center font-sans text-xs text-muted-foreground">
        Rekordly V2 — Personal &amp; Business Finance
      </footer>
    </main>
  );
}
