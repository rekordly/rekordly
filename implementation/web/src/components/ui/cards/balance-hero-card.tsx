"use client";

// 2. Hero balance: the one big brand-green card with the total and two actions.
// White and dark buttons, soft rings in the background. Same in both themes.

import { Eye, EyeSlash, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";

import { CardSkeleton, DeltaChip, type Delta } from "./card-frame";

export interface HeroAction {
  label: string;
  icon?: PhosphorIcon;
  onPress: () => void;
}

export interface BalanceHeroCardProps {
  label: string;
  value: ReactNode;
  /** Shown next to the amount, e.g. "NGN". */
  unit?: string;
  delta?: Delta;
  caption?: ReactNode;
  /** First action is white, second is dark. */
  actions?: [HeroAction] | [HeroAction, HeroAction];
  /** Corner control, e.g. a "+" button or account picker. */
  corner?: ReactNode;
  loading?: boolean;
  className?: string;
}

export function BalanceHeroCard({ label, value, unit, delta, caption, actions, corner, loading, className = "" }: BalanceHeroCardProps) {
  const [hidden, setHidden] = useState(false);
  if (loading) return <CardSkeleton className={className} lines={4} />;

  return (
    <section className={`relative flex flex-col overflow-hidden rounded-2xl bg-primary p-5 text-white ${className}`}>
      {/* Decorative rings */}
      <span aria-hidden="true" className="pointer-events-none absolute -right-16 -bottom-24 size-72 rounded-full border-[28px] border-white/10" />
      <span aria-hidden="true" className="pointer-events-none absolute -right-2 -bottom-10 size-40 rounded-full border-[18px] border-white/10" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-[14px] font-semibold">{label}</p>
          <button
            type="button"
            onClick={() => setHidden(!hidden)}
            aria-label={hidden ? "Show amount" : "Hide amount"}
            className="grid size-7 cursor-pointer place-items-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
          >
            {hidden ? <EyeSlash size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
          </button>
        </div>
        {corner}
      </div>

      <p className="relative mt-3 flex items-baseline gap-2">
        <span className="text-[34px] leading-none font-bold tracking-tight tabular">{hidden ? "••••••" : value}</span>
        {unit ? <span className="text-[14px] font-semibold text-white/80">{unit}</span> : null}
      </p>
      <div className="relative mt-2.5 min-h-5">
        {delta ? <DeltaChip delta={delta} tone="brand" /> : caption ? <p className="text-[12px] text-white/75">{caption}</p> : null}
      </div>

      {actions ? (
        <div className="relative mt-auto grid grid-cols-2 gap-2.5 pt-5">
          {actions.map((action, index) => {
            const ActionIcon = action.icon;
            return (
              <button
                key={action.label}
                type="button"
                onClick={action.onPress}
                className={`inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full text-[13px] font-semibold transition-opacity hover:opacity-90 ${
                  index === 0 ? "bg-white text-neutral-900" : "bg-[#0b2e12] text-white"
                }`}
              >
                {action.label}
                {ActionIcon ? <ActionIcon size={15} weight="bold" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
