"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

import { AppButton } from "@/components/ui/app-button";
import { DashboardCard } from "@/components/ui/dashboard-card";
import { StatusPill } from "@/components/ui/page";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AUTH_ROUTES } from "@/lib/auth";

export default function HomePage() {
  const router = useRouter();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col justify-between px-6 py-10">
      <header className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="" width={32} height={32} priority className="size-8 rounded-lg" />
          <span className="font-heading text-lg font-bold tracking-tight">Rekordly</span>
        </span>
        <ThemeToggle />
      </header>

      <DashboardCard className="my-auto w-full gap-6 p-6 sm:p-10">
        <StatusPill tone="brand" className="w-fit">Rekordly V2 foundation</StatusPill>
        <div className="max-w-2xl space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Say what happened. Review it. Know your numbers.
          </h1>
          <p className="text-base leading-relaxed text-muted sm:text-lg">
            Trustworthy books for Nigerian service and retail businesses, without accounting-software complexity.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AppButton size="lg" label="Sign in or get started" onPress={() => router.push(AUTH_ROUTES.LOGIN)} />
        </div>
      </DashboardCard>

      <footer className="text-center text-xs text-muted">Rekordly V2 — Personal &amp; Business Finance</footer>
    </main>
  );
}
