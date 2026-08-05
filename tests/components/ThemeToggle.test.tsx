import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ThemeToggle from "@/components/ThemeToggle";
import { PAPER_COLOR, THEME_KEY } from "@/lib/theme";

// Lets a test pretend the OS is in dark mode, and fire a change to it later.
const schemeListeners = new Set<() => void>();
function mockPrefersDark(prefersDark: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-color-scheme: dark") ? prefersDark : false,
    media: query,
    addEventListener: (_: string, fn: () => void) => schemeListeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => schemeListeners.delete(fn),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null
  })) as unknown as typeof window.matchMedia;
}

const selected = () =>
  screen.getAllByRole("button").find((b) => b.getAttribute("aria-pressed") === "true")?.textContent;

const isDark = () => document.documentElement.classList.contains("dark");

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove("dark");
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  schemeListeners.clear();
  mockPrefersDark(false);
});

afterEach(cleanup);

describe("ThemeToggle — reflecting the current choice", () => {
  it("starts on System when nothing has been chosen", () => {
    render(<ThemeToggle />);
    expect(selected()).toBe("System");
  });

  it("shows the stored choice on load, not the default", () => {
    window.localStorage.setItem(THEME_KEY, "dark");

    render(<ThemeToggle />);

    expect(selected()).toBe("Dark");
  });

  it("ignores a corrupted stored value instead of rendering nothing selected", () => {
    window.localStorage.setItem(THEME_KEY, "neon");

    render(<ThemeToggle />);

    expect(selected()).toBe("System");
  });

  it("marks exactly one option as pressed", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "Light" }));

    expect(screen.getAllByRole("button").filter((b) => b.getAttribute("aria-pressed") === "true")).toHaveLength(1);
  });
});

describe("ThemeToggle — choosing a theme", () => {
  it("applies dark mode and remembers it across reloads", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "Dark" }));

    expect(isDark()).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("dark");

    // Remount as a fresh page load: the choice survives.
    unmount();
    render(<ThemeToggle />);
    expect(selected()).toBe("Dark");
  });

  it("turns dark mode back off when switching to light", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "Dark" }));
    await user.click(screen.getByRole("button", { name: "Light" }));

    expect(isDark()).toBe(false);
    expect(window.localStorage.getItem(THEME_KEY)).toBe("light");
  });

  it("follows the OS when System is chosen", async () => {
    mockPrefersDark(true);
    window.localStorage.setItem(THEME_KEY, "light");
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "System" }));

    expect(isDark()).toBe(true);
    expect(window.localStorage.getItem(THEME_KEY)).toBe("system");
  });

  it("repaints the status-bar tint to match the chosen theme", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "Dark" }));

    // syncThemeColor passes through a nudge color for one frame before landing
    // on the real one, so the final value arrives a beat after the click.
    await waitFor(() =>
      expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(PAPER_COLOR.dark)
    );
  });
});

describe("ThemeToggle — following the OS while on System", () => {
  it("switches to dark when the OS flips and the app is on System", () => {
    render(<ThemeToggle />);
    expect(isDark()).toBe(false);

    // The OS switched to dark: re-resolve "system" against the new value.
    mockPrefersDark(true);
    act(() => schemeListeners.forEach((fn) => fn()));

    expect(isDark()).toBe(true);
  });

  it("does not follow the OS once an explicit theme is chosen", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: "Light" }));

    mockPrefersDark(true);
    act(() => schemeListeners.forEach((fn) => fn()));

    // An explicit Light choice must survive the OS going dark.
    expect(isDark()).toBe(false);
    expect(selected()).toBe("Light");
  });

  it("stops listening to the OS after unmount", () => {
    const { unmount } = render(<ThemeToggle />);
    expect(schemeListeners.size).toBe(1);

    unmount();

    expect(schemeListeners.size).toBe(0);
  });
});
