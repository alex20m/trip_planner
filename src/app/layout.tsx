import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import SwRegister from "@/components/SwRegister";

export const metadata: Metadata = {
  title: "PlanPal",
  description: "Plan trips together",
  manifest: "/manifest.json"
};

// Drive the status-bar tint from the *resolved app theme* rather than the OS
// scheme (a static, media-query theme-color would mismatch whenever the user's
// manual light/dark choice differs from the OS). Setting a single meta here,
// before first paint, keeps the iOS status-bar region matching the app.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem("theme");
    var resolved = t === "light" || t === "dark" ? t : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.style.colorScheme = resolved;
    var color = resolved === "dark" ? "#1A1613" : "#FAF8F4";
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].parentNode.removeChild(metas[i]);
    var m = document.createElement("meta");
    m.name = "theme-color";
    m.content = color;
    document.head.appendChild(m);
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
        <SwRegister />
      </body>
    </html>
  );
}
