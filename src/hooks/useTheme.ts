import { useState, useEffect, useCallback } from "react";

type ThemeMode = "light" | "dark" | "system";

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(mode: ThemeMode) {
  const resolved = mode === "system" ? getSystemTheme() : mode;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem("theme-mode") as ThemeMode | null;
    return saved || "light";
  });

  useEffect(() => {
    applyTheme(mode);
    localStorage.setItem("theme-mode", mode);
  }, [mode]);

  // Listen for system theme changes when in "system" mode
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  const cycleTheme = useCallback(() => {
    setMode((prev) => {
      if (prev === "light") return "dark";
      if (prev === "dark") return "system";
      return "light";
    });
  }, []);

  return { mode, setMode, cycleTheme };
}
