"use client";
import { useEffect, useState } from "react";
import { applyTheme, getStoredTheme, THEME_KEY, type Theme } from "@/lib/theme";
import { MonitorIcon, MoonIcon, SunIcon } from "@/components/Icons";

const OPTIONS: { value: Theme; label: string; Icon: typeof SunIcon }[] = [
  { value: "system", label: "System", Icon: MonitorIcon },
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon }
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
      className="inline-flex rounded-full border border-ink/10 bg-surface p-1 shadow-soft"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => choose(o.value)}
          aria-pressed={theme === o.value}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
            theme === o.value ? "bg-charcoal text-white" : "text-ink/50 hover:bg-ink/5 hover:text-ink"
          }`}
        >
          <o.Icon className="h-3.5 w-3.5" />
          {o.label}
        </button>
      ))}
    </div>
  );
}
