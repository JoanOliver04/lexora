import { describe, expect, it, vi } from "vitest";

import {
  archivePracticeItem,
  createPracticeItem,
  listPracticeItems,
  parsePracticeItemConfig,
  type PracticeItemRepository,
  updatePracticeItem,
} from "./practice-item";

const persistedItem = {
  id: "item-1",
  conceptId: "concept-1",
  ownerId: "user-1",
  mode: "cloze" as const,
  promptText: "La ___ es azul",
  answerText: "casa",
  hintText: null,
  config: { mode: "cloze" as const, answers: ["casa"] },
  enabled: true,
  archivedAt: null,
  createdAt: "2026-09-04T00:00:00Z",
  updatedAt: "2026-09-04T00:00:00Z",
};

function fakeRepository(overrides: Partial<PracticeItemRepository> = {}): PracticeItemRepository {
  return {
    create: vi.fn().mockResolvedValue(persistedItem),
    update: vi.fn().mockResolvedValue(persistedItem),
    setArchived: vi
      .fn()
      .mockResolvedValue({ ...persistedItem, archivedAt: "2026-09-04T01:00:00Z" }),
    listByConcept: vi.fn().mockResolvedValue([persistedItem]),
    ...overrides,
  };
}

describe("parsePracticeItemConfig", () => {
  it("acepta las formas válidas de los siete modos", () => {
    expect(parsePracticeItemConfig({ mode: "basic_recognition" })).toEqual({
      mode: "basic_recognition",
    });
    expect(parsePracticeItemConfig({ mode: "cloze", answers: ["a", "b"] })).toEqual({
      mode: "cloze",
      answers: ["a", "b"],
    });
    expect(parsePracticeItemConfig({ mode: "listening_dictation" })).toEqual({
      mode: "listening_dictation",
    });
  });

  it("rechaza cloze sin answers, un modo desconocido y un no-objeto", () => {
    expect(parsePracticeItemConfig({ mode: "cloze" })).toBeUndefined();
    expect(parsePracticeItemConfig({ mode: "telepathy" })).toBeUndefined();
    expect(parsePracticeItemConfig("cloze")).toBeUndefined();
  });
});

describe("createPracticeItem", () => {
  it("valida y delega con el borrador normalizado por el dominio", async () => {
    const repository = fakeRepository();

    const outcome = await createPracticeItem(repository, "user-1", "concept-1", {
      mode: "cloze",
      promptText: "La ___ es azul",
      answerText: "casa",
      hintText: null,
      config: { mode: "cloze", answers: ["casa", "  "] },
    });

    expect(outcome.ok).toBe(true);
    expect(repository.create).toHaveBeenCalledWith({
      ownerId: "user-1",
      conceptId: "concept-1",
      draft: {
        mode: "cloze",
        promptText: "La ___ es azul",
        answerText: "casa",
        hintText: null,
        config: { mode: "cloze", answers: ["casa"] },
      },
    });
  });

  it("acepta un modo básico con su config", async () => {
    const repository = fakeRepository();
    const outcome = await createPracticeItem(repository, "user-1", "concept-1", {
      mode: "basic_recognition",
      promptText: "casa",
      answerText: "house",
      hintText: null,
      config: { mode: "basic_recognition" },
    });
    expect(outcome.ok).toBe(true);
  });

  it("rechaza un config cuyo mode no cuadra con la columna mode", async () => {
    const repository = fakeRepository();
    const outcome = await createPracticeItem(repository, "user-1", "concept-1", {
      mode: "basic_recall",
      promptText: "house",
      answerText: "casa",
      hintText: null,
      config: { mode: "cloze" },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.issues).toContain("practiceItem.config.modeMismatch");
    }
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("rechaza un modo reservado pero no activable en la V1", async () => {
    const repository = fakeRepository();
    const outcome = await createPracticeItem(repository, "user-1", "concept-1", {
      mode: "listening_dictation",
      promptText: "audio",
      answerText: "casa",
      hintText: null,
      config: { mode: "listening_dictation" },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.issues).toContain("practiceItem.mode.notAvailableInV1");
    }
  });

  it("rechaza un identificador de usuario vacío", async () => {
    const repository = fakeRepository();
    await expect(
      createPracticeItem(repository, "", "concept-1", {
        mode: "basic_recognition",
        promptText: "x",
        answerText: "y",
        hintText: null,
        config: { mode: "basic_recognition" },
      }),
    ).rejects.toThrow();
  });
});

describe("updatePracticeItem", () => {
  it("valida y delega con el id del ítem", async () => {
    const repository = fakeRepository();
    const outcome = await updatePracticeItem(repository, "user-1", "item-3", {
      mode: "basic_recall",
      promptText: "house",
      answerText: "casa",
      hintText: "pista",
      config: { mode: "basic_recall" },
    });
    expect(outcome.ok).toBe(true);
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: "user-1", itemId: "item-3" }),
    );
  });
});

describe("archivePracticeItem / listPracticeItems", () => {
  it("archivar es setArchived(true)", async () => {
    const repository = fakeRepository();
    await archivePracticeItem(repository, "user-1", "item-1");
    expect(repository.setArchived).toHaveBeenCalledWith({
      ownerId: "user-1",
      itemId: "item-1",
      archived: true,
    });
  });

  it("listar por concepto excluye los archivados por defecto", async () => {
    const repository = fakeRepository();
    await listPracticeItems(repository, "user-1", "concept-1");
    expect(repository.listByConcept).toHaveBeenCalledWith({
      ownerId: "user-1",
      conceptId: "concept-1",
      includeArchived: false,
    });
  });
});
