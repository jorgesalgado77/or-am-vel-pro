/**
 * Color Theme System — 10 selectable color palettes + default
 * Persists choice to localStorage and applies CSS variables.
 */

export interface ColorTheme {
  id: string;
  name: string;
  primary: string; // HSL values e.g. "199 89% 40%"
  accent: string;
  sidebar_primary: string;
  ring: string;
  preview: string; // hex for visual preview
}

export const COLOR_THEMES: ColorTheme[] = [
  {
    id: "default",
    name: "Padrão (Azul)",
    primary: "199 89% 40%",
    accent: "160 84% 39%",
    sidebar_primary: "199 89% 40%",
    ring: "199 89% 40%",
    preview: "#0891b2",
  },
  {
    id: "ocean",
    name: "Oceano",
    primary: "217 91% 50%",
    accent: "199 89% 48%",
    sidebar_primary: "217 91% 50%",
    ring: "217 91% 50%",
    preview: "#2563eb",
  },
  {
    id: "emerald",
    name: "Esmeralda",
    primary: "160 84% 39%",
    accent: "142 76% 36%",
    sidebar_primary: "160 84% 39%",
    ring: "160 84% 39%",
    preview: "#10b981",
  },
  {
    id: "violet",
    name: "Violeta",
    primary: "263 70% 50%",
    accent: "280 65% 60%",
    sidebar_primary: "263 70% 50%",
    ring: "263 70% 50%",
    preview: "#7c3aed",
  },
  {
    id: "rose",
    name: "Rosa",
    primary: "346 77% 50%",
    accent: "330 80% 60%",
    sidebar_primary: "346 77% 50%",
    ring: "346 77% 50%",
    preview: "#e11d48",
  },
  {
    id: "amber",
    name: "Âmbar",
    primary: "38 92% 50%",
    accent: "25 95% 53%",
    sidebar_primary: "38 92% 50%",
    ring: "38 92% 50%",
    preview: "#f59e0b",
  },
  {
    id: "teal",
    name: "Turquesa",
    primary: "174 84% 32%",
    accent: "160 84% 39%",
    sidebar_primary: "174 84% 32%",
    ring: "174 84% 32%",
    preview: "#0d9488",
  },
  {
    id: "indigo",
    name: "Índigo",
    primary: "239 84% 67%",
    accent: "224 76% 48%",
    sidebar_primary: "239 84% 67%",
    ring: "239 84% 67%",
    preview: "#6366f1",
  },
  {
    id: "slate",
    name: "Grafite",
    primary: "215 20% 40%",
    accent: "215 16% 47%",
    sidebar_primary: "215 20% 40%",
    ring: "215 20% 40%",
    preview: "#64748b",
  },
  {
    id: "crimson",
    name: "Carmesim",
    primary: "0 72% 51%",
    accent: "15 80% 50%",
    sidebar_primary: "0 72% 51%",
    ring: "0 72% 51%",
    preview: "#dc2626",
  },
  {
    id: "forest",
    name: "Floresta",
    primary: "142 76% 28%",
    accent: "160 84% 30%",
    sidebar_primary: "142 76% 28%",
    ring: "142 76% 28%",
    preview: "#15803d",
  },
];

const THEME_STORAGE_KEY = "app_color_theme";

export function getStoredThemeId(): string {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || "default";
  } catch {
    return "default";
  }
}

export function getThemeById(id: string): ColorTheme {
  return COLOR_THEMES.find(t => t.id === id) || COLOR_THEMES[0];
}

export function applyTheme(themeId: string) {
  const theme = getThemeById(themeId);
  const root = document.documentElement;

  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--ring", theme.ring);
  root.style.setProperty("--sidebar-primary", theme.sidebar_primary);
  root.style.setProperty("--sidebar-ring", theme.ring);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--success", theme.accent);

  // Also set dark mode primary (slightly lighter)
  // This happens via CSS already if the HSL values are set at :root level

  try {
    localStorage.setItem(THEME_STORAGE_KEY, themeId);
  } catch {
    // localStorage unavailable
  }
}

export function resetToDefaultTheme() {
  applyTheme("default");
}

/**
 * Initialize theme on app startup — call once.
 */
export function initializeTheme() {
  const storedId = getStoredThemeId();
  if (storedId !== "default") {
    applyTheme(storedId);
  }
}
