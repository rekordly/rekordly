"use client";

import { Card as HeroCard, cn, Separator as HeroSeparator } from "@heroui/react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { ThemeToggle } from "./theme-toggle";

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
    <div
      className="my-5 flex items-center gap-3 px-1"
      role="separator"
      aria-orientation="horizontal"
    >
      <HeroSeparator isDecorative className="h-px flex-1 bg-border" />
      <span className="font-sans text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <HeroSeparator isDecorative className="h-px flex-1 bg-border" />
    </div>
  );
}

export function AuthCard({
  title,
  subtitle,
  alert,
  children,
  footer,
  className,
}: AuthCardProps) {
  return (
    <div className="flex min-h-dvh w-full flex-col justify-between px-5 py-6 sm:px-8 md:px-10 md:py-8">
      {/* Top bar with Rekordly branding and theme toggle */}
      <header className="mx-auto flex w-full max-w-md items-center justify-between gap-4">
        <Link
          href="/login"
          aria-label="Rekordly home"
          className="inline-flex items-center gap-2 rounded-lg py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <Image
            src="/rekordly-logo.svg"
            alt="Rekordly"
            width={136}
            height={33}
            priority
            className="h-8 w-auto object-contain"
          />
        </Link>
        <ThemeToggle />
      </header>

      {/* Main compact authentication surface */}
      <main className="mx-auto my-auto flex w-full max-w-[var(--auth-form-max-width)] flex-col py-6 sm:py-8">
        <HeroCard.Root
          variant="transparent"
          className={cn(
            "w-full border-0 bg-transparent p-0 shadow-none",
            className,
          )}
        >
          <HeroCard.Header className="mb-6 flex flex-col items-center gap-1.5 p-0 text-center">
            <HeroCard.Title className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {title}
            </HeroCard.Title>
            {subtitle ? (
              <HeroCard.Description className="font-sans text-sm leading-relaxed text-muted-foreground">
                {subtitle}
              </HeroCard.Description>
            ) : null}
          </HeroCard.Header>

          {alert ? <div className="mb-5 w-full">{alert}</div> : null}

          <HeroCard.Content className="flex w-full flex-col gap-4 p-0">
            {children}
          </HeroCard.Content>

          {footer ? (
            <HeroCard.Footer className="mt-6 flex w-full flex-col gap-3 p-0">
              {footer}
            </HeroCard.Footer>
          ) : null}
        </HeroCard.Root>
      </main>

      {/* Subtle compliance / trust footer */}
      <footer className="mx-auto flex w-full max-w-md items-center justify-center gap-4 text-center font-sans text-xs text-muted-foreground">
        <span>Rekordly — Trustworthy books for your business & personal money</span>
      </footer>
    </div>
  );
}
