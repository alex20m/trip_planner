import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import SwRegister from "@/components/SwRegister";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "PlanPal",
  description: "Plan trips together",
  manifest: "/manifest.json"
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F7F9" },
    { media: "(prefers-color-scheme: dark)", color: "#0F141B" }
  ]
};

const THEME_INIT_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem("theme");
    var resolved = t === "light" || t === "dark" ? t : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.style.colorScheme = resolved;
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        {children}
        <div className="fixed bottom-4 right-4 z-40">
          <ThemeToggle />
        </div>
        <SwRegister />
      </body>
    </html>
  );
}
