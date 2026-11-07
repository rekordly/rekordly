"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Button } from "./button";

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const { resolvedTheme, setTheme } = useTheme();

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="tertiary"
      size="sm"
      isIconOnly
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onPress={() => setTheme(isDark ? "light" : "dark")}
      className="border-border bg-surface text-foreground shadow-2xs"
    >
      {isDark ? (
        <Sun className="size-4 text-secondary" aria-hidden="true" />
      ) : (
        <Moon className="size-4 text-primary" aria-hidden="true" />
      )}
    </Button>
  );
}
