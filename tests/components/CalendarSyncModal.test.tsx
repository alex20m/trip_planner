import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CalendarSyncModal from "@/components/CalendarSyncModal";

const rpc = vi.fn();
const writeText = vi.fn();

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));

function open(token = "tok123", onClose = vi.fn()) {
  render(<CalendarSyncModal tripId="t1" token={token} onClose={onClose} />);
  return { onClose };
}

const feedUrl = (token: string) => `${window.location.origin}/api/calendar/${token}`;

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: "rotated-token" });
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(window.navigator, "clipboard", { value: { writeText }, configurable: true });
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CalendarSyncModal — the subscription links", () => {
  it("shows the feed URL for this trip's token", () => {
    open("tok123");
    expect(screen.getByRole("textbox")).toHaveValue(feedUrl("tok123"));
  });

  it("offers Apple the webcal scheme so the OS opens Calendar instead of a browser", () => {
    open("tok123");
    expect(screen.getByRole("link", { name: /Apple \/ iCloud/ })).toHaveAttribute(
      "href",
      feedUrl("tok123").replace(/^https?:/, "webcal:")
    );
  });

  it("hands Outlook the https URL and Google the webcal URL, each encoded once", () => {
    open("tok123");

    const outlook = screen.getByRole("link", { name: /Outlook/ }).getAttribute("href")!;
    const google = screen.getByRole("link", { name: /Google/ }).getAttribute("href")!;

    expect(new URL(outlook).searchParams.get("url")).toBe(feedUrl("tok123"));
    expect(new URL(google).searchParams.get("cid")).toBe(feedUrl("tok123").replace(/^https?:/, "webcal:"));
  });

  it("opens the third-party subscribe pages in a new tab without leaking the referrer", () => {
    open("tok123");

    for (const name of [/Outlook/, /Google/]) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    }
  });
});

describe("CalendarSyncModal — copying the link", () => {
  it("copies the https feed URL and confirms it briefly", async () => {
    // userEvent.setup() installs its own clipboard stub, so claim the property
    // back afterwards to observe what the component actually wrote.
    const user = userEvent.setup();
    Object.defineProperty(window.navigator, "clipboard", { value: { writeText }, configurable: true });
    open("tok123");

    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledWith(feedUrl("tok123"));
    // The button swaps its label for a checkmark while it is confirmed.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Copy" })).not.toBeInTheDocument());
  });
});

describe("CalendarSyncModal — revoking the link", () => {
  it("asks for confirmation before breaking existing subscriptions", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("confirm", vi.fn(() => false));
    open("tok123");

    await user.click(screen.getByRole("button", { name: /Revoke link/ }));

    expect(rpc).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue(feedUrl("tok123"));
  });

  it("shows the new link once the token is rotated", async () => {
    const user = userEvent.setup();
    open("tok123");

    await user.click(screen.getByRole("button", { name: /Revoke link/ }));

    expect(rpc).toHaveBeenCalledWith("rotate_calendar_token", { p_trip: "t1" });
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(feedUrl("rotated-token")));
    // Every subscribe link has to follow the rotation, not just the text field.
    expect(screen.getByRole("link", { name: /Apple \/ iCloud/ })).toHaveAttribute(
      "href",
      feedUrl("rotated-token").replace(/^https?:/, "webcal:")
    );
  });

  it("keeps showing the old link when the rotation returns nothing", async () => {
    rpc.mockResolvedValue({ data: null });
    const user = userEvent.setup();
    open("tok123");

    await user.click(screen.getByRole("button", { name: /Revoke link/ }));

    // Showing a blank or broken URL would be worse than showing the old one.
    await waitFor(() => expect(screen.getByRole("button", { name: /Revoke link/ })).toBeEnabled());
    expect(screen.getByRole("textbox")).toHaveValue(feedUrl("tok123"));
  });

  it("cannot be triggered while offline, when the rotation could not reach the server", () => {
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });

    open("tok123");

    expect(screen.getByRole("button", { name: /Revoke link/ })).toBeDisabled();
  });
});
