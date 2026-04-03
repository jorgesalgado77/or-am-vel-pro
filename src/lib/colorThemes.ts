/**
 * Color Theme System — 10 selectable color palettes + default
 * Persists choice to localStorage and applies CSS variables.
 * The theme colors the sidebar BACKGROUND, with contrasting foreground.
 */

export interface ColorTheme {
  id: string;
  name: string;
  // Sidebar colors (the main visual impact)
  sidebar_bg: string;       // sidebar background — the dominant color
  sidebar_fg: string;       // sidebar text — contrasts with bg
  sidebar_primary: string;  // active item highlight
  sidebar_primary_fg: string;
  sidebar_accent: string;   // hover/secondary items
  sidebar_accent_fg: string;
  sidebar_border: string;
  // App-wide accent
  primary: string;
  accent: string;
  ring: string;
  preview: string; // hex for visual preview swatch
}

export const COLOR_THEMES: ColorTheme[] = [
  {
    id: "default",
    name: "Padrão",
    sidebar_bg: "0 0% 100%",
    sidebar_fg: "222 47% 11%",
    sidebar_primary: "199 89% 40%",
    sidebar_primary_fg: "0 0% 100%",
    sidebar_accent: "210 20% 96%",
    sidebar_accent_fg: "222 47% 11%",
    sidebar_border: "220 13% 91%",
    primary: "199 89% 40%",
    accent: "160 84% 39%",
    ring: "199 89% 40%",
    preview: "#ffffff",
  },
  {
    id: "ocean",
    name: "Oceano",
    sidebar_bg: "217 91% 22%",
    sidebar_fg: "210 40% 96%",
    sidebar_primary: "199 89% 60%",
    sidebar_primary_fg: "217 91% 12%",
    sidebar_accent: "217 80% 30%",
    sidebar_accent_fg: "210 40% 96%",
    sidebar_border: "217 70% 28%",
    primary: "217 91% 50%",
    accent: "199 89% 48%",
    ring: "217 91% 50%",
    preview: "#1e3a6e",
  },
  {
    id: "emerald",
    name: "Esmeralda",
    sidebar_bg: "160 84% 18%",
    sidebar_fg: "160 20% 96%",
    sidebar_primary: "160 84% 55%",
    sidebar_primary_fg: "160 84% 10%",
    sidebar_accent: "160 60% 26%",
    sidebar_accent_fg: "160 20% 96%",
    sidebar_border: "160 50% 24%",
    primary: "160 84% 39%",
    accent: "142 76% 36%",
    ring: "160 84% 39%",
    preview: "#064e3b",
  },
  {
    id: "violet",
    name: "Violeta",
    sidebar_bg: "263 70% 22%",
    sidebar_fg: "263 20% 96%",
    sidebar_primary: "263 70% 65%",
    sidebar_primary_fg: "0 0% 100%",
    sidebar_accent: "263 50% 32%",
    sidebar_accent_fg: "263 20% 96%",
    sidebar_border: "263 40% 28%",
    primary: "263 70% 50%",
    accent: "280 65% 60%",
    ring: "263 70% 50%",
    preview: "#3b1578",
  },
  {
    id: "rose",
    name: "Rosa",
    sidebar_bg: "346 77% 22%",
    sidebar_fg: "346 20% 96%",
    sidebar_primary: "346 77% 60%",
    sidebar_primary_fg: "0 0% 100%",
    sidebar_accent: "346 60% 32%",
    sidebar_accent_fg: "346 20% 96%",
    sidebar_border: "346 50% 28%",
    primary: "346 77% 50%",
    accent: "330 80% 60%",
    ring: "346 77% 50%",
    preview: "#7f1d3a",
  },
  {
    id: "amber",
    name: "Âmbar",
    sidebar_bg: "28 80% 20%",
    sidebar_fg: "38 30% 96%",
    sidebar_primary: "38 92% 60%",
    sidebar_primary_fg: "28 80% 10%",
    sidebar_accent: "28 60% 30%",
    sidebar_accent_fg: "38 30% 96%",
    sidebar_border: "28 50% 26%",
    primary: "38 92% 50%",
    accent: "25 95% 53%",
    ring: "38 92% 50%",
    preview: "#78400c",
  },
  {
    id: "teal",
    name: "Turquesa",
    sidebar_bg: "174 84% 16%",
    sidebar_fg: "174 20% 96%",
    sidebar_primary: "174 84% 50%",
    sidebar_primary_fg: "174 84% 8%",
    sidebar_accent: "174 60% 24%",
    sidebar_accent_fg: "174 20% 96%",
    sidebar_border: "174 50% 22%",
    primary: "174 84% 32%",
    accent: "160 84% 39%",
    ring: "174 84% 32%",
    preview: "#134e4a",
  },
  {
    id: "indigo",
    name: "Índigo",
    sidebar_bg: "239 60% 22%",
    sidebar_fg: "239 20% 96%",
    sidebar_primary: "239 84% 72%",
    sidebar_primary_fg: "0 0% 100%",
    sidebar_accent: "239 50% 32%",
    sidebar_accent_fg: "239 20% 96%",
    sidebar_border: "239 40% 28%",
    primary: "239 84% 67%",
    accent: "224 76% 48%",
    ring: "239 84% 67%",
    preview: "#312e81",
  },
  {
    id: "slate",
    name: "Grafite",
    sidebar_bg: "215 28% 17%",
    sidebar_fg: "215 20% 90%",
    sidebar_primary: "215 20% 55%",
    sidebar_primary_fg: "0 0% 100%",
    sidebar_accent: "215 25% 25%",
    sidebar_accent_fg: "215 20% 90%",
    sidebar_border: "215 20% 22%",
    primary: "215 20% 40%",
    accent: "215 16% 47%",
    ring: "215 20% 40%",
    preview: "#1e293b",
  },
  {
    id: "crimson",
    name: "Carmesim",
    sidebar_bg: "0 72% 20%",
    sidebar_fg: "0 20% 96%",
    sidebar_primary: "0 72% 58%",
    sidebar_primary_fg: "0 0% 100%",
    sidebar_accent: "0 55% 30%",
    sidebar_accent_fg: "0 20% 96%",
    sidebar_border: "0 45% 26%",
    primary: "0 72% 51%",
    accent: "15 80% 50%",
    ring: "0 72% 51%",
    preview: "#7f1d1d",
  },
  {
    id: "forest",
    name: "Floresta",
    sidebar_bg: "142 76% 14%",
    sidebar_fg: "142 20% 96%",
    sidebar_primary: "142 76% 45%",
    sidebar_primary_fg: "142 76% 8%",
    sidebar_accent: "142 50% 22%",
    sidebar_accent_fg: "142 20% 96%",
    sidebar_border: "142 40% 20%",
    primary: "142 76% 28%",
    accent: "160 84% 30%",
    ring: "142 76% 28%",
    preview: "#14532d",
  },
];

