"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type ThemeMode = "dark" | "light";

const THEME_STORAGE_KEY = "design-studio-theme";

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "dark" || value === "light";
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof document !== "undefined") {
      const currentTheme = document.documentElement.dataset.theme ?? null;
      if (isThemeMode(currentTheme)) return currentTheme;
    }
    if (typeof localStorage !== "undefined") {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (isThemeMode(savedTheme)) return savedTheme;
    }
    return "dark";
  });

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    applyTheme(theme);
  }, [theme]);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  }

  const isLight = theme === "light";

  return (
    <button
      aria-label={isLight ? "切换黑夜模式" : "切换白天模式"}
      className={`theme-toggle ${pathname === "/" ? "theme-toggle-workbench" : ""}`}
      onClick={toggleTheme}
      suppressHydrationWarning
      title={isLight ? "黑夜模式" : "白天模式"}
      type="button"
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        {isLight ? <Moon className="size-4" /> : <Sun className="size-4" />}
      </span>
      <span className="theme-toggle-label">{isLight ? "黑夜" : "白天"}</span>
    </button>
  );
}
