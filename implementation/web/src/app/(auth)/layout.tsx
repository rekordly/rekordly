import type { ReactNode } from "react";

export default function AuthLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="flex min-h-dvh w-full flex-col overflow-x-hidden bg-background text-foreground md:flex-row">
      <aside
        aria-label="Rekordly visual showcase"
        className="relative hidden max-h-dvh overflow-hidden bg-[#063d18] text-white md:sticky md:top-0 md:flex md:h-dvh md:w-1/2 md:flex-col md:justify-between"
      >
        <div className="absolute -top-28 -right-28 size-80 rounded-full border border-white/10 bg-white/[0.035]" />
        <div className="absolute right-16 bottom-24 size-40 rounded-full border border-white/10" />
        <div className="relative z-10 p-10 lg:p-14">
          <div className="font-heading text-2xl font-bold tracking-tight">Rekordly</div>
        </div>
        <div className="relative z-10 max-w-xl p-10 lg:p-14">
          <div className="mb-5 h-1 w-12 rounded-full bg-[#fa8901]" />
          <p className="font-heading text-3xl font-semibold leading-tight lg:text-4xl">
            Know where your money goes. Keep your business records clear.
          </p>
          <p className="mt-5 max-w-md text-sm leading-6 text-white/70">
            Income, expenses and business books in one dependable workspace—without accounting confusion.
          </p>
        </div>
        <div className="relative z-10 flex items-center gap-2 p-10 text-xs text-white/55 lg:p-14">
          <span className="size-1.5 rounded-full bg-[#36c75b]" />
          Built for everyday Nigerian businesses and personal finance
        </div>
      </aside>

      {/* Authentication form panel */}
      <div className="flex min-h-dvh w-full flex-col overflow-x-hidden overflow-y-auto md:w-1/2">
        {children}
      </div>
    </div>
  );
}
