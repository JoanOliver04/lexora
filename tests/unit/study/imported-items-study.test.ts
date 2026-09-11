import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { executeImport } from "@/modules/importing/application/execute-import";
import type { ImportJob, ImportJobRepository } from "@/modules/importing/application/import-job";
import { createPapaParseDelimitedFileParser } from "@/modules/importing/infrastructure/papaparse-delimited-file-parser";
import type { Concept } from "@/modules/library/domain/concept";
import type { Deck } from "@/modules/library/domain/deck";
import type { PracticeItem, PracticeItemDraft } from "@/modules/library/domain/practice-item";
import type { Tag } from "@/modules/library/domain/tag";
import { confirmReview, type ReviewCommitter } from "@/modules/study/application/confirm-review";
import { getDailyQueue, type DailyQueueRepository } from "@/modules/study/application/daily-queue";
import {
  ensureLearningState,
  type LearningStateRepository,
  type StoredLearningState,
} from "@/modules/study/application/learning-state";
import { snapshotLearningState, type LearningState } from "@/modules/study/domain/memory";
import { V1_SCHEDULER_CONFIG } from "@/modules/study/domain/scheduler-config";
import { V1_FROZEN_NEW_GOOD } from "@/modules/study/domain/scheduler-fixtures";
import { createTsFsrsScheduler } from "@/modules/study/infrastructure/ts-fsrs-scheduler";

/**
 * LEX-5.14: un TSV público de FASE 4 recorre alta, cola y commit.
 * Vive en `tests/unit` para poder cablear parser y adaptador reales
 * sin romper la regla de capas. No usa material privado de Anki.
 * Fuzz apagado para leer los fixtures congelados v1.
 */

const NOW = new Date("2026-09-11T10:00:00.000Z");
const NOW_ISO = NOW.toISOString();
const FIXTURE = resolve(process.cwd(), "tests/fixtures/import/basic-tab.txt");
const config = { ...V1_SCHEDULER_CONFIG, enableFuzz: false };
const scheduler = createTsFsrsScheduler();

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
  createdAt: NOW_ISO,
  updatedAt: NOW_ISO,
};

interface ReviewLogRow {
  ownerId: string;
  practiceItemId: string;
  idempotencyKey: string;
  rating: "again" | "hard" | "good" | "easy";
  reviewedAt: Date;
  stateBefore: LearningState;
}

function parseFixture(): { rawRows: { rowNumber: number; columns: string[] }[] } {
  const content = readFileSync(FIXTURE, "utf8");
  const parsed = createPapaParseDelimitedFileParser().parse(content);
  expect(parsed.issues).toEqual([]);
  expect(parsed.rawRows.length).toBeGreaterThan(0);
  return { rawRows: parsed.rawRows };
}

interface SharedBags {
  concepts: Concept[];
  items: PracticeItem[];
  states: Map<string, StoredLearningState>;
  logs: ReviewLogRow[];
  seq: { concept: number; item: number; state: number };
}

function emptyBags(): SharedBags {
  return {
    concepts: [],
    items: [],
    states: new Map(),
    logs: [],
    seq: { concept: 0, item: 0, state: 0 },
  };
}

