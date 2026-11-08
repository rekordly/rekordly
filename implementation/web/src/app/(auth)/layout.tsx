import type { ReactNode } from "react";

export default function AuthLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="flex min-h-dvh w-full flex-col overflow-x-hidden bg-background text-foreground md:h-dvh md:flex-row md:overflow-hidden">
      <aside
        aria-label="Rekordly visual showcase"
        className="relative hidden overflow-hidden bg-[#063d18] text-white md:flex md:h-dvh md:w-1/2 md:shrink-0 md:flex-col"
      >
        <div className="absolute -top-28 -right-28 size-80 rounded-full border border-white/10 bg-white/[0.035]" />
        <div className="absolute right-16 bottom-24 size-40 rounded-full border border-white/10" />
        <div className="relative z-10 p-10 lg:p-12">
          <div className="font-heading text-xl font-bold tracking-tight">Rekordly</div>
        </div>
        <div className="relative z-10 my-auto max-w-xl p-10 lg:p-12">
          <p className="font-heading text-3xl font-semibold leading-[1.15] tracking-[-0.025em] lg:text-[2.5rem]">
            Know where your money goes.
          </p>
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/65">
            Personal money and business records, clearly organised.
          </p>
        </div>
      </aside>

      {/* Authentication form panel */}
      <div className="flex min-h-dvh w-full flex-col overflow-x-hidden md:h-dvh md:min-h-0 md:w-1/2 md:overflow-hidden">
        {children}
      </div>
    </div>
  );
}
