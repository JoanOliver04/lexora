import { describe, expect, it, vi } from "vitest";

import { LibraryError } from "./library-error";
import {
  createTag,
  deleteTag,
  listConceptTags,
  renameTag,
  type TagRepository,
  tagConcept,
  untagConcept,
} from "./tag";

const persistedTag = {
  id: "tag-1",
  courseId: "course-1",
  ownerId: "user-1",
  normalizedName: "gramática::tiempos",
  displayName: "Gramática::Tiempos",
  createdAt: "2026-09-04T00:00:00Z",
  updatedAt: "2026-09-04T00:00:00Z",
};

function fakeRepository(overrides: Partial<TagRepository> = {}): TagRepository {
  return {
    create: vi.fn().mockResolvedValue(persistedTag),
    rename: vi.fn().mockResolvedValue(persistedTag),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([persistedTag]),
    tagConcept: vi.fn().mockResolvedValue(undefined),
    untagConcept: vi.fn().mockResolvedValue(undefined),
    listForConcept: vi.fn().mockResolvedValue([persistedTag]),
    listConcepts: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("createTag", () => {
  it("valida el nombre (dominio) y delega con el displayName normalizado", async () => {
    const repository = fakeRepository();

    const outcome = await createTag(repository, "user-1", "course-1", "  Gramática :: Tiempos  ");

    expect(outcome).toEqual({ ok: true, tag: persistedTag });
    expect(repository.create).toHaveBeenCalledWith({
      ownerId: "user-1",
      courseId: "course-1",
      draft: { displayName: "Gramática :: Tiempos", normalizedName: "gramática::tiempos" },
    });
  });

  it("rechaza un nombre con segmento vacío sin tocar el repositorio", async () => {
    const repository = fakeRepository();

    const outcome = await createTag(repository, "user-1", "course-1", "a::");

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.issues).toContain("tag.name.emptySegment");
    }
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("propaga Library('duplicate') del adaptador (índice único por curso, LEX-3.3)", async () => {
    const dup = new LibraryError("duplicate", "ya existe");
    const repository = fakeRepository({ create: vi.fn().mockRejectedValue(dup) });

    await expect(createTag(repository, "user-1", "course-1", "Nivel::A1")).rejects.toBe(dup);
  });

  it("rechaza un identificador de usuario vacío", async () => {
    const repository = fakeRepository();
    await expect(createTag(repository, "", "course-1", "Nivel::A1")).rejects.toThrow();
  });
});

describe("renameTag", () => {
  it("valida y delega con el id de la etiqueta", async () => {
    const repository = fakeRepository();
    const outcome = await renameTag(repository, "user-1", "tag-9", "Nivel::B1");
    expect(outcome.ok).toBe(true);
    expect(repository.rename).toHaveBeenCalledWith({
      ownerId: "user-1",
      tagId: "tag-9",
      draft: { displayName: "Nivel::B1", normalizedName: "nivel::b1" },
    });
  });
});

describe("deleteTag", () => {
  it("borra de verdad (una etiqueta no tiene historial)", async () => {
    const repository = fakeRepository();
    await deleteTag(repository, "user-1", "tag-1");
    expect(repository.delete).toHaveBeenCalledWith({ ownerId: "user-1", tagId: "tag-1" });
  });
});

describe("tagConcept / untagConcept / listConceptTags", () => {
  it("etiqueta un concepto", async () => {
    const repository = fakeRepository();
    await tagConcept(repository, "user-1", { conceptId: "c-1", tagId: "tag-1" });
    expect(repository.tagConcept).toHaveBeenCalledWith({
      ownerId: "user-1",
      conceptId: "c-1",
      tagId: "tag-1",
    });
  });

  it("desetiqueta un concepto", async () => {
    const repository = fakeRepository();
    await untagConcept(repository, "user-1", { conceptId: "c-1", tagId: "tag-1" });
    expect(repository.untagConcept).toHaveBeenCalledWith({
      ownerId: "user-1",
      conceptId: "c-1",
      tagId: "tag-1",
    });
  });

  it("lista las etiquetas de un concepto", async () => {
    const repository = fakeRepository();
    await expect(listConceptTags(repository, "user-1", "c-1")).resolves.toEqual([persistedTag]);
    expect(repository.listForConcept).toHaveBeenCalledWith({ ownerId: "user-1", conceptId: "c-1" });
  });
});
