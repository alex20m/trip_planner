export type Theme = "system" | "light" | "dark";

export const THEME_KEY = "theme";

// Must match --color-paper in globals.css for each scheme. This is the app
// background, and also what the iOS status-bar region should be tinted (via
// <meta name="theme-color">) so the notch/status-bar area matches the app.
export const PAPER_COLOR: Record<"light" | "dark", string> = {
  light: "#FAF8F4",
  dark: "#1A1613"
};

// Imperceptible variant of each paper color (blue channel one step off).
// WebKit only repaints the iOS status bar when the theme-color *changes* to a
// different value — re-writing the same color is a no-op, which is why a stuck
// status bar (e.g. after the full-screen map overlay closes) stays stuck.
// Passing through this nudge color and then the real one forces the repaint.
const PAPER_COLOR_NUDGE: Record<"light" | "dark", string> = {
  light: "#FAF8F3",
  dark: "#1A1612"
};

// How long the nudge color stays before the real color lands. One frame is
// enough for WebKit to register the change; 60 ms is safely past a frame and
// still far below anything perceivable (the colors differ by one bit anyway).
const NUDGE_MS = 60;

// Point the browser/PWA status-bar tint at the resolved app color, forcing a
// status-bar repaint even if the target color is already set (see
// PAPER_COLOR_NUDGE above).
export function syncThemeColor(resolved?: "light" | "dark") {
  if (typeof document === "undefined") return;
  const scheme =
    resolved ?? (document.documentElement.classList.contains("dark") ? "dark" : "light");
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = PAPER_COLOR_NUDGE[scheme];
  document.head.appendChild(meta);
  window.setTimeout(() => {
    // A later sync may have replaced the node; only finish our own transition.
    if (meta.parentNode) meta.content = PAPER_COLOR[scheme];
  }, NUDGE_MS);
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
