"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChartLineUp, GearSix, House, Receipt, SignOut, UsersThree, Wallet } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";

import { Button, ThemeToggle } from "@/components/ui";
import { sessionApi } from "@/lib/api/session";
import { useSessionStore } from "@/lib/auth/session-store";

const navigation = [
  { href: "/dashboard", label: "Overview", icon: House },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/invoices", label: "Invoices", icon: Wallet },
  { href: "/reports", label: "Reports", icon: ChartLineUp },
  { href: "/customers", label: "Customers", icon: UsersThree },
];

export function AppShell({ children }: { children: ReactNode }) {
  const user = useSessionStore((state) => state.user);
  const setUnauthenticated = useSessionStore((state) => state.setUnauthenticated);
  const router = useRouter();

  async function handleLogout() {
    try {
      await sessionApi.logout();
    } finally {
      setUnauthenticated();
      router.replace("/login");
    }
  }

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface p-5 md:flex md:flex-col">
        <Link href="/dashboard" className="font-heading text-xl font-bold text-primary">Rekordly</Link>
        <nav className="mt-8 flex flex-1 flex-col gap-1 text-sm" aria-label="Main navigation">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground">
              <Icon size={19} weight="duotone" aria-hidden="true" />
              {label}
            </Link>
          ))}
          <Link href="/settings" className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground">
            <GearSix size={19} weight="duotone" aria-hidden="true" />
            Settings
          </Link>
          <Button variant="ghost" fullWidth startIcon={<SignOut />} className="justify-start px-3 text-muted-foreground" onPress={handleLogout}>
            Sign out
          </Button>
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
