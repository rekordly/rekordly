"use client";

import { Bell, ChartLineUp, GearSix, House, MagnifyingGlass, Plus, Receipt, SignOut, Storefront, UserCircle, UsersThree, Wallet, X } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { sessionApi } from "@/lib/api/session";
import { useSessionStore } from "@/lib/auth/session-store";
import { Button, ThemeToggle } from "@/components/ui";

type ShellMode = "personal" | "business" | "all";
type Icon = ComponentType<{ size?: number; weight?: "duotone" | "bold"; className?: string }>;
interface NavItem { href: string; label: string; icon: Icon; capability?: string }

const personalNavigation: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/transactions", label: "Activity", icon: Receipt },
  { href: "/budgets", label: "Budgets", icon: ChartLineUp },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/reports", label: "Reports", icon: ChartLineUp },
];
const businessNavigation: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/transactions", label: "Money", icon: Wallet, capability: "money.view" },
  { href: "/sales", label: "Sales", icon: Receipt, capability: "sales.view" },
  { href: "/purchases", label: "Purchases", icon: Receipt, capability: "purchases.view" },
  { href: "/inventory", label: "Inventory", icon: Storefront, capability: "inventory.view_quantity" },
  { href: "/store", label: "Storefront", icon: Storefront, capability: "storefront.view" },
  { href: "/customers", label: "Contacts", icon: UsersThree },
  { href: "/reports", label: "Reports", icon: ChartLineUp, capability: "reports.view_basic" },
  { href: "/review", label: "Review", icon: Bell },
];
const allNavigation: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/reports", label: "Summary", icon: ChartLineUp },
  { href: "/transactions", label: "Activity", icon: Receipt },
];
const addActions = {
  personal: [
    { label: "Add income", href: "/transactions/new?type=income" },
    { label: "Add expense", href: "/transactions/new?type=expense" },
    { label: "Transfer money", href: "/transactions/new?type=transfer" },
    { label: "Import records", href: "/transactions/import" },
  ],
  business: [
    { label: "Record money in", href: "/transactions/new?type=income" },
    { label: "Record money out", href: "/transactions/new?type=expense" },
    { label: "New sale", href: "/sales/new" },
    { label: "New invoice", href: "/invoices/new" },
    { label: "Record customer payment", href: "/sales/payments/new" },
    { label: "Add customer", href: "/customers/new" },
  ],
} as const;

function modeLabel(mode: ShellMode) { return mode === "all" ? "All spaces" : mode === "personal" ? "Personal" : "Business"; }

function ShellDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center" role="presentation" onMouseDown={onClose}><div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-lg rounded-3xl border border-border bg-surface p-5 shadow-none" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center justify-between gap-4"><h2 className="font-heading text-lg font-semibold">{title}</h2><Button variant="ghost" size="sm" isIconOnly aria-label="Close" onPress={onClose}><X /></Button></div><div className="mt-5">{children}</div></div></div>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useSessionStore((state) => state.user);
  const hasPermission = useSessionStore((state) => state.hasPermission);
  const setUnauthenticated = useSessionStore((state) => state.setUnauthenticated);
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        setShowSearch(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);
  const workspaces = user?.workspaces ?? [];
  const activeWorkspaceId = searchParams.get("workspace");
  const activeWorkspace = workspaces.find((workspace) => String(workspace.id) === activeWorkspaceId) ?? workspaces[0];
  const canSeeAll = Boolean(workspaces.some((workspace) => workspace.kind === "personal" && workspace.is_owner) && workspaces.some((workspace) => workspace.kind === "business" && workspace.is_owner));
  const mode: ShellMode = activeWorkspace?.kind === "business" ? "business" : canSeeAll && activeWorkspaceId === "all" ? "all" : "personal";
  const navigation = mode === "business" ? businessNavigation : mode === "all" ? allNavigation : personalNavigation;
  const visibleNavigation = navigation.filter((item) => !item.capability || hasPermission(item.capability));
  const filteredAddActions = (mode === "business" ? addActions.business : addActions.personal).filter((action) => action.label.toLowerCase().includes(query.toLowerCase()));

  function switchWorkspace(value: string) { queryClient.removeQueries({ predicate: (query) => query.queryKey.some((part) => typeof part === "string" && part.includes("workspace")) }); const params = new URLSearchParams(searchParams.toString()); params.set("workspace", value); router.push(`${pathname}?${params.toString()}`); }
  async function handleLogout() { try { await sessionApi.logout(); } finally { setUnauthenticated(); router.replace("/login"); } }

  return <div className="min-h-dvh bg-background text-foreground">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-surface px-4 py-5 md:flex md:flex-col">
      <Link href="/dashboard" className="px-3 font-heading text-xl font-bold tracking-tight text-primary">Rekordly</Link>
      <div className="mt-7 rounded-2xl border border-border bg-background p-2"><label className="sr-only" htmlFor="workspace-switcher">Active space</label><select id="workspace-switcher" value={activeWorkspaceId ?? String(activeWorkspace?.id ?? "")} onChange={(event) => switchWorkspace(event.target.value)} className="w-full bg-transparent px-2 py-2 text-sm font-semibold outline-none">{canSeeAll ? <option value="all">All spaces</option> : null}{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select><p className="px-2 pb-1 text-[11px] capitalize text-muted-foreground">{modeLabel(mode)}</p></div>
      <nav className="mt-6 flex flex-1 flex-col gap-1" aria-label="Main navigation">{visibleNavigation.map((item) => { const IconComponent = item.icon; const active = pathname === item.href || pathname.startsWith(`${item.href}/`); return <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${active ? "bg-primary-soft font-semibold text-primary" : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"}`}><IconComponent size={19} weight="duotone" aria-hidden="true" />{item.label}</Link>; })}<Button variant="primary" fullWidth startIcon={<Plus />} className="mt-5" onPress={() => setShowAdd(true)}>Add</Button><Link href="/settings" className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-surface-muted hover:text-foreground"><GearSix size={19} weight="duotone" />Settings</Link><Button variant="ghost" fullWidth startIcon={<SignOut />} className="justify-start px-3 text-muted-foreground" onPress={handleLogout}>Sign out</Button></nav>
    </aside>
      <div className="md:pl-64"><header className="sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur sm:px-7"><div className="min-w-0 flex-1"><select aria-label="Active space" value={activeWorkspaceId ?? String(activeWorkspace?.id ?? "")} onChange={(event) => switchWorkspace(event.target.value)} className="max-w-48 bg-transparent text-sm font-semibold outline-none md:hidden">{canSeeAll ? <option value="all">All spaces</option> : null}{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select><p className="hidden text-sm font-semibold md:block">{activeWorkspace?.name ?? modeLabel(mode)}</p><p className="hidden text-xs text-muted-foreground sm:block">{modeLabel(mode)}</p></div><button type="button" onClick={() => setShowSearch(true)} className="hidden h-10 min-w-56 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-left text-sm text-muted-foreground md:flex" aria-label="Search Rekordly"><MagnifyingGlass size={18} />Search <kbd className="ml-auto rounded border border-border px-1.5 text-[10px]">/</kbd></button><Button variant="ghost" size="sm" isIconOnly aria-label="Search Rekordly" className="md:hidden" onPress={() => setShowSearch(true)}><MagnifyingGlass /></Button><Button variant="ghost" size="sm" isIconOnly aria-label="Notifications" onPress={() => router.push("/notifications")}><Bell /></Button><ThemeToggle /><div className="hidden items-center gap-2 border-l border-border pl-3 sm:flex"><UserCircle size={24} weight="duotone" className="text-primary" /><span className="max-w-28 truncate text-sm">{user?.display_name || "Account"}</span></div></header>{!isOnline ? <div role="status" className="border-b border-secondary/30 bg-secondary-soft px-4 py-2 text-center text-xs font-medium text-secondary">You are offline. Read-only data remains available; changes will wait until you reconnect.</div> : null}<main className="min-h-[calc(100dvh-4rem)] pb-24 md:pb-8">{children}</main></div>
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface px-2 py-2 md:hidden" aria-label="Mobile navigation">{[visibleNavigation[0], visibleNavigation[1], null, visibleNavigation[2], { href: "/settings", label: "More", icon: GearSix }].map((item, index) => item ? <Link key={item.href} href={item.href} className={`flex flex-col items-center gap-1 rounded-lg py-1 text-[11px] ${pathname === item.href ? "text-primary" : "text-muted-foreground"}`}><item.icon size={20} weight="duotone" />{item.label}</Link> : <button key={`add-${index}`} type="button" onClick={() => setShowAdd(true)} className="-mt-6 mx-auto flex size-12 items-center justify-center rounded-full border-4 border-background bg-primary text-primary-foreground" aria-label="Add"><Plus size={22} weight="bold" /></button>)}</nav>
    {showAdd ? <ShellDialog title={`Add to ${modeLabel(mode)}`} onClose={() => setShowAdd(false)}><div className="grid gap-2">{filteredAddActions.map((action) => <Link key={action.href} href={action.href} onClick={() => setShowAdd(false)} className="rounded-xl border border-border px-4 py-3 text-sm font-medium hover:border-primary hover:bg-primary-soft">{action.label}</Link>)}</div></ShellDialog> : null}
    {showSearch ? <ShellDialog title="Search Rekordly" onClose={() => setShowSearch(false)}><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setShowSearch(false); }} placeholder="Search pages and actions" className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" aria-label="Search pages and actions" /><div className="mt-4 grid gap-2">{filteredAddActions.map((action) => <Link key={action.href} href={action.href} onClick={() => setShowSearch(false)} className="rounded-xl px-3 py-2 text-sm hover:bg-surface-muted">{action.label}</Link>)}</div></ShellDialog> : null}
  </div>;
}
