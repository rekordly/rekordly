"use client";

import type { ReactNode } from "react";

import { NetworkBanner } from "./network-banner";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

/** The signed-in frame. Session checks happen in ProtectedRoute before this renders. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <NetworkBanner />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <Topbar />
          <main className="flex-1 px-4 pt-2 pb-10 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
