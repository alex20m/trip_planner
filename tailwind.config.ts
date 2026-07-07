import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        paper: "rgb(var(--color-paper) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        charcoal: "#29211c",
        accent: "#C15F3C",
        "accent-dark": "#A84E2F",
        activity: "#3B6EF6",
        travel: "#E8842C",
        stay: "#2FA36B"
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif"
        ],
        serif: ["ui-serif", "Georgia", "Cambria", "Times New Roman", "serif"]
      },
      boxShadow: {
        soft: "0 1px 2px rgb(41 33 27 / 0.05), 0 4px 16px rgb(41 33 27 / 0.06)",
        panel: "0 12px 40px rgb(41 33 27 / 0.16)"
      }
    }
  },
  plugins: []
};
export default config;
