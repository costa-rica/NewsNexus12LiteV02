"use client";

import { Moon, Sun } from "lucide-react";

import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === "dark" ? "light" : "dark";
  const label = `Switch to ${nextTheme} theme`;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={toggleTheme}
      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-white text-gray-700 shadow-theme-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
    >
      {theme === "dark" ? (
        <Sun aria-hidden="true" className="h-4 w-4" />
      ) : (
        <Moon aria-hidden="true" className="h-4 w-4" />
      )}
    </button>
  );
}
