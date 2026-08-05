import { describe, it, expect, afterEach, vi } from "vitest";
import { act, render, screen, cleanup } from "@testing-library/react";
import { useOnline } from "@/hooks/useOnline";

function Probe() {
  return <span data-testid="state">{useOnline() ? "online" : "offline"}</span>;
}

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { value, configurable: true });
}

function fire(event: "online" | "offline") {
  act(() => {
    window.dispatchEvent(new Event(event));
  });
}

afterEach(() => {
  cleanup();
  setNavigatorOnline(true);
});

describe("useOnline", () => {
  it("reports the browser's connection state on mount", () => {
    setNavigatorOnline(false);

    render(<Probe />);

    // Mounting offline must not show "online" — the app hides write actions
    // based on this, and a wrong initial value shows them as usable.
    expect(screen.getByTestId("state")).toHaveTextContent("offline");
  });

  it("flips to offline when the connection drops", () => {
    render(<Probe />);
    expect(screen.getByTestId("state")).toHaveTextContent("online");

    setNavigatorOnline(false);
    fire("offline");

    expect(screen.getByTestId("state")).toHaveTextContent("offline");
  });

  it("flips back to online when the connection returns", () => {
    setNavigatorOnline(false);
    render(<Probe />);

    setNavigatorOnline(true);
    fire("online");

    expect(screen.getByTestId("state")).toHaveTextContent("online");
  });

  it("stops listening once unmounted so a later event cannot update a dead component", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<Probe />);

    unmount();

    const removed = remove.mock.calls.map(([type]) => type);
    expect(removed).toContain("online");
    expect(removed).toContain("offline");
    remove.mockRestore();
  });
});
