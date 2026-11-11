import { describe, expect, it, vi } from "vitest";
import { deleteOwnAccount } from "./delete-account";

const valid = {
  email: "owner@example.com",
  password: "Original-Password-123",
  confirmation: "DELETE",
  acknowledged: true,
};
describe("Explicit self deletion", () => {
  it("rejects missing acknowledgments, changed subject and malformed inputs before Auth", async () => {
    const reauthenticateAndDelete = vi.fn();
    for (const input of [
      null,
      {},
      { ...valid, confirmation: "delete" },
      { ...valid, acknowledged: false },
      { ...valid, ownerId: "foreign" },
      { ...valid, password: "" },
      { ...valid, otp: "not-a-code" },
      { ...valid, factorId: "not-a-factor" },
    ]) {
      expect(await deleteOwnAccount({ reauthenticateAndDelete }, input)).toEqual({
        ok: false,
        error: "invalid-input",
      });
    }
    expect(reauthenticateAndDelete).not.toHaveBeenCalled();
  });
  it("normalizes the email without altering the password and preserves typed failures", async () => {
    const reauthenticateAndDelete = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "invalid-credentials" });
    expect(
      await deleteOwnAccount(
        { reauthenticateAndDelete },
        { ...valid, email: " OWNER@example.com " },
      ),
    ).toEqual({ ok: false, error: "invalid-credentials" });
    expect(reauthenticateAndDelete).toHaveBeenCalledWith(valid);
  });
  it("never leaks provider errors or credentials", async () => {
    const reauthenticateAndDelete = vi
      .fn()
      .mockRejectedValue(new Error("sensitive provider failure"));
    expect(await deleteOwnAccount({ reauthenticateAndDelete }, valid)).toEqual({
      ok: false,
      error: "unavailable",
    });
  });
});
