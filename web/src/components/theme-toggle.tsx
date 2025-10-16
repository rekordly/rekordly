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
        className="fixed bottom-6 right-6 z-50"
        aria-label="Toggle theme"
      >
        <Sun className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <Button
      isIconOnly
      variant="flat"
      className={clsx(
        "fixed bottom-6 right-6 z-50 transition-colors border-brand border",
      )}
      onPress={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <Sun className="h-5 w-5 text-brand" />
      ) : (
        <Moon className="h-5 w-5 text-brand" />
      )}
    </Button>
  );
}