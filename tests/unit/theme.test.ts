import { describe, it, expect, beforeEach } from "vitest";
import { applyTheme, syncThemeColor, PAPER_COLOR } from "@/lib/theme";

function themeColorMetas() {
  return Array.from(document.querySelectorAll('meta[name="theme-color"]'));
}

describe("syncThemeColor", () => {
  beforeEach(() => {
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    document.documentElement.classList.remove("dark");
  });

  it("writes a single theme-color meta matching the app paper color", () => {
    syncThemeColor("dark");
    let metas = themeColorMetas();
    expect(metas).toHaveLength(1);
    expect(metas[0].getAttribute("content")).toBe(PAPER_COLOR.dark);

    syncThemeColor("light");
    metas = themeColorMetas();
    // Still exactly one — the node is replaced, not accumulated.
    expect(metas).toHaveLength(1);
    expect(metas[0].getAttribute("content")).toBe(PAPER_COLOR.light);
  });

  it("removes any pre-existing theme-color metas (e.g. OS-scheme fallbacks)", () => {
    const stale = document.createElement("meta");
    stale.setAttribute("name", "theme-color");
    stale.setAttribute("media", "(prefers-color-scheme: light)");
    stale.setAttribute("content", "#000000");
    document.head.appendChild(stale);

    syncThemeColor("dark");

    const metas = themeColorMetas();
    expect(metas).toHaveLength(1);
    expect(metas[0].hasAttribute("media")).toBe(false);
    expect(metas[0].getAttribute("content")).toBe(PAPER_COLOR.dark);
  });

  it("falls back to the resolved <html> class when no scheme is passed", () => {
    document.documentElement.classList.add("dark");
    syncThemeColor();
    expect(themeColorMetas()[0].getAttribute("content")).toBe(PAPER_COLOR.dark);
  });
});

describe("applyTheme", () => {
  beforeEach(() => {
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    window.localStorage.clear();
  });

  it("syncs the theme-color meta alongside the .dark class", () => {
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(themeColorMetas()[0].getAttribute("content")).toBe(PAPER_COLOR.dark);

    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(themeColorMetas()[0].getAttribute("content")).toBe(PAPER_COLOR.light);
  });
});
