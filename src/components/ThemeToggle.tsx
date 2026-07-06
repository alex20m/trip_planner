"use client";
import { useEffect, useState } from "react";
import { applyTheme, getStoredTheme, THEME_KEY, type Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" }
];

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    setTheme(getStoredTheme());
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  function choose(value: Theme) {
    setTheme(value);
    window.localStorage.setItem(THEME_KEY, value);
    applyTheme(value);
  }

  return (
    <div
      role="group"
      aria-label="Theme"
      className="inline-flex rounded-lg border border-ink/20 bg-surface p-0.5 shadow-sm"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => choose(o.value)}
          aria-pressed={theme === o.value}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            theme === o.value ? "bg-charcoal text-white" : "text-ink/60 hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
