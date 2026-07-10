import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import Login from "@/app/login/page";

const signInWithOtp = vi.fn();
const verifyOtp = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithOtp: (...args: unknown[]) => signInWithOtp(...args),
      verifyOtp: (...args: unknown[]) => verifyOtp(...args)
    }
  })
}));

// Fill the email and request the code, landing on the code-entry step.
async function reachCodeStep() {
  await userEvent.type(screen.getByPlaceholderText("you@email.com"), "person@example.com");
  await userEvent.click(screen.getByRole("button", { name: "Email me a code" }));
}

const digits = () => screen.getAllByLabelText(/^Digit \d$/) as HTMLInputElement[];

describe("Login", () => {
  beforeEach(() => {
    signInWithOtp.mockReset().mockResolvedValue({ error: null });
    verifyOtp.mockReset();
  });

  it("emails a code (no magic link) and then shows the 6-box code entry step", async () => {
    render(<Login />);
    await reachCodeStep();

    // No emailRedirectTo — sign-in is code-only, so no magic link is sent.
    expect(signInWithOtp).toHaveBeenCalledWith({ email: "person@example.com" });
    expect(screen.getByRole("group", { name: "6-digit verification code" })).toBeInTheDocument();
    expect(digits()).toHaveLength(6);
  });

  it("auto-advances focus as each digit is typed", async () => {
    render(<Login />);
    await reachCodeStep();

    await userEvent.click(digits()[0]);
    await userEvent.keyboard("1");

    expect(digits()[0].value).toBe("1");
    expect(digits()[1]).toHaveFocus();
  });

  it("pasting a 6-digit code auto-submits and redirects home", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() } as any);

    render(<Login />);
    await reachCodeStep();

    await userEvent.click(digits()[0]);
    await userEvent.paste("123456");

    await waitFor(() => {
      expect(verifyOtp).toHaveBeenCalledWith({ email: "person@example.com", token: "123456", type: "email" });
      expect(push).toHaveBeenCalledWith("/");
    });
  });

  it("strips non-digits and keeps only the first 6 digits when pasting", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    vi.mocked(useRouter).mockReturnValue({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() } as any);

    render(<Login />);
    await reachCodeStep();

    await userEvent.click(digits()[0]);
    await userEvent.paste("12a34-567");

    expect(digits().map((d) => d.value).join("")).toBe("123456");
  });

  it("keeps Verify code disabled until all 6 digits are present", async () => {
    render(<Login />);
    await reachCodeStep();

    const verifyButton = screen.getByRole("button", { name: "Verify code" });
    expect(verifyButton).toBeDisabled();

    await userEvent.click(digits()[0]);
    await userEvent.paste("123");
    expect(verifyButton).toBeDisabled();
  });

  it("shows an error message when verification fails", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "Invalid code" } });
    render(<Login />);
    await reachCodeStep();

    await userEvent.click(digits()[0]);
    await userEvent.paste("123456");

    expect(await screen.findByText("Invalid code")).toBeInTheDocument();
  });

  it("lets the user go back and use a different email", async () => {
    render(<Login />);
    await reachCodeStep();

    await userEvent.click(screen.getByRole("button", { name: "Use a different email" }));

    expect(screen.getByPlaceholderText("you@email.com")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "6-digit verification code" })).not.toBeInTheDocument();
  });
});
