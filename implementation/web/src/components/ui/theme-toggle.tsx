"use client";

import { Moon, Sun } from "@phosphor-icons/react";
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
      variant="ghost"
      size="sm"
      isIconOnly
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onPress={() => setTheme(isDark ? "light" : "dark")}
      className="border-0 bg-transparent text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground focus:outline-none"
    >
      {isDark ? (
        <Sun size={18} weight="duotone" className="text-primary" aria-hidden="true" />
      ) : (
        <Moon size={18} weight="duotone" className="text-primary" aria-hidden="true" />
      )}
    </Button>
  );
}
