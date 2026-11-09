import { Suspense, type ReactNode } from "react";

import { GuestRoute, RouteLoading } from "@/components/auth/route-guards";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function AuthLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <Suspense fallback={<RouteLoading />}>
      <GuestRoute>
        <div className="relative flex min-h-dvh w-full flex-col overflow-x-hidden bg-background text-foreground md:h-dvh md:flex-row md:overflow-hidden">
          {/* Brand panel */}
          <aside
            aria-label="About Rekordly"
            className="hidden flex-col justify-between bg-brand-panel p-12 text-brand-panel-foreground md:flex md:h-dvh md:w-1/2 md:shrink-0"
          >
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" className="size-8 rounded-lg" />
              <span className="font-heading text-lg font-bold tracking-tight">Rekordly</span>
            </div>
            <div className="max-w-md">
              <h1 className="text-[26px] leading-[1.25] font-semibold tracking-[-0.02em]">
                Know where your money goes. Keep your business records clear.
              </h1>
              <p className="mt-3 text-[14px] opacity-75">
                Income, expenses and business books in one dependable workspace, without accounting confusion.
              </p>
            </div>
            <p className="text-xs opacity-70">Built for everyday Nigerian businesses and personal finance</p>
          </aside>

          {/* Form */}
          <div className="flex min-h-dvh w-full flex-col overflow-x-hidden md:h-dvh md:min-h-0 md:w-1/2 md:overflow-y-auto">
            {children}
          </div>
          <div className="fixed right-5 bottom-5 z-20 sm:right-7 sm:bottom-7">
            <ThemeToggle />
          </div>
        </div>
      </GuestRoute>
    </Suspense>
  );
}