function createWorld(ownerId: string, dailyNewLimit = 5, bags: SharedBags = emptyBags()) {
  const { concepts, items, states, logs, seq } = bags;

  const job: ImportJob = {
    id: `job-${ownerId}`,
    courseId: "course-1",
    ownerId,
    deckId: "deck-1",
    originalFilename: "basic-tab.txt",
    contentHash: "fixture",
    status: "importing",
    rowsTotal: 0,
    rowsCreated: 0,
    rowsSkipped: 0,
    rowsDuplicate: 0,
    rowsFailed: 0,
  };

  const jobs: ImportJobRepository = {
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
  };

  const importRepos = {
    jobs,
    decks: {
      list: vi.fn().mockResolvedValue([{ ...deck, ownerId }]),
      addConcept: vi.fn().mockResolvedValue(undefined),
    },
    concepts: {
      list: vi.fn().mockResolvedValue([] as Concept[]),
      create: vi
        .fn()
        .mockImplementation(async ({ draft }: { draft: { title: string; summary: string } }) => {
          seq.concept += 1;
          const next: Concept = {
            id: `${ownerId}-concept-${seq.concept}`,
            courseId: "course-1",
            ownerId,
            kind: "vocabulary",
            title: draft.title,
            canonicalKey: draft.title.toLowerCase(),
            summary: draft.summary,
            explanation: null,
            example: null,
            cefrLevel: null,
            sourceReference: null,
            archivedAt: null,
            createdAt: NOW_ISO,
            updatedAt: NOW_ISO,
          };
          concepts.push(next);
          return next;
        }),
    },
    practiceItems: {
      create: vi
        .fn()
        .mockImplementation(
          async ({ conceptId, draft }: { conceptId: string; draft: PracticeItemDraft }) => {
            seq.item += 1;
            const next: PracticeItem = {
              id: `${ownerId}-item-${seq.item}`,
              conceptId,
              ownerId,
              mode: draft.mode,
              promptText: draft.promptText,
              answerText: draft.answerText,
              hintText: draft.hintText,
              config: draft.config,
              enabled: true,
              archivedAt: null,
              createdAt: NOW_ISO,
              updatedAt: NOW_ISO,
            };
            items.push(next);
            return next;
          },
        ),
    },
    tags: {
      list: vi.fn().mockResolvedValue([] as Tag[]),
      create: vi
        .fn()
        .mockImplementation(
          async ({ draft }: { draft: { normalizedName: string; displayName: string } }) => ({
            id: `${ownerId}-tag-${draft.normalizedName}`,
            courseId: "course-1",
            ownerId,
            normalizedName: draft.normalizedName,
            displayName: draft.displayName,
            createdAt: NOW_ISO,
            updatedAt: NOW_ISO,
          }),
        ),
      tagConcept: vi.fn().mockResolvedValue(undefined),
    },
  };

  const learningStates: LearningStateRepository = {
    async getByItem({ ownerId: oid, practiceItemId }) {
      return states.get(`${oid}:${practiceItemId}`) ?? null;
    },
    async findPracticeItem({ ownerId: oid, practiceItemId }) {
      const item = items.find((row) => row.ownerId === oid && row.id === practiceItemId);
      if (!item) return null;
      return { id: item.id, archivedAt: item.archivedAt };
    },
    async create(input) {
      const stored: StoredLearningState = {
        id: `${input.ownerId}-state-${(seq.state += 1)}`,
        ownerId: input.ownerId,
        practiceItemId: input.practiceItemId,
        revision: 1,
        schedulerVersion: input.schedulerVersion,
        configVersion: input.configVersion,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
        state: input.state,
      };
      states.set(`${input.ownerId}:${input.practiceItemId}`, stored);
      return stored;
    },
  };

  const committer: ReviewCommitter = {
    async findByIdempotencyKey({ ownerId: oid, idempotencyKey }) {
      const row = logs.find((log) => log.ownerId === oid && log.idempotencyKey === idempotencyKey);
      if (!row) return null;
      return {
        practiceItemId: row.practiceItemId,
        rating: row.rating,
        reviewedAt: row.reviewedAt,
      };
    },
    async commit(input) {
      const replayed = logs.find(
        (log) => log.ownerId === input.ownerId && log.idempotencyKey === input.idempotencyKey,
      );
      if (replayed) return { ok: true, replayed: true };

      const key = `${input.ownerId}:${input.practiceItemId}`;
      const current = states.get(key);
      if (!current) return { ok: false, reason: "not-found" };
      if (current.revision !== input.expectedRevision) {
        return { ok: false, reason: "revision-conflict" };
      }

      states.set(key, {
        ...current,
        revision: current.revision + 1,
        updatedAt: input.reviewedAt.toISOString(),
        state: input.next,
      });
      logs.push({
        ownerId: input.ownerId,
        practiceItemId: input.practiceItemId,
        idempotencyKey: input.idempotencyKey,
        rating: input.rating,
        reviewedAt: input.reviewedAt,
        stateBefore: input.previous,
      });
      return { ok: true, replayed: false };
    },
  };

  const dailyQueue: DailyQueueRepository = {
    async getCourseLimits() {
      return { dailyNewLimit, maximumReviewsPerDay: null };
    },
    async listEligibleItems({ ownerId: oid }) {
      return items
        .filter((item) => item.ownerId === oid && item.enabled && item.archivedAt === null)
        .map((item) => {
          const stored = states.get(`${oid}:${item.id}`);
          if (!stored) {
            return {
              practiceItemId: item.id,
              phase: null,
              dueAt: null,
              learningStateId: null,
              revision: null,
            };
          }
          return {
            practiceItemId: item.id,
            phase: stored.state.phase,
            dueAt: stored.state.dueAt,
            learningStateId: stored.id,
            revision: stored.revision,
          };
        });
    },
    async countTodayActivity({ ownerId: oid, dayStart, dayEnd }) {
      const newIds = new Set<string>();
      let reviewsDone = 0;
      for (const row of logs) {
        if (row.ownerId !== oid) continue;
        if (row.reviewedAt < dayStart || row.reviewedAt >= dayEnd) continue;
        if (row.stateBefore.phase === "new") newIds.add(row.practiceItemId);
        if (row.stateBefore.phase === "review") reviewsDone += 1;
      }
      return { newIntroduced: newIds.size, reviewsDone };
    },
    async getTimeZone() {
      return "Europe/Madrid";
    },
  };

  const ownedItems = () => items.filter((item) => item.ownerId === ownerId);
  const ownedConcepts = () => concepts.filter((concept) => concept.ownerId === ownerId);

  return {
    ownerId,
    items: ownedItems,
    concepts: ownedConcepts,
    logs,
    importRepos,
    learningStates,
    committer,
    dailyQueue,
  };
}

