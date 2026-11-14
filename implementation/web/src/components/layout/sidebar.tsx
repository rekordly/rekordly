"use client";

// Orven-style sidebar: three neutral floating panels (menu, quick record, account).
// Grouped pages expand under their parent; only the current page is highlighted.

import { Dropdown, Tooltip } from "@heroui/react";
import {
  CaretRight,
  DotsThreeVertical,
  MagnifyingGlass,
  Moon,
  Plus,
  SidebarSimple,
  SignOut,
  Sun,
  X,
} from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { getInitials } from "@/components/ui/user-avatar";
import { signOut } from "@/components/providers/session-provider";
import { useAuthStore } from "@/stores/auth-store";
import { useNotificationStore } from "@/stores/notification-store";
import { useUIStore } from "@/stores/ui-store";

import { activeHrefFor, type NavItem } from "./navigation";
import { useNavigation } from "./use-navigation";
import { WorkspaceSwitcher } from "./workspace-switcher";

const PANEL = "rounded-2xl border border-sidebar-border bg-sidebar";
const ROW = "flex h-9 w-full cursor-pointer items-center rounded-lg text-[13px] transition-colors";
const ROW_IDLE = "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground";
const ROW_ACTIVE = "bg-sidebar-active font-semibold text-sidebar-active-foreground";
/** Collapsed rail: every control is the same centred square. */
const RAIL_BUTTON = "mx-auto grid size-10 cursor-pointer place-items-center rounded-lg transition-colors";

function CountPill({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-sidebar-foreground px-1.5 text-[11px] font-semibold text-sidebar">
      {count > 9 ? "9+" : count}
    </span>
  );
}

