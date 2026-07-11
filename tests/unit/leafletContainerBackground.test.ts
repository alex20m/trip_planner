import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

// Leaflet's stylesheet paints the map container #ddd. iOS 26 tints the
// standalone-PWA status bar from the background-color of near-top fixed
// elements and never re-samples on script-driven changes, so with the map
// open full screen that gray became the status-bar color and stayed stuck
// after closing. globals.css must keep overriding the container background
// with the theme paper color so the sampled color always matches the app.
describe("leaflet container background override", () => {
  const css = readFileSync("src/app/globals.css", "utf8");

  it("repaints .leaflet-container with the theme paper color", () => {
    const rule = css.match(/\.leaflet-container[^{]*\{[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule![0]).toContain("var(--color-paper)");
  });

  it("outranks leaflet.css regardless of bundle order", () => {
    // Same specificity would make the winner depend on chunk order in the
    // production CSS bundle; the doubled class guarantees the override wins.
    expect(css).toMatch(/\.leaflet-container\.leaflet-container\s*\{/);
  });
});
