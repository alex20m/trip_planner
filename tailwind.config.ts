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
        charcoal: "#182230",
        activity: "#3B6EF6",
        travel: "#E8842C",
        stay: "#2FA36B"
      }
    }
  },
  plugins: []
};
export default config;
