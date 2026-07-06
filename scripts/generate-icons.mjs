// Renders public/brand/mark.svg to the PNG sizes the app needs (favicon,
// Apple touch icon, PWA manifest icons). Re-run after editing the master SVG.
import { chromium } from "@playwright/test";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const svg = readFileSync(path.join(root, "public/brand/mark.svg"), "utf8");

const targets = [
  { size: 48, out: "src/app/icon.png" },
  { size: 180, out: "src/app/apple-icon.png" },
  { size: 192, out: "public/icons/icon-192.png" },
  { size: 512, out: "public/icons/icon-512.png" }
];

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
for (const { size, out } of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const sized = svg.replace('width="512" height="512"', `width="${size}" height="${size}"`);
  await page.setContent(`<!doctype html><html><body style="margin:0;padding:0;">${sized}</body></html>`);
  await page.screenshot({ path: path.join(root, out) });
  await page.close();
  console.log(`wrote ${out} (${size}x${size})`);
}
await browser.close();
