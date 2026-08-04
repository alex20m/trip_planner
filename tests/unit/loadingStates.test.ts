import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "fs";
import { join, relative, resolve } from "path";

const APP_DIR = resolve(__dirname, "../../src/app");

// Every navigable route needs a loading fallback. Without one, clicking a link
// leaves the previous page on screen — frozen, with no spinner — for as long as
// the server component takes, and the click looks like it did nothing.
function routeSegments(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      // API handlers render no UI, so they have nothing to show a fallback for.
      if (entry === "api") continue;
      found.push(...routeSegments(path));
    } else if (entry === "page.tsx") {
      found.push(dir);
    }
  }
  return found;
}

describe("route loading fallbacks", () => {
  const segments = routeSegments(APP_DIR);

  it("finds every page in the app directory", () => {
    expect(segments.length).toBeGreaterThan(0);
  });

  it.each(segments.map((s) => relative(APP_DIR, s) || "(root)"))(
    "/%s has a loading.tsx",
    (name) => {
      const dir = name === "(root)" ? APP_DIR : join(APP_DIR, name);
      expect(readdirSync(dir)).toContain("loading.tsx");
    }
  );
});
