"use client";

// Thin connection banner across the top of the app:
// - offline  → red, stays until the connection returns
// - slow     → warning, while the network is degraded
// - restored → green "Back online", then hides itself

import { CheckCircle, WarningCircle, WifiSlash } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import { API_BASE_URL } from "@/lib/api";

type NetState = "ok" | "offline" | "slow" | "restored";

type NetworkInformation = EventTarget & { effectiveType?: string };

const SLOW_PROBE_MS = 2500;
const PROBE_INTERVAL_MS = 30_000;

function networkInformation(): NetworkInformation | undefined {
  return (navigator as Navigator & { connection?: NetworkInformation }).connection;
}

function connectionIsSlow(): boolean {
  // Only trust the coarse 2G class; finer browser estimates are rounded and
  // capped, so real latency comes from the health probe instead.
  const type = networkInformation()?.effectiveType;
  return type === "slow-2g" || type === "2g";
}

export function NetworkBanner() {
  const [state, setState] = useState<NetState>("ok");
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const stateRef = useRef<NetState>("ok");
  const restoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        if (reg.waiting) {
          setWaitingWorker(reg.waiting);
        }
        reg.addEventListener("updatefound", () => {
          const next = reg.installing;
          if (!next) return;
          next.addEventListener("statechange", () => {
            if (next.state === "installed" && navigator.serviceWorker.controller) {
              setWaitingWorker(next);
            }
          });
        });
      })
      .catch(() => {
        // Service worker registration is progressive; ignore on unsupported origins.
      });
  }, []);

  useEffect(() => {
    const set = (next: NetState) => {
      if (restoreTimer.current) clearTimeout(restoreTimer.current);
      const previous = stateRef.current;
      // Coming back from a bad state: flash green, then hide.
      if (next === "ok" && (previous === "offline" || previous === "slow")) {
        stateRef.current = "restored";
        setState("restored");
        restoreTimer.current = setTimeout(() => {
          stateRef.current = "ok";
          setState("ok");
        }, 2000);
        return;
      }
      if (next === "ok" && previous === "restored") return;
      stateRef.current = next;
      setState(next);
    };

    const evaluate = () => {
      if (!navigator.onLine) return set("offline");
      set(connectionIsSlow() ? "slow" : "ok");
    };

    // One slow response can be a cold server, so it takes two in a row to warn.
    let slowStreak = 0;
    const probe = async () => {
      if (!navigator.onLine) return set("offline");
      const started = performance.now();
      try {
        await fetch(`${API_BASE_URL}/health/live`, { cache: "no-store", credentials: "omit" });
        slowStreak = performance.now() - started > SLOW_PROBE_MS ? slowStreak + 1 : 0;
        set(slowStreak >= 2 || connectionIsSlow() ? "slow" : "ok");
      } catch {
        // Server unreachable but device online: not a network problem we can label.
        evaluate();
      }
    };

    const connection = networkInformation();
    window.addEventListener("online", probe);
    window.addEventListener("offline", evaluate);
    connection?.addEventListener("change", evaluate);
    const initial = setTimeout(probe, 0);
    const interval = setInterval(probe, PROBE_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", probe);
      window.removeEventListener("offline", evaluate);
      connection?.removeEventListener("change", evaluate);
      clearTimeout(initial);
      clearInterval(interval);
      if (restoreTimer.current) clearTimeout(restoreTimer.current);
    };
  }, []);

  if (state === "ok") {
    if (!waitingWorker) return null;
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex h-9 shrink-0 items-center justify-center gap-3 bg-accent px-4 text-[13px] font-medium text-accent-foreground"
      >
        <span>Update available for Rekordly. Local drafts remain safe.</span>
        <button
          type="button"
          className="rounded-md bg-background/20 px-2.5 py-0.5 text-[12px] font-semibold hover:bg-background/30"
          onClick={() => {
            waitingWorker.postMessage({ type: "SKIP_WAITING" });
            window.location.reload();
          }}
        >
          Apply update
        </button>
      </div>
    );
  }

  const config = {
    offline: {
      className: "bg-danger text-danger-foreground",
      icon: WifiSlash,
      text: "No internet connection. Changes won’t save until you’re back online.",
    },
    slow: {
      className: "bg-warning text-warning-foreground",
      icon: WarningCircle,
      text: "Slow connection. Some data may take longer to load.",
    },
    restored: {
      className: "bg-success text-success-foreground",
      icon: CheckCircle,
      text: "Back online.",
    },
  }[state];
  const Icon = config.icon;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex h-8 shrink-0 items-center justify-center gap-2 px-4 text-[13px] font-medium ${config.className}`}
    >
      <Icon size={16} weight="bold" aria-hidden="true" />
      <span className="truncate">{config.text}</span>
    </div>
  );
}
