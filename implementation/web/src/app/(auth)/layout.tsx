import Image from "next/image";
import type { ReactNode } from "react";

export default function AuthLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="flex min-h-dvh w-full flex-col overflow-x-hidden bg-background text-foreground md:flex-row">
      {/* Desktop branded visual area (V1 split-screen continuation) */}
      <aside
        aria-label="Rekordly visual showcase"
        className="relative hidden max-h-dvh overflow-hidden border-r border-border bg-secondary-soft/45 md:sticky md:top-0 md:flex md:h-dvh md:w-7/12 md:items-center md:justify-center dark:bg-surface"
      >
        <div className="relative flex h-full w-full items-center justify-center p-6 lg:p-10">
          <Image
            src="/illustration.svg"
            alt="Rekordly bookkeeping and business management illustration"
            width={1109}
            height={1080}
            priority
            className="max-h-full w-auto max-w-full rounded-3xl object-contain shadow-xs dark:opacity-90"
          />
        </div>
      </aside>

      {/* Authentication form panel */}
      <div className="flex min-h-dvh w-full flex-col overflow-x-hidden overflow-y-auto md:w-5/12">
        {children}
      </div>
    </div>
  );
}
