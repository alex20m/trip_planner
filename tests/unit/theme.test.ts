import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { applyTheme, syncThemeColor, PAPER_COLOR } from "@/lib/theme";

function themeColorMetas() {
  return Array.from(document.querySelectorAll('meta[name="theme-color"]'));
}

beforeEach(() => {
  vi.useFakeTimers();
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  document.documentElement.classList.remove("dark");
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("syncThemeColor", () => {
  it("settles on a single theme-color meta matching the app paper color", () => {
    syncThemeColor("dark");
    vi.runAllTimers();
    let metas = themeColorMetas();
    expect(metas).toHaveLength(1);
    expect(metas[0].getAttribute("content")).toBe(PAPER_COLOR.dark);

    syncThemeColor("light");
    vi.runAllTimers();
    metas = themeColorMetas();
    // Still exactly one — the node is replaced, not accumulated.
    expect(metas).toHaveLength(1);
    expect(metas[0].getAttribute("content")).toBe(PAPER_COLOR.light);
  });

  it("passes through a different color first so WebKit repaints the status bar", () => {
    syncThemeColor("dark");
    vi.runAllTimers();
    expect(themeColorMetas()[0].getAttribute("content")).toBe(PAPER_COLOR.dark);

    // Re-sync with the same scheme: the intermediate value must differ from
    // the already-set target, otherwise iOS never repaints a stuck status bar.
    syncThemeColor("dark");
    const intermediate = themeColorMetas()[0].getAttribute("content");
    expect(intermediate).not.toBe(PAPER_COLOR.dark);

    vi.runAllTimers();
    expect(themeColorMetas()[0].getAttribute("content")).toBe(PAPER_COLOR.dark);
  });

  it("lets the newest sync win when calls overlap", () => {
    syncThemeColor("dark");
    syncThemeColor("light");
    vi.runAllTimers();
    const metas = themeColorMetas();
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
    vi.runAllTimers();

    const metas = themeColorMetas();
    expect(metas).toHaveLength(1);
    expect(metas[0].hasAttribute("media")).toBe(false);
    expect(metas[0].getAttribute("content")).toBe(PAPER_COLOR.dark);
  });

  it("falls back to the resolved <html> class when no scheme is passed", () => {
    document.documentElement.classList.add("dark");
    syncThemeColor();
    vi.runAllTimers();
    expect(themeColorMetas()[0].getAttribute("content")).toBe(PAPER_COLOR.dark);
  });
});

describe("applyTheme", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("syncs the theme-color meta alongside the .dark class", () => {
    applyTheme("dark");
    vi.runAllTimers();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(themeColorMetas()[0].getAttribute("content")).toBe(PAPER_COLOR.dark);

    applyTheme("light");
    vi.runAllTimers();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(themeColorMetas()[0].getAttribute("content")).toBe(PAPER_COLOR.light);
  });
});
