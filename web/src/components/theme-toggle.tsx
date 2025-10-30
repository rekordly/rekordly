// src/components/theme-toggle.tsx
"use client";

import { Button } from "@heroui/button";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import clsx from "clsx";

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        isIconOnly
        variant="light"
        className=""
        aria-label="Toggle theme"
      >
        <Sun className="size-4" />
      </Button>
    );
  }

  return (
    <Button
      isIconOnly
      variant="flat"
      className={clsx(
        "border-0 transition-colors bg-background",
      )}
      onPress={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <Sun className="size-4 text-brand" />
      ) : (
        <Moon className="size-4 text-brand" />
      )}
    </Button>
  );
}
// className="fixed bottom-6 right-6 z-50"