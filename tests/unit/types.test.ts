import { describe, it, expect } from "vitest";
import { canEdit, ROLE_RANK } from "@/lib/types";

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
