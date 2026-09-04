import { describe, expect, it, vi } from "vitest";

import {
  addConceptToDeck,
  archiveDeck,
  createDeck,
  type DeckRepository,
  listDecks,
  removeConceptFromDeck,
  reorderDecks,
  restoreDeck,
  updateDeck,
} from "./deck";

const validRaw = {
  title: "Verbos irregulares",
  description: "Los más frecuentes",
  cefrLevel: "A2",
  category: "grammar",
};

const persistedDeck = {
  id: "deck-1",
  courseId: "course-1",
  ownerId: "user-1",
  title: "Verbos irregulares",
  description: "Los más frecuentes",
  cefrLevel: "A2" as const,
  category: "grammar" as const,
  position: 0,
  archivedAt: null,
  createdAt: "2026-09-04T00:00:00Z",
  updatedAt: "2026-09-04T00:00:00Z",
};

function fakeRepository(overrides: Partial<DeckRepository> = {}): DeckRepository {
  return {
    create: vi.fn().mockResolvedValue(persistedDeck),
    update: vi.fn().mockResolvedValue(persistedDeck),
    setArchived: vi
      .fn()
      .mockResolvedValue({ ...persistedDeck, archivedAt: "2026-09-04T01:00:00Z" }),
    list: vi.fn().mockResolvedValue([persistedDeck]),
    addConcept: vi.fn().mockResolvedValue(undefined),
    removeConcept: vi.fn().mockResolvedValue(undefined),
    listConcepts: vi.fn().mockResolvedValue([]),
    reorder: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("createDeck", () => {
  it("valida el borrador (dominio) y delega la escritura con el valor normalizado", async () => {
    const repository = fakeRepository();

    const outcome = await createDeck(repository, "user-1", "course-1", validRaw);

    expect(outcome).toEqual({ ok: true, deck: persistedDeck });
    expect(repository.create).toHaveBeenCalledWith({
      ownerId: "user-1",
      courseId: "course-1",
      draft: {
        title: "Verbos irregulares",
        description: "Los más frecuentes",
        cefrLevel: "A2",
        category: "grammar",
      },
    });
  });

  it("no toca el repositorio si el borrador no es válido y devuelve las claves de error", async () => {
    const repository = fakeRepository();

    const outcome = await createDeck(repository, "user-1", "course-1", {
      title: "  ",
      category: "x",
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.issues).toContain("deck.title.empty");
      expect(outcome.issues).toContain("deck.category.invalid");
    }
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("rechaza un identificador de usuario vacío (error de programación)", async () => {
    const repository = fakeRepository();

    await expect(createDeck(repository, "  ", "course-1", validRaw)).rejects.toThrow();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("propaga el fallo del repositorio sin envolverlo de nuevo", async () => {
    const boom = new Error("infra caída");
    const repository = fakeRepository({ create: vi.fn().mockRejectedValue(boom) });

    await expect(createDeck(repository, "user-1", "course-1", validRaw)).rejects.toBe(boom);
  });
});

describe("updateDeck", () => {
  it("valida y delega con el id del mazo", async () => {
    const repository = fakeRepository();

    const outcome = await updateDeck(repository, "user-1", "deck-9", validRaw);

    expect(outcome.ok).toBe(true);
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: "user-1", deckId: "deck-9" }),
    );
  });
});

describe("archiveDeck / restoreDeck", () => {
  it("archivar es setArchived(true)", async () => {
    const repository = fakeRepository();
    await archiveDeck(repository, "user-1", "deck-1");
    expect(repository.setArchived).toHaveBeenCalledWith({
      ownerId: "user-1",
      deckId: "deck-1",
      archived: true,
    });
  });

  it("restaurar es setArchived(false)", async () => {
    const repository = fakeRepository();
    await restoreDeck(repository, "user-1", "deck-1");
    expect(repository.setArchived).toHaveBeenCalledWith({
      ownerId: "user-1",
      deckId: "deck-1",
      archived: false,
    });
  });
});

describe("listDecks", () => {
  it("por defecto excluye los archivados", async () => {
    const repository = fakeRepository();
    await listDecks(repository, "user-1", "course-1");
    expect(repository.list).toHaveBeenCalledWith({
      ownerId: "user-1",
      courseId: "course-1",
      includeArchived: false,
    });
  });

  it("incluye los archivados si se pide", async () => {
    const repository = fakeRepository();
    await listDecks(repository, "user-1", "course-1", { includeArchived: true });
    expect(repository.list).toHaveBeenCalledWith({
      ownerId: "user-1",
      courseId: "course-1",
      includeArchived: true,
    });
  });
});

describe("reorderDecks", () => {
  it("delega el orden completo en el repositorio", async () => {
    const repository = fakeRepository();
    await reorderDecks(repository, "user-1", "course-1", ["deck-3", "deck-1", "deck-2"]);
    expect(repository.reorder).toHaveBeenCalledWith({
      ownerId: "user-1",
      courseId: "course-1",
      deckIds: ["deck-3", "deck-1", "deck-2"],
    });
  });

  it("rechaza un identificador de usuario vacío", async () => {
    const repository = fakeRepository();
    await expect(reorderDecks(repository, "  ", "course-1", ["deck-1"])).rejects.toThrow();
    expect(repository.reorder).not.toHaveBeenCalled();
  });
});

describe("addConceptToDeck / removeConceptFromDeck", () => {
  it("añade con posición nula por defecto", async () => {
    const repository = fakeRepository();
    await addConceptToDeck(repository, "user-1", { deckId: "deck-1", conceptId: "c-1" });
    expect(repository.addConcept).toHaveBeenCalledWith({
      ownerId: "user-1",
      deckId: "deck-1",
      conceptId: "c-1",
      position: null,
    });
  });

  it("quita el enlace", async () => {
    const repository = fakeRepository();
    await removeConceptFromDeck(repository, "user-1", { deckId: "deck-1", conceptId: "c-1" });
    expect(repository.removeConcept).toHaveBeenCalledWith({
      ownerId: "user-1",
      deckId: "deck-1",
      conceptId: "c-1",
    });
  });
});