async function importFixture(
  world: ReturnType<typeof createWorld>,
  createReverse: boolean,
): Promise<void> {
  const { rawRows } = parseFixture();
  const outcome = await executeImport(
    {
      ownerId: world.ownerId,
      courseId: "course-1",
      deckId: "deck-1",
      filename: "basic-tab.txt",
      contentHash: "fixture",
      mapping: { front: 0, back: 1, tags: 2 },
      strategy: "skip",
      createReverse,
      rawRows,
      locale: "es",
    },
    world.importRepos,
  );
  expect(outcome.ok).toBe(true);
}

describe("ítems importados en el estudio (LEX-5.14)", () => {
  it("un TSV público se importa, se activa, entra en la cola y se confirma", async () => {
    const world = createWorld("user-a");
    await importFixture(world, false);

    expect(world.items()).toHaveLength(2);
    expect(world.items().every((item) => item.mode === "basic_recognition")).toBe(true);
    expect(
      world
        .items()
        .map((item) => item.promptText)
        .sort(),
    ).toEqual(["break the ice", "take off"]);

    const beforeEnsure = await getDailyQueue(world.dailyQueue, {
      ownerId: "user-a",
      courseId: "course-1",
      now: NOW,
      timeZone: "Europe/Madrid",
    });
    expect(beforeEnsure.ok).toBe(true);
    if (!beforeEnsure.ok) return;
    expect(beforeEnsure.queue.entries).toHaveLength(2);
    expect(beforeEnsure.queue.entries.every((entry) => entry.group === "new")).toBe(true);
    expect(beforeEnsure.queue.entries.every((entry) => entry.learningStateId === null)).toBe(true);

    for (const item of world.items()) {
      const ensured = await ensureLearningState(world.learningStates, scheduler, {
        ownerId: "user-a",
        practiceItemId: item.id,
        now: NOW,
        config,
      });
      expect(ensured.ok).toBe(true);
      if (!ensured.ok) return;
      expect(ensured.created).toBe(true);
      expect(ensured.stored.state.phase).toBe("new");
    }

    const queued = await getDailyQueue(world.dailyQueue, {
      ownerId: "user-a",
      courseId: "course-1",
      now: NOW,
      timeZone: "Europe/Madrid",
    });
    expect(queued.ok).toBe(true);
    if (!queued.ok) return;
    const first = queued.queue.entries[0];
    expect(first).toBeDefined();
    if (!first) return;
    expect(first.group).toBe("new");
    expect(first.revision).toBe(1);

    const confirmed = await confirmReview(world.learningStates, scheduler, world.committer, {
      ownerId: "user-a",
      practiceItemId: first.practiceItemId,
      rating: "good",
      expectedRevision: 1,
      idempotencyKey: "import-good-1",
      now: NOW,
      config,
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.replayed).toBe(false);
    expect(snapshotLearningState(confirmed.transition.state)).toEqual(V1_FROZEN_NEW_GOOD.after);

    const replayed = await confirmReview(world.learningStates, scheduler, world.committer, {
      ownerId: "user-a",
      practiceItemId: first.practiceItemId,
      rating: "good",
      expectedRevision: 1,
      idempotencyKey: "import-good-1",
      now: NOW,
      config,
    });
    expect(replayed.ok).toBe(true);
    if (!replayed.ok) return;
    expect(replayed.replayed).toBe(true);
    expect(world.logs).toHaveLength(1);

    const after = await getDailyQueue(world.dailyQueue, {
      ownerId: "user-a",
      courseId: "course-1",
      now: NOW,
      timeZone: "Europe/Madrid",
    });
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.queue.entries.map((entry) => entry.practiceItemId)).not.toContain(
      first.practiceItemId,
    );
    expect(after.queue.entries).toHaveLength(1);
    expect(after.queue.entries[0]?.group).toBe("new");
    expect(after.queue.nextDueAt?.toISOString()).toBe(V1_FROZEN_NEW_GOOD.after.dueAt);
  });

  it("la inversa duplica el cupo de nuevos por PracticeItem, no por concepto", async () => {
    const world = createWorld("user-a", 3);
    await importFixture(world, true);

    expect(world.items()).toHaveLength(4);
    expect(world.concepts()).toHaveLength(2);
    expect(world.items().filter((item) => item.mode === "basic_recognition")).toHaveLength(2);
    expect(world.items().filter((item) => item.mode === "basic_recall")).toHaveLength(2);

    const queued = await getDailyQueue(world.dailyQueue, {
      ownerId: "user-a",
      courseId: "course-1",
      now: NOW,
      timeZone: "Europe/Madrid",
    });
    expect(queued.ok).toBe(true);
    if (!queued.ok) return;
    expect(queued.queue.entries).toHaveLength(3);
    expect(queued.queue.hiddenNew).toBe(1);
    expect(queued.queue.entries.every((entry) => entry.group === "new")).toBe(true);
  });

  it("dos dueños con el mismo TSV no mezclan colas ni estados", async () => {
    const bags = emptyBags();
    const alice = createWorld("alice", 5, bags);
    const bob = createWorld("bob", 5, bags);
    await importFixture(alice, false);
    await importFixture(bob, false);

    expect(alice.items().map((item) => item.id)).not.toEqual(bob.items().map((item) => item.id));

    const firstAlice = alice.items()[0];
    expect(firstAlice).toBeDefined();
    if (!firstAlice) return;
    const ensured = await ensureLearningState(alice.learningStates, scheduler, {
      ownerId: "alice",
      practiceItemId: firstAlice.id,
      now: NOW,
      config,
    });
    expect(ensured.ok).toBe(true);

    const bobSeesAlice = await bob.learningStates.findPracticeItem({
      ownerId: "bob",
      practiceItemId: firstAlice.id,
    });
    expect(bobSeesAlice).toBeNull();

    const bobQueue = await getDailyQueue(bob.dailyQueue, {
      ownerId: "bob",
      courseId: "course-1",
      now: NOW,
      timeZone: "Europe/Madrid",
    });
    expect(bobQueue.ok).toBe(true);
    if (!bobQueue.ok) return;
    expect(bobQueue.queue.entries.map((entry) => entry.practiceItemId)).toEqual(
      bob
        .items()
        .map((item) => item.id)
        .sort(),
    );
    expect(bobQueue.queue.entries.map((entry) => entry.practiceItemId)).not.toContain(
      firstAlice.id,
    );
  });
});