function NavRow({
  item,
  activeHref,
  collapsed,
  onNavigate,
  badge,
}: {
  item: NavItem;
  activeHref?: string;
  collapsed: boolean;
  onNavigate?: () => void;
  badge: number;
}) {
  const ItemIcon = item.icon;
  const childActive = item.children?.some((child) => child.href === activeHref) ?? false;
  const selfActive = !item.children && item.href === activeHref;
  const [open, setOpen] = useState(childActive);
  const expanded = open || childActive;

  // Collapsed rail, or a plain page: one link.
  if (collapsed || !item.children) {
    const isActive = selfActive || childActive;
    const link = (
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={isActive ? "page" : undefined}
        aria-label={collapsed ? item.label : undefined}
        className={`${collapsed ? RAIL_BUTTON : `${ROW} gap-2.5 px-2.5`} ${isActive ? ROW_ACTIVE : ROW_IDLE}`}
      >
        <ItemIcon size={18} weight={isActive ? "fill" : "regular"} className="shrink-0" aria-hidden="true" />
        {!collapsed ? (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            <CountPill count={badge} />
          </>
        ) : null}
      </Link>
    );
    return collapsed ? (
      <div className="flex justify-center">
        <Tooltip delay={0}>
          <Tooltip.Trigger>{link}</Tooltip.Trigger>
          <Tooltip.Content placement="right">{item.label}</Tooltip.Content>
        </Tooltip>
      </div>
    ) : (
      link
    );
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setOpen(!expanded)}
        className={`${ROW} gap-2.5 px-2.5 ${childActive ? "font-semibold text-sidebar-foreground hover:bg-sidebar-hover" : ROW_IDLE}`}
      >
        <ItemIcon size={18} weight={childActive ? "fill" : "regular"} className="shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate text-left">{item.label}</span>
        <CaretRight
          size={14}
          className={`shrink-0 text-sidebar-label transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
          aria-hidden="true"
        />
      </button>
      {expanded ? (
        <ul className="relative mt-0.5 mb-1 ml-[18px] space-y-0.5 border-l border-sidebar-border pl-2">
          {item.children.map((child) => {
            const isActive = child.href === activeHref;
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex h-8 items-center rounded-lg px-2.5 text-[12.5px] transition-colors ${isActive ? ROW_ACTIVE : ROW_IDLE}`}
                >
                  <span className="truncate">{child.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function SidebarContent({ collapsed, onNavigate, onClose }: { collapsed: boolean; onNavigate?: () => void; onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const user = useAuthStore((state) => state.user);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const openMoneyRecord = useUIStore((state) => state.openMoneyRecord);
  const setCommandMenuOpen = useUIStore((state) => state.setCommandMenuOpen);
  const { groups, scope, accountLinks } = useNavigation();
  const initials = getInitials(user?.display_name) || "R";
  const activeHref = activeHrefFor(groups, pathname);
  const isDark = resolvedTheme === "dark";

  return (
    <div className="flex h-full flex-col gap-2 text-sidebar-foreground">
      {/* Menu and quick record share one panel */}
      <div className={`${PANEL} flex min-h-0 flex-1 flex-col`}>
        <div className={`flex h-14 shrink-0 items-center ${collapsed ? "justify-center" : "justify-between pr-2 pl-4"}`}>
          <Link href="/dashboard" aria-label="Rekordly home" onClick={onNavigate} className="flex min-w-0 items-center gap-2">
            <span className="grid size-6 shrink-0 place-items-center overflow-hidden rounded-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" className="size-6 object-contain" />
            </span>
            {!collapsed ? <span className="text-[16px] font-bold tracking-tight">Rekordly</span> : null}
          </Link>
          {!collapsed ? (
            <button
              type="button"
              onClick={onClose ?? toggleSidebar}
              aria-label={onClose ? "Close menu" : "Collapse sidebar"}
              className="grid size-8 cursor-pointer place-items-center rounded-lg text-sidebar-label transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground"
            >
              {onClose ? <X size={16} aria-hidden="true" /> : <SidebarSimple size={16} aria-hidden="true" />}
            </button>
          ) : null}
        </div>

        <div className={`border-y border-sidebar-border py-1.5 ${collapsed ? "px-1.5" : "px-2"}`}>
          <WorkspaceSwitcher compact={collapsed} />
        </div>

        <nav aria-label="Main navigation" className={`scrollbar-none flex-1 overflow-y-auto ${collapsed ? "space-y-1 px-1.5 py-2" : "p-2"}`}>
          {collapsed ? (
            <>
              <button type="button" onClick={toggleSidebar} aria-label="Expand sidebar" className={`${RAIL_BUTTON} ${ROW_IDLE}`}>
                <SidebarSimple size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setCommandMenuOpen(true)}
                aria-label="Search pages and actions"
                className={`${RAIL_BUTTON} ${ROW_IDLE}`}
              >
                <MagnifyingGlass size={18} aria-hidden="true" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                onNavigate?.();
                setCommandMenuOpen(true);
              }}
              className={`${ROW} mb-2 gap-2.5 border border-sidebar-border px-2.5 ${ROW_IDLE}`}
            >
              <MagnifyingGlass size={16} className="shrink-0" aria-hidden="true" />
              <span className="flex-1 text-left">Search</span>
              <kbd className="rounded border border-sidebar-border px-1 font-sans text-[10px] text-sidebar-label">Ctrl K</kbd>
            </button>
          )}

          {groups.map((group, index) => (
            <div key={group.title}>
              {index > 0 ? <div className={`my-2 h-px bg-sidebar-border ${collapsed ? "mx-2" : "mx-2.5"}`} /> : null}
              <ul className={collapsed ? "space-y-1" : "space-y-0.5"}>
                {group.items.map((item) => (
                  <li key={`${group.title}-${item.label}`}>
                    <NavRow
                      item={item}
                      activeHref={activeHref}
                      collapsed={collapsed}
                      onNavigate={onNavigate}
                      badge={0}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Quick record: brand green with white text in both themes */}
        <div className={`shrink-0 ${collapsed ? "p-1.5" : "p-2"}`}>
          {collapsed ? (
            <button
              type="button"
              onClick={() => openMoneyRecord("money_in")}
              aria-label="Record what happened"
              className={`${RAIL_BUTTON} bg-primary text-white hover:bg-primary-hover`}
            >
              <Plus size={18} weight="bold" aria-hidden="true" />
            </button>
          ) : (
            <div className="rounded-xl bg-primary p-3 text-white">
              <p className="text-[13px] font-semibold">Record what happened</p>
              <p className="mt-0.5 text-[11.5px] leading-snug text-white/80">Income, expense or transfer in seconds.</p>
              <button
                type="button"
                onClick={() => {
                  openMoneyRecord("money_in");
                  onNavigate?.();
                }}
                className="mt-2.5 inline-flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-white text-[12.5px] font-semibold text-primary transition-opacity hover:opacity-90"
              >
                <Plus size={14} weight="bold" aria-hidden="true" />
                New record
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Account: profile, notifications and the account pages */}
      <div className={`${PANEL} shrink-0 p-1.5`}>
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-1"}`}>
          {!collapsed ? (
            <div className="flex min-w-0 flex-1 items-center gap-2.5 p-1">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-sidebar-border bg-sidebar-hover text-[12px] font-bold">
                {initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{user?.display_name || "Account"}</span>
                <span className="block truncate text-[11.5px] text-sidebar-label">{scope.active?.role_name ?? "Owner"}</span>
              </span>
            </div>
          ) : null}
          <Dropdown>
            <Dropdown.Trigger
              aria-label="Account menu"
              className={`relative grid shrink-0 cursor-pointer place-items-center rounded-lg outline-none transition-colors hover:bg-sidebar-hover ${
                collapsed ? "size-10" : "size-8 text-sidebar-label hover:text-sidebar-foreground"
              }`}
            >
              {collapsed ? (
                <>
                  <span className="grid size-8 place-items-center rounded-lg border border-sidebar-border bg-sidebar-hover text-[12px] font-bold">
                    {initials}
                  </span>
                  {unreadCount > 0 ? <span className="absolute top-0.5 right-0.5 size-2 rounded-full bg-secondary ring-2 ring-sidebar" /> : null}
                </>
              ) : (
                <>
                  <DotsThreeVertical size={18} aria-hidden="true" />
                  {unreadCount > 0 ? <span className="absolute top-1 right-1 size-2 rounded-full bg-secondary ring-2 ring-sidebar" /> : null}
                </>
              )}
            </Dropdown.Trigger>
            <Dropdown.Popover placement="top end" className="min-w-[210px] rounded-xl bg-overlay p-1">
              <Dropdown.Menu
                aria-label="Account"
                onAction={(key) => {
                  const link = accountLinks.find((item) => item.href === String(key));
                  if (link) {
                    onNavigate?.();
                    router.push(link.href);
                  }
                  if (key === "theme") setTheme(isDark ? "light" : "dark");
                  if (key === "signout") void signOut();
                }}
              >
                {[
                  ...accountLinks.map((link) => {
                    const LinkIcon = link.icon;
                    return (
                      <Dropdown.Item key={link.href} id={link.href} textValue={link.label} className="rounded-lg px-3 py-2 text-[13px]">
                        <LinkIcon size={16} aria-hidden="true" />
                        <span className="flex-1">{link.label}</span>
                        {link.href === "/notifications" && unreadCount > 0 ? (
                          <span className="rounded-full bg-secondary px-1.5 text-[11px] font-semibold text-secondary-foreground">
                            {unreadCount > 9 ? "9+" : unreadCount}
                          </span>
                        ) : null}
                      </Dropdown.Item>
                    );
                  }),
                  <Dropdown.Item key="theme" id="theme" textValue="Theme" className="rounded-lg px-3 py-2 text-[13px]">
                    {isDark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
                    {isDark ? "Light mode" : "Dark mode"}
                  </Dropdown.Item>,
                  <Dropdown.Item key="signout" id="signout" textValue="Sign out" className="rounded-lg px-3 py-2 text-[13px] text-danger">
                    <SignOut size={16} aria-hidden="true" />
                    Sign out
                  </Dropdown.Item>,
                ]}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
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
      {/* Desktop: floating, collapsible */}
      <aside
        className={`hidden h-full shrink-0 py-2 pl-2 transition-[width] duration-300 ease-out lg:block ${
          isSidebarCollapsed ? "w-[68px]" : "w-[236px]"
        }`}
      >
        <SidebarContent collapsed={isSidebarCollapsed} />
      </aside>

      {/* Phones and tablets: drawer */}
      {isMobileDrawerOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="absolute inset-0 bg-backdrop backdrop-blur-sm"
            onClick={() => setMobileDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="relative h-full w-[260px] max-w-[85vw] bg-background p-2">
            <SidebarContent
              collapsed={false}
              onNavigate={() => setMobileDrawerOpen(false)}
              onClose={() => setMobileDrawerOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
