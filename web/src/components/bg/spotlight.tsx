"use client";
import React, { ReactNode } from "react";

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

interface SpotlightBackgroundProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  showRadialGradient?: boolean;
}

export default function SpotlightBackground({
  className,
  children,
  showRadialGradient = true,
  ...props
}: SpotlightBackgroundProps) {
  return (
    <main>
      <style jsx global>{`
        @keyframes aurora {
          from {
            background-position: 50% 50%, 50% 50%;
          }
          to {
            background-position: 350% 50%, 350% 50%;
          }
        }
        .animate-aurora {
          animation: aurora 60s linear infinite;
        }
      `}</style>
      <div
        className={cn(
          "transition-bg relative flex h-[100vh] flex-col items-center justify-center text-slate-50",
          className
        )}
        style={{ backgroundColor: "#050b00" }}
        {...props}
      >
        <div className="absolute inset-0 overflow-hidden">
          <div
            className={cn(
              "animate-aurora pointer-events-none absolute -inset-[10px] opacity-60 blur-[10px] filter will-change-transform",
              showRadialGradient &&
                "[mask-image:radial-gradient(ellipse_at_100%_0%,black_10%,transparent_70%)]"
            )}
            style={{
              backgroundImage: "repeating-linear-gradient(100deg, #0a1401 0%, #0a1401 7%, transparent 10%, transparent 12%, #0a1401 16%), repeating-linear-gradient(100deg, #45b910 10%, #90e76e 15%, #54d334 20%, #9fef86 25%, #14b822 30%)",
              backgroundSize: "300%, 200%",
              backgroundPosition: "50% 50%, 50% 50%",
            }}
          />
        </div>
        {children}
      </div>
    </main>
  );
}