const THEME_STORAGE_KEY_PREFIX = "app_color_theme_";

function getThemeStorageKey(): string {
  try {
    const sessionStr = localStorage.getItem("sb-auth-token") || sessionStorage.getItem("sb-auth-token");
    if (sessionStr) {
      const parsed = JSON.parse(sessionStr);
      const userId = parsed?.user?.id || parsed?.currentSession?.user?.id;
      if (userId) return `${THEME_STORAGE_KEY_PREFIX}${userId}`;
    }
  } catch {}
  // Fallback: try supabase auth storage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
        const val = JSON.parse(localStorage.getItem(key) || "{}");
        const userId = val?.user?.id;
        if (userId) return `${THEME_STORAGE_KEY_PREFIX}${userId}`;
      }
    }
  } catch {}
  return `${THEME_STORAGE_KEY_PREFIX}anonymous`;
}

export function getStoredThemeId(): string {
  try {
    return localStorage.getItem(getThemeStorageKey()) || "default";
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

  // Sidebar colors — the main visual change
  root.style.setProperty("--sidebar-background", theme.sidebar_bg);
  root.style.setProperty("--sidebar-foreground", theme.sidebar_fg);
  root.style.setProperty("--sidebar-primary", theme.sidebar_primary);
  root.style.setProperty("--sidebar-primary-foreground", theme.sidebar_primary_fg);
  root.style.setProperty("--sidebar-accent", theme.sidebar_accent);
  root.style.setProperty("--sidebar-accent-foreground", theme.sidebar_accent_fg);
  root.style.setProperty("--sidebar-border", theme.sidebar_border);
  root.style.setProperty("--sidebar-ring", theme.ring);

  // App-wide primary/accent
  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--ring", theme.ring);
  root.style.setProperty("--accent", theme.accent);

  try {
    localStorage.setItem(getThemeStorageKey(), themeId);
  } catch {
    // localStorage unavailable
  }
}

export function resetToDefaultTheme() {
  const root = document.documentElement;
  // Remove inline overrides so CSS defaults take effect
  const props = [
    "--sidebar-background", "--sidebar-foreground", "--sidebar-primary",
    "--sidebar-primary-foreground", "--sidebar-accent", "--sidebar-accent-foreground",
    "--sidebar-border", "--sidebar-ring", "--primary", "--ring", "--accent",
  ];
  props.forEach(p => root.style.removeProperty(p));

  try {
    localStorage.setItem(THEME_STORAGE_KEY, "default");
  } catch {}
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
