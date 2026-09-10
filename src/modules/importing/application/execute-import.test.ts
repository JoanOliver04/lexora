import { describe, expect, it, vi } from "vitest";

import type { Concept } from "@/modules/library/domain/concept";
import type { Deck } from "@/modules/library/domain/deck";
import type { PracticeItem } from "@/modules/library/domain/practice-item";
import type { Tag } from "@/modules/library/domain/tag";

import { executeImport } from "./execute-import";
import type { ImportJob, ImportJobRepository } from "./import-job";

const deck: Deck = {
  id: "deck-1",
  courseId: "course-1",
  ownerId: "user-1",
  title: "Vocab",
  description: null,
  cefrLevel: null,
  category: null,
  position: 0,
  archivedAt: null,
  createdAt: "2026-09-10T00:00:00Z",
  updatedAt: "2026-09-10T00:00:00Z",
};

const concept: Concept = {
  id: "concept-1",
  courseId: "course-1",
  ownerId: "user-1",
  kind: "vocabulary",
  title: "break the ice",
  canonicalKey: "break the ice",
  summary: "romper el hielo",
  explanation: null,
  example: null,
  cefrLevel: null,
  sourceReference: null,
  archivedAt: null,
  createdAt: "2026-09-10T00:00:00Z",
  updatedAt: "2026-09-10T00:00:00Z",
};

const item: PracticeItem = {
  id: "item-1",
  conceptId: "concept-1",
  ownerId: "user-1",
  mode: "basic_recognition",
  promptText: "break the ice",
  answerText: "romper el hielo",
  hintText: null,
  config: { mode: "basic_recognition" },
  enabled: true,
  archivedAt: null,
  createdAt: "2026-09-10T00:00:00Z",
  updatedAt: "2026-09-10T00:00:00Z",
};

const job: ImportJob = {
  id: "job-1",
  courseId: "course-1",
  ownerId: "user-1",
  deckId: "deck-1",
  originalFilename: "mazo.txt",
  contentHash: "abc",
  status: "importing",
  rowsTotal: 0,
  rowsCreated: 0,
  rowsSkipped: 0,
  rowsDuplicate: 0,
  rowsFailed: 0,
};

