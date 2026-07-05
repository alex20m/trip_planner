import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#182230",
        paper: "#F6F7F9",
        activity: "#3B6EF6",
        travel: "#E8842C",
        stay: "#2FA36B"
      }
    }
  },
  plugins: []
};
export default config;
