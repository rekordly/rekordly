import { Suspense, type ReactNode } from "react";

import { GuestRoute, RouteLoading } from "@/components/auth/route-guards";
import { ThemeToggle } from "@/components/ui";

export default function AuthLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <Suspense fallback={<RouteLoading />}>
      <GuestRoute>
        <div className="relative flex min-h-dvh w-full flex-col overflow-x-hidden bg-background text-foreground md:h-dvh md:flex-row md:overflow-hidden">
      <aside
        aria-label="Rekordly visual showcase"
        className="relative hidden overflow-hidden bg-[#063d18] text-white md:flex md:h-dvh md:w-7/12 md:shrink-0 md:flex-col"
      >
        <div className="relative z-10 p-10 lg:p-12">
          <div className="font-heading text-2xl font-bold tracking-tight">Rekordly</div>
        </div>
        <div className="relative z-10 my-auto max-w-xl p-10 lg:p-12">
          <div className="mb-7 h-1 w-14 rounded-full bg-[#fa8901]" />
          <p className="font-heading text-4xl font-bold leading-[1.08] tracking-[-0.035em] lg:text-5xl">
            Know where your money goes. Keep your business records clear.
          </p>
          <p className="mt-6 max-w-xl text-[15px] leading-7 text-white/70">
            Income, expenses and business books in one dependable workspace—without accounting confusion.
          </p>
        </div>
        <div className="relative z-10 p-10 text-xs text-white/65 lg:p-12">
          <span className="mr-2 inline-block size-1.5 rounded-full bg-[#36c75b]" />
          Built for everyday Nigerian businesses and personal finance
        </div>
      </aside>

      {/* Authentication form panel */}
      <div className="flex min-h-dvh w-full flex-col overflow-x-hidden md:h-dvh md:min-h-0 md:w-5/12 md:overflow-hidden">
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
