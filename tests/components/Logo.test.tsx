import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Logo, { LogoMark } from "@/components/Logo";

describe("Logo", () => {
  it("renders the mark and the PlanPal wordmark", () => {
    render(<Logo />);
    expect(screen.getByRole("img", { name: "PlanPal" })).toBeInTheDocument();
    expect(screen.getByText("PlanPal", { selector: "span.font-bold" })).toBeInTheDocument();
  });

  it("hides the wordmark when hideWordmark is set", () => {
    render(<Logo hideWordmark />);
    expect(screen.getByRole("img", { name: "PlanPal" })).toBeInTheDocument();
    expect(screen.queryByText("PlanPal", { selector: "span.font-bold" })).not.toBeInTheDocument();
  });

  it("LogoMark renders just the icon", () => {
    render(<LogoMark className="h-6 w-6" />);
    expect(screen.getByRole("img", { name: "PlanPal" })).toHaveClass("h-6 w-6");
  });
});