function jobsRepo(overrides: Partial<ImportJobRepository> = {}): ImportJobRepository {
  return {
    create: vi.fn().mockResolvedValue(job),
    complete: vi.fn().mockImplementation(async (input) => ({
      ...job,
      status: "completed" as const,
      rowsTotal: input.rowsTotal,
      rowsCreated: input.rowsCreated,
      rowsSkipped: input.rowsSkipped,
      rowsDuplicate: input.rowsDuplicate,
      rowsFailed: input.rowsFailed,
    })),
    fail: vi.fn().mockResolvedValue(undefined),
    addError: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function repos(
  options: {
    existingConcepts?: Concept[];
    jobs?: ImportJobRepository;
    decks?: Deck[];
  } = {},
) {
  const jobs = options.jobs ?? jobsRepo();
  const created: Concept[] = [];
  return {
    jobs,
    decks: {
      list: vi.fn().mockResolvedValue(options.decks ?? [deck]),
      addConcept: vi.fn().mockResolvedValue(undefined),
    },
    concepts: {
      list: vi.fn().mockResolvedValue(options.existingConcepts ?? []),
      create: vi.fn().mockImplementation(async ({ draft }) => {
        const next = {
          ...concept,
          id: `concept-${created.length + 1}`,
          title: draft.title,
          canonicalKey: draft.title.toLowerCase(),
          summary: draft.summary,
        };
        created.push(next);
        return next;
      }),
    },
    practiceItems: {
      create: vi.fn().mockResolvedValue(item),
    },
    tags: {
      list: vi.fn().mockResolvedValue([] as Tag[]),
      create: vi.fn().mockImplementation(async ({ draft }) => ({
        id: `tag-${draft.normalizedName}`,
        courseId: "course-1",
        ownerId: "user-1",
        normalizedName: draft.normalizedName,
        displayName: draft.displayName,
        createdAt: "2026-09-10T00:00:00Z",
        updatedAt: "2026-09-10T00:00:00Z",
      })),
      tagConcept: vi.fn().mockResolvedValue(undefined),
    },
    created,
  };
}

const baseInput = {
  ownerId: "user-1",
  courseId: "course-1",
  deckId: "deck-1",
  filename: "mazo.txt",
  contentHash: "abc",
  mapping: { front: 0, back: 1, tags: 2 as number | null },
  strategy: "skip" as const,
  createReverse: false,
  locale: "es",
};

describe("executeImport", () => {
  it("crea concepto e ítem por fila nueva y completa el trabajo", async () => {
    const fake = repos();
    const outcome = await executeImport(
      {
        ...baseInput,
        rawRows: [
          { rowNumber: 1, columns: ["break the ice", "romper el hielo", "idioms"] },
          { rowNumber: 2, columns: ["take off", "despegar", "phrasal_verbs"] },
        ],
      },
      fake,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.rowsCreated).toBe(2);
    expect(outcome.result.rowsFailed).toBe(0);
    expect(outcome.result.rowsSkipped).toBe(0);
    expect(fake.concepts.create).toHaveBeenCalledTimes(2);
    expect(fake.practiceItems.create).toHaveBeenCalledTimes(2);
    expect(fake.decks.addConcept).toHaveBeenCalledTimes(2);
    expect(fake.tags.create).toHaveBeenCalledTimes(2);
    expect(fake.jobs.complete).toHaveBeenCalledWith(
      expect.objectContaining({ rowsCreated: 2, rowsTotal: 2, rowsFailed: 0 }),
    );
  });

  it("skip no crea duplicados de biblioteca; copy sí", async () => {
    const existing = [{ ...concept, canonicalKey: "break the ice" }];
    const skipped = repos({ existingConcepts: existing });
    const skipOutcome = await executeImport(
      {
        ...baseInput,
        strategy: "skip",
        rawRows: [{ rowNumber: 1, columns: ["break the ice", "romper el hielo", ""] }],
      },
      skipped,
    );
    expect(skipOutcome.ok).toBe(true);
    if (skipOutcome.ok) {
      expect(skipOutcome.result.rowsCreated).toBe(0);
      expect(skipOutcome.result.rowsSkipped).toBe(1);
      expect(skipOutcome.result.rowsDuplicate).toBe(1);
    }
    expect(skipped.concepts.create).not.toHaveBeenCalled();

    const copied = repos({ existingConcepts: existing });
    const copyOutcome = await executeImport(
      {
        ...baseInput,
        strategy: "copy",
        rawRows: [{ rowNumber: 1, columns: ["break the ice", "romper el hielo", ""] }],
      },
      copied,
    );
    expect(copyOutcome.ok).toBe(true);
    if (copyOutcome.ok) {
      expect(copyOutcome.result.rowsCreated).toBe(1);
      expect(copyOutcome.result.rowsSkipped).toBe(0);
      expect(copyOutcome.result.rowsDuplicate).toBe(1);
    }
    expect(copied.concepts.create).toHaveBeenCalledTimes(1);
  });

  it("una fila inválida se registra y el lote sigue", async () => {
    const fake = repos();
    const outcome = await executeImport(
      {
        ...baseInput,
        rawRows: [
          { rowNumber: 1, columns: ["", "back", "t"] },
          { rowNumber: 2, columns: ["hello", "hola", ""] },
        ],
      },
      fake,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.rowsCreated).toBe(1);
    expect(outcome.result.rowsFailed).toBe(1);
    expect(fake.jobs.addError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "front_empty", rowNumber: 1 }),
    );
  });

  it("un frente más largo que el título de concepto se rechaza sin abortar", async () => {
    const fake = repos();
    const outcome = await executeImport(
      {
        ...baseInput,
        rawRows: [{ rowNumber: 1, columns: ["f".repeat(201), "back", ""] }],
      },
      fake,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.rowsCreated).toBe(0);
    expect(outcome.result.rowsFailed).toBe(1);
    expect(fake.jobs.addError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "front_too_long" }),
    );
    expect(fake.concepts.create).not.toHaveBeenCalled();
  });

  it("sin mazo del curso → no-deck y no crea trabajo", async () => {
    const fake = repos({ decks: [] });
    const outcome = await executeImport(
      {
        ...baseInput,
        rawRows: [{ rowNumber: 1, columns: ["a", "b", ""] }],
      },
      fake,
    );
    expect(outcome).toEqual({ ok: false, error: "no-deck" });
    expect(fake.jobs.create).not.toHaveBeenCalled();
  });

  it("inversa pide un segundo ítem del mismo concepto", async () => {
    const fake = repos();
    await executeImport(
      {
        ...baseInput,
        createReverse: true,
        rawRows: [{ rowNumber: 1, columns: ["hello", "hola", ""] }],
      },
      fake,
    );
    expect(fake.practiceItems.create).toHaveBeenCalledTimes(2);
  });
});
