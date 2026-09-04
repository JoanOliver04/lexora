import { describe, expect, it, vi } from "vitest";

import {
  archiveConcept,
  type ConceptRepository,
  createConcept,
  getConcept,
  listConcepts,
  updateConcept,
} from "./concept";

const validRaw = {
  kind: "vocabulary",
  title: "casa",
  summary: "edificio para vivir",
  explanation: null,
  example: "vivo en una casa",
  cefrLevel: "A1",
  sourceReference: null,
};

const persistedConcept = {
  id: "concept-1",
  courseId: "course-1",
  ownerId: "user-1",
  kind: "vocabulary" as const,
  title: "casa",
  canonicalKey: "casa",
  summary: "edificio para vivir",
  explanation: null,
  example: "vivo en una casa",
  cefrLevel: "A1" as const,
  sourceReference: null,
  archivedAt: null,
  createdAt: "2026-09-04T00:00:00Z",
  updatedAt: "2026-09-04T00:00:00Z",
};

function fakeRepository(overrides: Partial<ConceptRepository> = {}): ConceptRepository {
  return {
    create: vi.fn().mockResolvedValue(persistedConcept),
    update: vi.fn().mockResolvedValue(persistedConcept),
    setArchived: vi
      .fn()
      .mockResolvedValue({ ...persistedConcept, archivedAt: "2026-09-04T01:00:00Z" }),
    list: vi.fn().mockResolvedValue([persistedConcept]),
    get: vi.fn().mockResolvedValue(persistedConcept),
    ...overrides,
  };
}

describe("createConcept", () => {
  it("valida y delega con el borrador normalizado (canonical_key lo pone la base)", async () => {
    const repository = fakeRepository();

    const outcome = await createConcept(repository, "user-1", "course-1", validRaw);

    expect(outcome).toEqual({ ok: true, concept: persistedConcept });
    expect(repository.create).toHaveBeenCalledWith({
      ownerId: "user-1",
      courseId: "course-1",
      draft: {
        kind: "vocabulary",
        title: "casa",
        summary: "edificio para vivir",
        explanation: null,
        example: "vivo en una casa",
        cefrLevel: "A1",
        sourceReference: null,
      },
    });
  });

  it("devuelve todas las claves de error de un borrador inválido, sin tocar el repositorio", async () => {
    const repository = fakeRepository();

    const outcome = await createConcept(repository, "user-1", "course-1", { kind: "nope" });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.issues).toContain("concept.kind.invalid");
      expect(outcome.issues).toContain("concept.title.empty");
      expect(outcome.issues).toContain("concept.summary.empty");
    }
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("rechaza un identificador de usuario vacío", async () => {
    const repository = fakeRepository();
    await expect(createConcept(repository, " ", "course-1", validRaw)).rejects.toThrow();
  });
});

describe("updateConcept", () => {
  it("valida y delega con el id del concepto", async () => {
    const repository = fakeRepository();
    const outcome = await updateConcept(repository, "user-1", "concept-7", validRaw);
    expect(outcome.ok).toBe(true);
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: "user-1", conceptId: "concept-7" }),
    );
  });
});

describe("archiveConcept", () => {
  it("es setArchived(true)", async () => {
    const repository = fakeRepository();
    await archiveConcept(repository, "user-1", "concept-1");
    expect(repository.setArchived).toHaveBeenCalledWith({
      ownerId: "user-1",
      conceptId: "concept-1",
      archived: true,
    });
  });
});

describe("listConcepts", () => {
  it("por defecto excluye los archivados", async () => {
    const repository = fakeRepository();
    await listConcepts(repository, "user-1", "course-1");
    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({ includeArchived: false }),
    );
  });
});

describe("getConcept", () => {
  it("propaga null si no existe", async () => {
    const repository = fakeRepository({ get: vi.fn().mockResolvedValue(null) });
    await expect(getConcept(repository, "user-1", "missing")).resolves.toBeNull();
  });
});
