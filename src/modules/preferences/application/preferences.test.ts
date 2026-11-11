import { describe, expect, it, vi } from "vitest";
import { changePreferences, PreferencesError, type PreferencesRepository } from "./preferences";
const input = {
  courseId: "c1111111-1111-4111-8111-111111111111",
  profileVersion: "2026-11-11T12:00:00.123456+00:00",
  settingsVersion: "2026-11-11T12:00:00.654321+00:00",
  uiLocale: "en",
  theme: "system",
  timeZone: "Europe/Madrid",
  dailyNewLimit: 5,
  maximumReviews: null,
  showIntervals: true,
};
const repo = (): PreferencesRepository => ({ read: vi.fn(), save: vi.fn(), selectCourse: vi.fn() });
describe("Preference changes", () => {
  it("preserves database versions and explicit unlimited reviews", async () => {
    const r = repo();
    expect(await changePreferences(r, "owner", input)).toEqual({ ok: true, locale: "en" });
    expect(r.save).toHaveBeenCalledWith("owner", input);
  });
  it.each([
    { dailyNewLimit: -1 },
    { dailyNewLimit: 101 },
    { dailyNewLimit: 1.5 },
    { dailyNewLimit: NaN },
    { maximumReviews: -1 },
    { maximumReviews: 2001 },
    { maximumReviews: "100" },
    { uiLocale: "//evil.example" },
    { theme: "custom" },
    { timeZone: "Not/AZone" },
    { timeZone: "+02:00" },
    { timeZone: " Europe/Madrid" },
    { showIntervals: "false" },
    { profileVersion: "yesterday" },
    { courseId: "foreign" },
    { requestedRetention: 0.99 },
  ])("rejects unsafe input before writing: %j", async (patch) => {
    const r = repo();
    expect((await changePreferences(r, "owner", { ...input, ...patch })).ok).toBe(false);
    expect(r.save).not.toHaveBeenCalled();
  });
  it("supports zero limits and a different valid civil time zone", async () => {
    expect(
      (
        await changePreferences(repo(), "owner", {
          ...input,
          dailyNewLimit: 0,
          maximumReviews: 0,
          timeZone: "America/New_York",
        })
      ).ok,
    ).toBe(true);
  });
  it("switches only the course, without copying limits", async () => {
    const r = repo();
    const change = { courseId: input.courseId, profileVersion: input.profileVersion };
    expect(await changePreferences(r, "owner", change, true)).toEqual({ ok: true });
    expect(r.selectCourse).toHaveBeenCalledWith("owner", change);
    expect(r.save).not.toHaveBeenCalled();
    expect((await changePreferences(r, "owner", { ...change, dailyNewLimit: 8 }, true)).ok).toBe(
      false,
    );
  });
  it.each(["conflict", "unavailable", "generic"] as const)(
    "returns a stable %s error",
    async (kind) => {
      const r = repo();
      vi.mocked(r.save).mockRejectedValue(new PreferencesError(kind));
      expect(await changePreferences(r, "owner", input)).toEqual({
        ok: false,
        error: kind,
        fields: [],
      });
    },
  );
});
