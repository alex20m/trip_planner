import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SignOutButton from "@/components/SignOutButton";

// Records every submit event that reaches the document, after React's own
// (delegated) handler has run, so `defaultPrevented` reflects the component's
// decision. Cancelling here also keeps jsdom from attempting a real navigation.
function watchSubmits() {
  const seen: boolean[] = [];
  const listener = (e: Event) => {
    seen.push(e.defaultPrevented);
    e.preventDefault();
  };
  document.addEventListener("submit", listener);
  cleanups.push(() => document.removeEventListener("submit", listener));
  return seen;
}

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe("SignOutButton", () => {
  it("posts to the sign-out route", () => {
    const { container } = render(<SignOutButton />);
    const form = container.querySelector("form")!;

    expect(form).toHaveAttribute("action", "/auth/callback?signout=1");
    expect(form).toHaveAttribute("method", "post");
  });

  it("shows a pending state while the sign-out round trip is in flight", async () => {
    watchSubmits();
    render(<SignOutButton />);

    const button = screen.getByRole("button", { name: "Sign out" });
    expect(button).toHaveAttribute("aria-busy", "false");

    await userEvent.click(button);

    // The page stays put until the redirect lands, so the click needs visible
    // feedback of its own.
    const pending = screen.getByRole("button", { name: /signing out/i });
    expect(pending).toHaveAttribute("aria-busy", "true");
    expect(pending.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("lets the first submit through and cancels a second click", async () => {
    const seen = watchSubmits();
    render(<SignOutButton />);

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await userEvent.click(screen.getByRole("button", { name: /signing out/i }));

    expect(seen).toEqual([false, true]);
  });
});
