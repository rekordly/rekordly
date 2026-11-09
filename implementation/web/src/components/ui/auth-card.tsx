"use client";

import { Card as HeroCard, cn } from "@heroui/react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export interface AuthCardProps {
  title: string;
  subtitle?: ReactNode;
  alert?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3" role="separator" aria-orientation="horizontal">
      <span className="h-px flex-1 bg-separator" aria-hidden="true" />
      <span className="text-xs text-muted">{label}</span>
      <span className="h-px flex-1 bg-separator" aria-hidden="true" />
    </div>
  );
}

export function AuthCard({ title, subtitle, alert, children, footer, className }: AuthCardProps) {
  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-6 p-6 md:min-h-full">
      {/* The brand panel is hidden on phones, so the logo sits above the card there. */}
      <Link href="/login" aria-label="Rekordly home" className="md:hidden">
        <Image src="/logo.png" alt="Rekordly" width={40} height={40} priority className="size-10 rounded-xl" />
      </Link>

      <HeroCard.Root
        variant="transparent"
        className={cn("w-full max-w-[420px] gap-0 rounded-3xl border-0 bg-surface p-8 shadow-none sm:p-10", className)}
      >
        <HeroCard.Header className="flex flex-col items-start gap-1 p-0 text-left">
          <HeroCard.Title className="font-heading text-[20px] font-semibold tracking-[-0.02em] text-foreground">
            {title}
          </HeroCard.Title>
          {subtitle ? (
            <HeroCard.Description className="text-[13px] text-muted">{subtitle}</HeroCard.Description>
          ) : null}
        </HeroCard.Header>

        {alert ? <div className="mt-5 w-full">{alert}</div> : null}

        <HeroCard.Content className="mt-6 flex w-full flex-col gap-4 p-0">{children}</HeroCard.Content>

        {footer ? <HeroCard.Footer className="mt-4 flex w-full flex-col gap-2 p-0">{footer}</HeroCard.Footer> : null}
      </HeroCard.Root>
    </div>
  );
}
