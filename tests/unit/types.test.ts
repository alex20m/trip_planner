import { describe, it, expect } from "vitest";
import { canEdit, parseDateOnly, ROLE_RANK } from "@/lib/types";

describe("ROLE_RANK", () => {
  it("orders roles owner > edit > read", () => {
    expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.edit);
    expect(ROLE_RANK.edit).toBeGreaterThan(ROLE_RANK.read);
  });
});

describe("canEdit", () => {
  it("allows owner and edit roles", () => {
    expect(canEdit("owner")).toBe(true);
    expect(canEdit("edit")).toBe(true);
  });

  it("denies read-only members", () => {
    expect(canEdit("read")).toBe(false);
  });

  it("denies non-members", () => {
    expect(canEdit(null)).toBe(false);
  });
});

describe("parseDateOnly", () => {
  it("parses a YYYY-MM-DD string as local midnight, not UTC", () => {
    const d = parseDateOnly("2026-08-01");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7); // August is month index 7
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(0);
  });
});
