export type Theme = "system" | "light" | "dark";

export const THEME_KEY = "theme";

// Must match --color-paper in globals.css for each scheme. This is the app
// background, and also what the iOS status-bar region should be tinted (via
// <meta name="theme-color">) so the notch/status-bar area matches the app.
export const PAPER_COLOR: Record<"light" | "dark", string> = {
  light: "#FAF8F4",
  dark: "#1A1613"
};

// Point the browser/PWA status-bar tint at the resolved app color. The node is
// replaced rather than mutated so iOS reliably re-reads it — after a
// full-screen overlay closes, iOS can otherwise leave the status bar stuck on
// its default (light) style instead of the app color.
export function syncThemeColor(resolved?: "light" | "dark") {
  if (typeof document === "undefined") return;
  const scheme =
    resolved ?? (document.documentElement.classList.contains("dark") ? "dark" : "light");
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = PAPER_COLOR[scheme];
  document.head.appendChild(meta);
}

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const t = window.localStorage.getItem(THEME_KEY);
  return t === "light" || t === "dark" ? t : "system";
}

export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

export function applyTheme(theme: Theme) {
  const resolved = resolveTheme(theme);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
  syncThemeColor(resolved);
}
