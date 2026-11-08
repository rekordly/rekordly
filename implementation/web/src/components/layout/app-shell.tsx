"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/ui";
import { useSessionStore } from "@/lib/auth/session-store";

export function AppShell({ children }: { children: ReactNode }) {
  const user = useSessionStore((state) => state.user);

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface p-5 md:flex md:flex-col">
        <Link href="/dashboard" className="font-heading text-xl font-bold text-primary">Rekordly</Link>
        <nav className="mt-8 text-sm">
          <Link href="/dashboard" className="block rounded-xl bg-primary-soft px-3 py-2.5 font-medium text-primary">
            Dashboard
          </Link>
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex h-16 items-center justify-between border-b border-border px-5 sm:px-7">
          <div>
            <p className="text-xs text-muted-foreground">Workspace</p>
            <p className="text-sm font-semibold">{user?.workspaces[0]?.name ?? "Rekordly"}</p>
          </div>
          <ThemeToggle />
        </header>
        {children}
      </div>
    </div>
  );
}
