"use client";

import { Avatar, Badge, Dropdown, ListBox, Popover } from "@heroui/react";
import { Bell, BellSlash, Checks, GearSix, List, Plus, SidebarSimple, SignOut } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppModal } from "@/components/ui/app-modal";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { getInitials } from "@/components/ui/user-avatar";
import { signOut } from "@/components/providers/session-provider";
import { useAuthStore } from "@/stores/auth-store";
import { useNotificationStore } from "@/stores/notification-store";
import { useUIStore } from "@/stores/ui-store";

import { CommandMenu } from "./command-menu";
import { modeLabel } from "./navigation";
import { useNavigation } from "./use-navigation";

function timeAgo(date: string) {
  const minutes = Math.floor(Math.max(0, Date.now() - new Date(date).getTime()) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

export function Topbar() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const notifications = useNotificationStore((state) => state.notifications);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const markAsRead = useNotificationStore((state) => state.markAsRead);
  const markAllAsRead = useNotificationStore((state) => state.markAllAsRead);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const toggleMobileDrawer = useUIStore((state) => state.toggleMobileDrawer);
  const isSidebarCollapsed = useUIStore((state) => state.isSidebarCollapsed);
  const { scope, addActions } = useNavigation();
  const [showAdd, setShowAdd] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-[72px] shrink-0 items-center gap-3 border-b border-border/40 bg-overlay/80 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <AppButton isIconOnly variant="ghost" aria-label="Open menu" className="md:hidden" onPress={toggleMobileDrawer}>
        <List size={20} />
      </AppButton>
      <AppButton
        isIconOnly
        variant="ghost"
        aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="hidden md:inline-flex"
        onPress={toggleSidebar}
      >
        <SidebarSimple size={20} />
      </AppButton>

      <div className="min-w-0 flex-1">
        <CommandMenu />
      </div>

      <div className="flex items-center gap-1.5">
        <AppButton
          isIconOnly
          aria-label="Add"
          className="sm:hidden"
          onPress={() => setShowAdd(true)}
        >
          <Plus size={20} weight="bold" />
        </AppButton>
        <AppButton
          className="hidden sm:inline-flex"
          label="Add"
          startContent={<Plus weight="bold" />}
          onPress={() => setShowAdd(true)}
        />

        <ThemeToggle />

        <Popover>
          <Popover.Trigger>
            <AppButton isIconOnly variant="ghost" aria-label={`Notifications, ${unreadCount} unread`}>
              <Badge.Anchor>
                <Bell size={20} />
                {unreadCount > 0 ? (
                  <Badge size="sm" className="bg-secondary text-secondary-foreground">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </Badge>
                ) : null}
              </Badge.Anchor>
            </AppButton>
          </Popover.Trigger>

          <Popover.Content placement="bottom end" className="w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-overlay p-0">
            <Popover.Dialog className="p-0 outline-none">
              <div className="flex items-center justify-between px-5 pt-4 pb-3">
                <div>
                  <p className="text-[15px] font-bold text-foreground">Notifications</p>
                  <p className="text-xs text-muted">
                    {unreadCount > 0 ? `${unreadCount} unread` : "You are all caught up"}
                  </p>
                </div>
                {unreadCount > 0 ? (
                  <AppButton size="sm" variant="ghost" startContent={<Checks />} label="Mark all read" onPress={markAllAsRead} />
                ) : null}
              </div>

              <div className="max-h-[380px] overflow-y-auto px-2 pb-2">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                    <span className="grid size-12 place-items-center rounded-2xl bg-default text-muted">
                      <BellSlash size={24} aria-hidden="true" />
                    </span>
                    <p className="text-[13px] font-medium text-foreground">No notifications yet</p>
                    <p className="text-xs text-muted">Reminders and items to review appear here.</p>
                  </div>
                ) : (
                  <ListBox
                    aria-label="Notifications"
                    selectionMode="none"
                    onAction={(key) => {
                      markAsRead(String(key));
                      const link = notifications.find((item) => item.id === String(key))?.link;
                      if (link) router.push(link);
                    }}
                  >
                    {notifications.map((item) => (
                      <ListBox.Item key={item.id} id={item.id} textValue={item.title} className="items-start gap-3 rounded-xl px-3 py-3">
                        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.isRead ? "bg-transparent" : "bg-secondary"}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className={`truncate text-[13px] ${item.isRead ? "text-muted" : "font-medium text-foreground"}`}>
                              {item.title}
                            </span>
                            <span className="shrink-0 text-[11px] text-muted">{timeAgo(item.createdAt)}</span>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted">{item.message}</p>
                        </div>
                      </ListBox.Item>
                    ))}
                  </ListBox>
                )}
              </div>
            </Popover.Dialog>
          </Popover.Content>
        </Popover>

        <Dropdown>
          <Dropdown.Trigger
            aria-label="Account"
            className="ml-2 flex cursor-pointer items-center gap-3 border-l border-separator pl-4 text-left outline-none"
          >
            <div className="hidden text-right lg:block">
              <p className="text-[13px] leading-tight font-medium text-foreground">{user?.display_name || "Account"}</p>
              <p className="text-xs text-muted">{scope.active?.name ?? modeLabel(scope.mode)}</p>
            </div>
            <Avatar size="sm" className="bg-primary text-primary-foreground">
              <Avatar.Fallback className="text-xs font-bold">{getInitials(user?.display_name) || "R"}</Avatar.Fallback>
            </Avatar>
          </Dropdown.Trigger>
          <Dropdown.Popover placement="bottom end" className="min-w-[190px] rounded-2xl bg-overlay p-1">
            <Dropdown.Menu
              aria-label="Account"
              onAction={(key) => {
                if (key === "settings") router.push("/settings");
                if (key === "signout") void signOut();
              }}
            >
              <Dropdown.Item id="settings" textValue="Settings" className="rounded-xl px-3 py-2 text-[13px]">
                <GearSix size={16} aria-hidden="true" />
                Settings
              </Dropdown.Item>
              <Dropdown.Item id="signout" textValue="Sign out" className="rounded-xl px-3 py-2 text-[13px] text-danger">
                <SignOut size={16} aria-hidden="true" />
                Sign out
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>

      <AppModal isOpen={showAdd} onOpenChange={setShowAdd} title={`Add to ${modeLabel(scope.mode)}`} size="sm">
        <div className="grid gap-2 pb-2">
          {addActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              onClick={() => setShowAdd(false)}
              className="rounded-2xl bg-surface-secondary px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-primary-soft hover:text-primary-soft-foreground"
            >
              {action.label}
            </Link>
          ))}
        </div>
      </AppModal>
    </header>
  );
}
