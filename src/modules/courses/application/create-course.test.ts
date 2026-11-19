import { describe, expect, it, vi } from "vitest";
import { createCourse, type CourseCreationRepository } from "./create-course";

const draft = { title: "New course", profileVersion: "2026-11-19T12:00:00+00:00" };

function repository() {
  return {
    listTargetLocales: vi.fn(async () => ["de", "en-GB", "fr", "it"]),
    create: vi.fn(async () => ({ ok: true as const })),
  } satisfies CourseCreationRepository;
}

describe("createCourse", () => {
  it.each([
    [" Inglés  ", "en-GB"],
    ["English (United Kingdom)", "en-GB"],
    ["francais", "fr"],
    ["Deutsch", "de"],
    ["IT", "it"],
  ])("resolves %s to %s", async (language, targetLocale) => {
    const repo = repository();
    await expect(createCourse(repo, { ...draft, language })).resolves.toEqual({ ok: true });
    expect(repo.create).toHaveBeenCalledWith({ ...draft, targetLocale, targetLanguageName: null });
  });

  it("preserves a language outside the catalogue", async () => {
    const repo = repository();
    await createCourse(repo, { ...draft, language: "  日本語  " });
    expect(repo.create).toHaveBeenCalledWith({
      ...draft,
      targetLocale: "und",
      targetLanguageName: "日本語",
    });
  });

  it.each(["   ", "123", "Japonés\nOtro", "a".repeat(81)])(
    "rejects an invalid name",
    async (language) => {
      const repo = repository();
      await expect(createCourse(repo, { ...draft, language })).resolves.toEqual({
        ok: false,
        error: "invalid",
      });
      expect(repo.listTargetLocales).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    },
  );
});
