"use client";

import { Avatar, Tooltip } from "@heroui/react";
import { SignOut, X } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { getInitials } from "@/components/ui/user-avatar";
import { signOut } from "@/components/providers/session-provider";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";

import { useNavigation } from "./use-navigation";
import { WorkspaceSwitcher } from "./workspace-switcher";

function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const { groups, scope } = useNavigation();

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Brand */}
      <div className={`flex h-[72px] shrink-0 items-center ${collapsed ? "justify-center px-3" : "px-6"}`}>
        <Link href="/dashboard" aria-label="Rekordly home" onClick={onNavigate}>
          {collapsed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/logo.png" alt="Rekordly" className="size-9 rounded-xl" />
          ) : (
            <span className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" className="size-7 rounded-lg" />
              <span className="font-heading text-xl font-bold tracking-tight">Rekordly</span>
            </span>
          )}
        </Link>
      </div>

      {!collapsed ? (
        <div className="px-3">
          <WorkspaceSwitcher />
        </div>
      ) : null}

      {/* Navigation */}
      <nav aria-label="Main navigation" className="scrollbar-none flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((group) => (
          <div key={group.title} className="mt-5">
            {collapsed ? (
              <div className="mx-auto mb-2 h-px w-6 bg-sidebar-border" />
            ) : (
              <p className="mb-2 px-3 text-[11px] font-medium tracking-[0.14em] text-sidebar-label uppercase">
                {group.title}
              </p>
            )}

            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (pathname.startsWith(`${item.href}/`) &&
                    !group.items.some(
                      (other) => other.href.length > item.href.length && pathname.startsWith(other.href),
                    ));
                const ItemIcon = item.icon;

                const link = (
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={isActive ? "page" : undefined}
                    aria-label={collapsed ? item.label : undefined}
                    className={`flex h-10 items-center rounded-xl text-[14px] transition-colors ${
                      collapsed ? "justify-center" : "gap-3 px-3"
                    } ${
                      isActive
                        ? "bg-sidebar-active font-medium text-sidebar-active-foreground"
                        : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground"
                    }`}
                  >
                    <ItemIcon size={20} className="shrink-0" aria-hidden="true" />
                    {!collapsed ? <span className="flex-1 truncate">{item.label}</span> : null}
                  </Link>
                );

                return (
                  <li key={item.href}>
                    {collapsed ? (
                      <Tooltip delay={0}>
                        <Tooltip.Trigger>{link}</Tooltip.Trigger>
                        <Tooltip.Content placement="right">{item.label}</Tooltip.Content>
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Profile */}
      <div className="shrink-0 border-t border-sidebar-border p-3">
        <div className={`flex items-center rounded-2xl p-2 ${collapsed ? "flex-col gap-2" : "gap-3"}`}>
          <Avatar size="sm" className="shrink-0 bg-sidebar-active text-sidebar-active-foreground">
            <Avatar.Fallback className="text-xs font-bold">
              {getInitials(user?.display_name) || "R"}
            </Avatar.Fallback>
          </Avatar>
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-sidebar-foreground">
                {user?.display_name || "Account"}
              </p>
              <p className="truncate text-xs text-sidebar-muted">{scope.active?.role_name ?? "Owner"}</p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => void signOut()}
            aria-label="Sign out"
            title="Sign out"
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-danger"
          >
            <SignOut size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const isSidebarCollapsed = useUIStore((state) => state.isSidebarCollapsed);
  const isMobileDrawerOpen = useUIStore((state) => state.isMobileDrawerOpen);
  const setMobileDrawerOpen = useUIStore((state) => state.setMobileDrawerOpen);

  return (
    <>
      {/* Desktop: collapsible rail */}
      <aside
        className={`sticky top-0 hidden h-full shrink-0 transition-[width] duration-300 ease-out md:block ${
          isSidebarCollapsed ? "w-[76px]" : "w-[264px]"
        }`}
      >
        <SidebarContent collapsed={isSidebarCollapsed} />
      </aside>

      {/* Mobile and tablet: drawer */}
      {isMobileDrawerOpen ? (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="absolute inset-0 bg-backdrop backdrop-blur-sm"
            onClick={() => setMobileDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="relative h-full w-[280px] max-w-[85vw]">
            <SidebarContent collapsed={false} onNavigate={() => setMobileDrawerOpen(false)} />
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(false)}
              aria-label="Close menu"
              className="absolute top-5 right-3 grid size-8 cursor-pointer place-items-center rounded-lg text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
