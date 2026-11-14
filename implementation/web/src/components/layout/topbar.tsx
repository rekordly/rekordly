"use client";

// Desktop has no header: each page's title row carries its own actions.
// Phones and tablets get a slim bar with the logo, search and the menu.

import { List, MagnifyingGlass } from "@phosphor-icons/react";
import Link from "next/link";

import { useUIStore } from "@/stores/ui-store";

const ICON_BUTTON =
  "grid size-10 cursor-pointer place-items-center rounded-xl text-foreground transition-colors hover:bg-surface-secondary";

export function MobileBar() {
  const toggleMobileDrawer = useUIStore((state) => state.toggleMobileDrawer);
  const setCommandMenuOpen = useUIStore((state) => state.setCommandMenuOpen);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-border/60 bg-background/85 px-4 backdrop-blur-xl sm:px-6 lg:hidden">
      <Link href="/dashboard" aria-label="Rekordly home" className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="size-7 rounded-lg" />
        <span className="text-[18px] font-bold tracking-tight">Rekordly</span>
      </Link>
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Search pages and actions" className={ICON_BUTTON} onClick={() => setCommandMenuOpen(true)}>
          <MagnifyingGlass size={20} aria-hidden="true" />
        </button>
        <button type="button" aria-label="Open menu" className={ICON_BUTTON} onClick={toggleMobileDrawer}>
          <List size={22} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
