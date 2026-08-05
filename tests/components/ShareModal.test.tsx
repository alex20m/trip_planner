import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShareModal from "@/components/ShareModal";

const fetchMock = vi.fn();

function open(myRole: "owner" | "edit" | "read" = "owner", onClose = vi.fn()) {
  render(<ShareModal tripId="t1" myRole={myRole} onClose={onClose} />);
  return { onClose };
}

function lastRequestBody() {
  return JSON.parse(fetchMock.mock.calls.at(-1)![1].body);
}

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ShareModal — sending an invitation", () => {
  it("invites the typed address with the chosen access level", async () => {
    const user = userEvent.setup();
    open("owner");

    await user.type(screen.getByPlaceholderText("friend@example.com"), "friend@example.com");
    await user.click(screen.getByRole("button", { name: /^Edit$/ }));
    await user.click(screen.getByRole("button", { name: /Send invitation/ }));

    expect(fetchMock).toHaveBeenCalledWith("/api/invites", expect.objectContaining({ method: "POST" }));
    expect(lastRequestBody()).toEqual({ tripId: "t1", email: "friend@example.com", role: "edit" });
  });

  it("defaults to view access so sharing never over-grants by accident", async () => {
    const user = userEvent.setup();
    open("owner");

    await user.type(screen.getByPlaceholderText("friend@example.com"), "friend@example.com");
    await user.click(screen.getByRole("button", { name: /Send invitation/ }));

    expect(lastRequestBody().role).toBe("read");
  });

  it("cannot be submitted with an empty address", async () => {
    open("owner");
    expect(screen.getByRole("button", { name: /Send invitation/ })).toBeDisabled();
  });

  it("confirms success and clears the field so the next invite starts fresh", async () => {
    const user = userEvent.setup();
    open("owner");
    const field = screen.getByPlaceholderText("friend@example.com");

    await user.type(field, "friend@example.com");
    await user.click(screen.getByRole("button", { name: /Send invitation/ }));

    expect(await screen.findByText("Invitation sent ✓")).toBeInTheDocument();
    expect(field).toHaveValue("");
  });

  it("shows the server's reason when the invite is rejected, and keeps the address", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "cannot grant more access than you have" }) });
    const user = userEvent.setup();
    open("edit");
    const field = screen.getByPlaceholderText("friend@example.com");

    await user.type(field, "friend@example.com");
    await user.click(screen.getByRole("button", { name: /Send invitation/ }));

    expect(await screen.findByText("cannot grant more access than you have")).toBeInTheDocument();
    // Retyping the address after a failure would be needless friction.
    expect(field).toHaveValue("friend@example.com");
  });

  it("falls back to a generic message when the failure has no reason", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    const user = userEvent.setup();
    open("owner");

    await user.type(screen.getByPlaceholderText("friend@example.com"), "friend@example.com");
    await user.click(screen.getByRole("button", { name: /Send invitation/ }));

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });

  it("shows progress and blocks a second submit while the invite is in flight", async () => {
    let release: (v: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((r) => (release = r)));
    const user = userEvent.setup();
    open("owner");

    await user.type(screen.getByPlaceholderText("friend@example.com"), "friend@example.com");
    await user.click(screen.getByRole("button", { name: /Send invitation/ }));

    const button = screen.getByRole("button", { name: /Sending…/ });
    expect(button).toBeDisabled();

    // Clicking again while it is in flight must not produce a second invitation.
    await user.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    release({ ok: true, json: async () => ({ ok: true }) });
    await waitFor(() => expect(screen.queryByRole("button", { name: /Sending…/ })).not.toBeInTheDocument());
  });
});

describe("ShareModal — a view-only member's limits", () => {
  it("cannot hand out edit access they do not have themselves", async () => {
    const user = userEvent.setup();
    open("read");

    const editOption = screen.getByRole("button", { name: /^Edit$/ });
    expect(editOption).toBeDisabled();

    await user.click(editOption);

    await user.type(screen.getByPlaceholderText("friend@example.com"), "friend@example.com");
    await user.click(screen.getByRole("button", { name: /Send invitation/ }));

    expect(lastRequestBody().role).toBe("read");
  });

  it("explains why only view access is on offer", () => {
    open("read");
    expect(screen.getByText(/you can only share with view access/i)).toBeInTheDocument();
  });

  it("lets an editor grant edit access", () => {
    open("edit");
    expect(screen.getByRole("button", { name: /^Edit$/ })).toBeEnabled();
    expect(screen.queryByText(/you can only share with view access/i)).not.toBeInTheDocument();
  });
});

describe("ShareModal — dismissing", () => {
  it("closes on the Close button", async () => {
    const user = userEvent.setup();
    const { onClose } = open("owner");

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("does not close when clicking inside the panel", async () => {
    const user = userEvent.setup();
    const { onClose } = open("owner");

    await user.click(screen.getByRole("heading", { name: "Share trip" }));

    expect(onClose).not.toHaveBeenCalled();
  });
});
