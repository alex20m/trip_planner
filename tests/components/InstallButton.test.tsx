import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InstallButton from "@/components/InstallButton";

function mockDisplayMode(standalone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("display-mode: standalone") ? standalone : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null
  })) as unknown as typeof window.matchMedia;
}

function mockUserAgent(ua: string, platform = "", maxTouchPoints = 0) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
  Object.defineProperty(window.navigator, "platform", { value: platform, configurable: true });
  Object.defineProperty(window.navigator, "maxTouchPoints", { value: maxTouchPoints, configurable: true });
}

/** Fire the Chrome/Edge event that makes a one-tap install possible. */
function fireInstallPrompt(overrides: Partial<{ prompt: () => Promise<void>; userChoice: Promise<unknown> }> = {}) {
  const event = Object.assign(new Event("beforeinstallprompt"), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: "accepted" }),
    ...overrides
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

const UA = {
  iphone: "mozilla/5.0 (iphone; cpu iphone os 17_0 like mac os x) applewebkit/605.1.15",
  ipadOS: "mozilla/5.0 (macintosh; intel mac os x 10_15_7) applewebkit/605.1.15",
  android: "mozilla/5.0 (linux; android 14; pixel 8) applewebkit/537.36",
  desktop: "mozilla/5.0 (windows nt 10.0; win64; x64) applewebkit/537.36",
  other: "some-tv-browser/1.0"
};

beforeEach(() => {
  mockDisplayMode(false);
  mockUserAgent(UA.desktop);
  Object.defineProperty(window.navigator, "standalone", { value: undefined, configurable: true });
});

afterEach(cleanup);

describe("InstallButton — when it appears at all", () => {
  it("offers installation in a normal browser tab", async () => {
    render(<InstallButton />);
    expect(await screen.findByRole("button", { name: /Install app/ })).toBeInTheDocument();
  });

  it("stays hidden inside the installed PWA, where installing again is meaningless", () => {
    mockDisplayMode(true);

    render(<InstallButton />);

    expect(screen.queryByRole("button", { name: /Install app/ })).not.toBeInTheDocument();
  });

  it("stays hidden in an iOS home-screen app, which reports standalone on navigator", () => {
    Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true });

    render(<InstallButton />);

    expect(screen.queryByRole("button", { name: /Install app/ })).not.toBeInTheDocument();
  });

  it("disappears as soon as the install completes", async () => {
    const user = userEvent.setup();
    render(<InstallButton />);
    await user.click(await screen.findByRole("button", { name: /Install app/ }));
    expect(screen.getByRole("heading", { name: /Install PlanPal/ })).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });

    expect(screen.queryByRole("button", { name: /Install app/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Install PlanPal/ })).not.toBeInTheDocument();
  });
});

describe("InstallButton — one-tap install where the browser supports it", () => {
  it("runs the browser's install prompt and closes once the user has answered", async () => {
    const user = userEvent.setup();
    render(<InstallButton />);
    await screen.findByRole("button", { name: /Install app/ });
    const event = fireInstallPrompt();

    await user.click(screen.getByRole("button", { name: /Install app/ }));
    await user.click(screen.getByRole("button", { name: /Install now/ }));

    expect(event.prompt).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("heading", { name: /Install PlanPal/ })).not.toBeInTheDocument());
  });

  it("does not offer one-tap install a second time after the prompt is spent", async () => {
    const user = userEvent.setup();
    render(<InstallButton />);
    await screen.findByRole("button", { name: /Install app/ });
    fireInstallPrompt();

    await user.click(screen.getByRole("button", { name: /Install app/ }));
    await user.click(screen.getByRole("button", { name: /Install now/ }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: /Install PlanPal/ })).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /Install app/ }));

    // A beforeinstallprompt event can only be used once; reoffering the button
    // would leave the user tapping something that does nothing.
    expect(screen.queryByRole("button", { name: /Install now/ })).not.toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
  });

  it("blocks a second tap while the prompt is open", async () => {
    let releasePrompt: () => void = () => {};
    const user = userEvent.setup();
    render(<InstallButton />);
    await screen.findByRole("button", { name: /Install app/ });
    const event = fireInstallPrompt({
      prompt: vi.fn(() => new Promise<void>((r) => (releasePrompt = r)))
    });

    await user.click(screen.getByRole("button", { name: /Install app/ }));
    await user.click(screen.getByRole("button", { name: /Install now/ }));

    const installing = screen.getByRole("button", { name: /Installing…/ });
    expect(installing).toBeDisabled();
    await user.click(installing);
    expect(event.prompt).toHaveBeenCalledTimes(1);

    releasePrompt();
    await waitFor(() => expect(screen.queryByRole("heading", { name: /Install PlanPal/ })).not.toBeInTheDocument());
  });

  it("keeps the manual fallback available alongside the one-tap button", async () => {
    const user = userEvent.setup();
    render(<InstallButton />);
    await screen.findByRole("button", { name: /Install app/ });
    fireInstallPrompt();

    await user.click(screen.getByRole("button", { name: /Install app/ }));

    expect(screen.getByText(/Or do it manually/)).toBeInTheDocument();
  });
});

describe("InstallButton — manual instructions per platform", () => {
  it.each([
    ["an iPhone", UA.iphone, "", 0, /On iPhone \/ iPad \(Safari\)/, /Add to Home Screen/],
    // iPadOS 13+ reports a Mac user agent; only the touch points give it away.
    ["an iPad reporting as a Mac", UA.ipadOS, "MacIntel", 5, /On iPhone \/ iPad \(Safari\)/, /Add to Home Screen/],
    ["an Android phone", UA.android, "", 0, /On Android \(Chrome\)/, /Add to Home screen/],
    ["a desktop browser", UA.desktop, "", 0, /On desktop \(Chrome \/ Edge\)/, /address bar/],
    ["an unrecognised browser", UA.other, "", 0, /^Install$/, /Open your browser/]
  ])("shows the steps for %s", async (_label, ua, platform, touch, heading, step) => {
    mockUserAgent(ua, platform, touch);
    const user = userEvent.setup();
    render(<InstallButton />);

    await user.click(await screen.findByRole("button", { name: /Install app/ }));

    expect(screen.getByText(heading)).toBeInTheDocument();
    expect(screen.getByText(step)).toBeInTheDocument();
  });

  it("does not mistake a desktop Mac without touch for an iPad", async () => {
    mockUserAgent(UA.ipadOS, "MacIntel", 0);
    const user = userEvent.setup();
    render(<InstallButton />);

    await user.click(await screen.findByRole("button", { name: /Install app/ }));

    expect(screen.getByText(/On desktop \(Chrome \/ Edge\)/)).toBeInTheDocument();
  });
});

describe("InstallButton — dismissing the dialog", () => {
  it("closes on the Close button", async () => {
    const user = userEvent.setup();
    render(<InstallButton />);
    await user.click(await screen.findByRole("button", { name: /Install app/ }));

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("heading", { name: /Install PlanPal/ })).not.toBeInTheDocument();
  });

  it("stays open when clicking inside the panel", async () => {
    const user = userEvent.setup();
    render(<InstallButton />);
    await user.click(await screen.findByRole("button", { name: /Install app/ }));

    await user.click(screen.getByRole("heading", { name: /Install PlanPal/ }));

    expect(screen.getByRole("heading", { name: /Install PlanPal/ })).toBeInTheDocument();
  });
});
