// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../../../../../messages/en.json";
import { DeleteAccountForm } from "./delete-account-form";
import type { AccountDeletionFactors } from "@/modules/data-management/application/delete-account";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const first = "00000000-0000-4000-8000-000000000001",
  second = "00000000-0000-4000-8000-000000000002";
function view(factors: AccountDeletionFactors | null) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <DeleteAccountForm factors={factors} />
    </NextIntlClientProvider>
  );
}
afterEach(() => vi.unstubAllGlobals());
describe("Account deletion factor choice and secrets", () => {
  it("submits the chosen second factor and clears password and OTP after failure", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ ok: false, error: "mfa-required" }, { status: 403 }));
    vi.stubGlobal("fetch", fetch);
    render(
      view({
        requiresMfa: true,
        factors: [
          { id: first, label: "First" },
          { id: second, label: "Second" },
        ],
      }),
    );
    const user = userEvent.setup();
    await user.click(screen.getByText("Review account deletion", { selector: "summary" }));
    await user.type(screen.getByLabelText("Confirm your account email"), "owner@example.com");
    const password = screen.getByLabelText("Your current password"),
      otp = screen.getByLabelText("Authenticator code, if you use two-factor authentication");
    await user.type(password, "Original-password-123");
    await user.selectOptions(screen.getByLabelText("Authenticator to verify"), second);
    await user.type(otp, "123456");
    await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Permanently delete my account" }));
    await screen.findByRole("alert");
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toMatchObject({
      factorId: second,
      otp: "123456",
      confirmation: "DELETE",
      acknowledged: true,
    });
    await waitFor(() => expect(password).toHaveValue(""));
    expect(otp).toHaveValue("");
  });
  it("does not enable deletion when factors cannot be loaded or use an unsupported method", async () => {
    const { rerender } = render(view(null));
    await userEvent.click(screen.getByText("Review account deletion", { selector: "summary" }));
    expect(screen.getByRole("button", { name: "Permanently delete my account" })).toBeDisabled();
    rerender(view({ requiresMfa: true, factors: [] }));
    expect(screen.getByRole("button", { name: "Permanently delete my account" })).toBeDisabled();
  });
});
