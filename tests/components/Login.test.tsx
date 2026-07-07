import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

describe("Login", () => {
  beforeEach(() => {
    signInWithOtp.mockReset().mockResolvedValue({ error: null });
    verifyOtp.mockReset();
  });

  it("sends a magic link and then shows the code entry step", async () => {
    render(<Login />);

    await userEvent.type(screen.getByPlaceholderText("you@email.com"), "person@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send sign-in link" }));

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "person@example.com",
      options: { emailRedirectTo: expect.stringContaining("/auth/callback") }
    });
    expect(screen.getByPlaceholderText("6-digit code")).toBeInTheDocument();
  });

  it("verifies a 6-digit code and redirects home", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() } as any);

    render(<Login />);
    await userEvent.type(screen.getByPlaceholderText("you@email.com"), "person@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send sign-in link" }));

    await userEvent.type(screen.getByPlaceholderText("6-digit code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify code" }));

    expect(verifyOtp).toHaveBeenCalledWith({ email: "person@example.com", token: "123456", type: "email" });
    expect(push).toHaveBeenCalledWith("/");
  });

  it("strips non-digits and caps the code at 6 characters", async () => {
    render(<Login />);
    await userEvent.type(screen.getByPlaceholderText("you@email.com"), "person@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send sign-in link" }));

    const codeInput = screen.getByPlaceholderText("6-digit code") as HTMLInputElement;
    await userEvent.type(codeInput, "12a3456bc");
    expect(codeInput.value).toBe("123456");
  });

  it("disables Verify code until 6 digits are entered", async () => {
    render(<Login />);
    await userEvent.type(screen.getByPlaceholderText("you@email.com"), "person@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send sign-in link" }));

    const verifyButton = screen.getByRole("button", { name: "Verify code" });
    expect(verifyButton).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText("6-digit code"), "123");
    expect(verifyButton).toBeDisabled();
  });

  it("shows an error message when verification fails", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "Invalid code" } });
    render(<Login />);

    await userEvent.type(screen.getByPlaceholderText("you@email.com"), "person@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send sign-in link" }));
    await userEvent.type(screen.getByPlaceholderText("6-digit code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify code" }));

    expect(screen.getByText("Invalid code")).toBeInTheDocument();
  });

  it("lets the user go back and use a different email", async () => {
    render(<Login />);
    await userEvent.type(screen.getByPlaceholderText("you@email.com"), "person@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send sign-in link" }));

    await userEvent.click(screen.getByRole("button", { name: "Use a different email" }));

    expect(screen.getByPlaceholderText("you@email.com")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("6-digit code")).not.toBeInTheDocument();
  });
});
