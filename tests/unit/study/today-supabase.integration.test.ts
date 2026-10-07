import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getTodayOverview } from "@/modules/study/application/today-overview";
import { createSupabaseDailyQueueRepository } from "@/modules/study/infrastructure/supabase-daily-queue-repository";
import { createSupabaseTodayOverviewRepository } from "@/modules/study/infrastructure/supabase-today-overview-repository";
import { createSupabaseTodayDashboardRepository } from "@/modules/study/infrastructure/supabase-today-dashboard-repository";
import { createSupabaseStudySessionRepository } from "@/modules/study/infrastructure/supabase-study-session-repository";
import { createStudySession, getStudySession } from "@/modules/study/application/study-session";
import type { Database } from "@/shared/infrastructure/supabase/database.types";
import { createSupabaseStudyCardRepository } from "@/modules/study/infrastructure/supabase-study-card-repository";
import {
  getStudySessionCard,
  revealStudySessionCard,
} from "@/modules/study/application/study-card";

// Explicit local/CI gate. Unit checks do not require Docker; CI's database job runs this suite.
const enabled = process.env["LEXORA_DB_TESTS"] === "1";
const NOW = new Date("2026-10-06T10:00:00.000Z");
const OLD = "2026-08-01T10:00:00.000Z";
const FUTURE = "2026-10-07T10:00:00.000Z";
type Client = SupabaseClient<Database>;
type Insert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

async function checked<T>(
  query: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

describe.skipIf(!enabled)("Today repositories against local Supabase", () => {
  let clientA: Client;
  let clientB: Client;
  let anonymous: Client;
  let ownerA: string;
  let ownerB: string;
  const mainCourse = randomUUID();
  const otherCourse = randomUUID();
  const largeCourse = randomUUID();
  const mainDeck = randomUUID();
  const extraDeck = randomUUID();
  const archivedDeck = randomUUID();
  const activeConcept = randomUUID();
  const otherConcept = randomUUID();
  const archivedConcept = randomUUID();
  const archivedDeckConcept = randomUUID();
  const orphanConcept = randomUUID();
  const newItems = [randomUUID(), randomUUID(), randomUUID()];
  const learning = randomUUID();
  const relearning = randomUUID();
  const futureLearning = randomUUID();
  const reviews = [randomUUID(), randomUUID(), randomUUID()];
  const futureDifficult = randomUUID();
  const reservedModes = [
    "listening_dictation",
    "guided_production",
    "free_production",
    "pronunciation",
  ] as const;
  const reservedIds = reservedModes.map(() => randomUUID());
  const eligibleIds = [
    ...newItems,
    learning,
    relearning,
    futureLearning,
    ...reviews,
    futureDifficult,
  ];
  const largeIds = Array.from({ length: 1101 }, () => randomUUID());

  beforeAll(async () => {
    if (!process.env["NEXT_PUBLIC_SUPABASE_URL"]) process.loadEnvFile(".env.local");
    const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]!;
    const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]!;
    const parsed = new URL(url);
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || parsed.port !== "54321") {
      throw new Error("Integration fixtures require local Supabase on port 54321");
    }
    const makeClient = () =>
      createClient<Database>(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
    anonymous = makeClient();
    async function user(): Promise<{ client: Client; ownerId: string }> {
      const client = makeClient();
      const auth = await checked(
        client.auth.signUp({ email: `lex61-${randomUUID()}@example.com`, password: randomUUID() }),
      );
      if (!auth.user || !auth.session)
        throw new Error("Local integration signup must return a session");
      await checked(client.from("profiles").insert({ id: auth.user.id }));
      return { client, ownerId: auth.user.id };
    }
    const a = await user();
    clientA = a.client;
    ownerA = a.ownerId;
    const b = await user();
    clientB = b.client;
    ownerB = b.ownerId;
    const languages = await checked(clientA.from("languages").select("id, locale"));
    const source = languages!.find((row) => row.locale === "es")!.id;
    const target = languages!.find((row) => row.locale === "en")!.id;
    await checked(
      clientA.from("courses").insert(
        [mainCourse, otherCourse, largeCourse].map((id) => ({
          id,
          owner_id: ownerA,
          title: "LEX-6.1 synthetic fixture",
          source_language_id: source,
          target_language_id: target,
        })),
      ),
    );
    await checked(
      clientA.from("course_settings").insert([
        { course_id: mainCourse, user_id: ownerA, daily_new_limit: 2, maximum_reviews_per_day: 2 },
        { course_id: otherCourse, user_id: ownerA, daily_new_limit: 2 },
        { course_id: largeCourse, user_id: ownerA, daily_new_limit: 2 },
      ]),
    );
    await checked(
      clientA.from("decks").insert([
        { id: mainDeck, course_id: mainCourse, owner_id: ownerA, title: "Main" },
        { id: extraDeck, course_id: mainCourse, owner_id: ownerA, title: "Shared concept" },
        {
          id: archivedDeck,
          course_id: mainCourse,
          owner_id: ownerA,
          title: "Archived",
          archived_at: NOW.toISOString(),
        },
      ]),
    );
    await checked(
      clientA.from("concepts").insert([
        ...[activeConcept, archivedConcept, archivedDeckConcept, orphanConcept].map((id) => ({
          id,
          owner_id: ownerA,
          course_id: mainCourse,
          kind: "vocabulary" as const,
          title: "Synthetic",
          summary: "Original test content",
          archived_at: id === archivedConcept ? NOW.toISOString() : null,
        })),
        {
          id: otherConcept,
          owner_id: ownerA,
          course_id: otherCourse,
          kind: "vocabulary",
          title: "Other course",
          summary: "Original test content",
        },
      ]),
    );
    await checked(
      clientA.from("deck_concepts").insert([
        { owner_id: ownerA, deck_id: mainDeck, concept_id: activeConcept },
        { owner_id: ownerA, deck_id: extraDeck, concept_id: activeConcept },
        { owner_id: ownerA, deck_id: mainDeck, concept_id: archivedConcept },
        { owner_id: ownerA, deck_id: archivedDeck, concept_id: archivedDeckConcept },
        // The schema allows same-owner cross-course links; eligibility must not.
        { owner_id: ownerA, deck_id: mainDeck, concept_id: otherConcept },
      ]),
    );
    const item = (id: string, conceptId: string): Insert<"practice_items"> => ({
      id,
      concept_id: conceptId,
      owner_id: ownerA,
      mode: "basic_recognition",
      prompt_text: "Synthetic prompt",
      answer_text: "Synthetic answer",
      config: { mode: "basic_recognition" },
      enabled: true,
      archived_at: null,
    });
    await checked(
      clientA.from("practice_items").insert([
        ...eligibleIds.map((id) => item(id, activeConcept)),
        item(randomUUID(), archivedConcept),
        item(randomUUID(), archivedDeckConcept),
        item(randomUUID(), orphanConcept),
        item(randomUUID(), otherConcept),
        { ...item(randomUUID(), activeConcept), enabled: false },
        { ...item(randomUUID(), activeConcept), archived_at: NOW.toISOString() },
        ...reservedModes.map((mode, index) => ({
          ...item(reservedIds[index]!, activeConcept),
          mode,
          config: { mode },
        })),
      ]),
    );
    const state = (
      id: string,
      phase: NonNullable<Insert<"learning_states">["phase"]>,
      dueAt = NOW.toISOString(),
      lapses = 0,
    ): Insert<"learning_states"> => ({
      owner_id: ownerA,
      practice_item_id: id,
      phase,
      due_at: dueAt,
      lapses,
      scheduler_version: "5.4.2",
      config_version: "v1",
    });
    await checked(
      clientA
        .from("learning_states")
        .insert([
          state(newItems[1]!, "new"),
          state(learning, "learning"),
          state(relearning, "relearning"),
          state(futureLearning, "learning", FUTURE),
          ...reviews.map((id) => state(id, "review")),
          state(futureDifficult, "review", FUTURE, 3),
        ]),
    );
    const log = (
      id: string,
      rating: Insert<"review_logs">["rating"],
      reviewedAt: string,
      durationMs: number | null,
    ): Insert<"review_logs"> => ({
      owner_id: ownerA,
      practice_item_id: id,
      idempotency_key: randomUUID(),
      rating,
      reviewed_at: reviewedAt,
      duration_ms: durationMs,
      state_before: { phase: "review" },
      state_after: { phase: "review" },
      due_before: OLD,
      due_after: FUTURE,
      scheduler_version: "5.4.2",
      config_version: "v1",
    });
    const logs = Array.from({ length: 1005 }, (_, index) =>
      log(reviews[0]!, "good", new Date(NOW.getTime() - index * 1000).toISOString(), 25_000),
    );
    for (let from = 0; from < logs.length; from += 500)
      await checked(clientA.from("review_logs").insert(logs.slice(from, from + 500)));
    await checked(
      clientA
        .from("review_logs")
        .insert([
          log(reviews[2]!, "again", OLD, null),
          log(reviews[2]!, "good", "2026-08-02T10:00:00.000Z", null),
          log(reviews[2]!, "again", "2026-08-03T10:00:00.000Z", null),
          log(reviews[0]!, "again", FUTURE, 500_000),
        ]),
    );
    const largeDeck = randomUUID();
    await checked(
      clientA
        .from("decks")
        .insert({ id: largeDeck, owner_id: ownerA, course_id: largeCourse, title: "Large" }),
    );
    const largeConcepts = largeIds.map(() => randomUUID());
    for (let from = 0; from < largeIds.length; from += 500) {
      const ids = largeIds.slice(from, from + 500);
      const concepts = largeConcepts.slice(from, from + 500);
      await checked(
        clientA.from("concepts").insert(
          concepts.map((id) => ({
            id,
            owner_id: ownerA,
            course_id: largeCourse,
            kind: "vocabulary" as const,
            title: "Synthetic bulk",
            summary: "Original test content",
          })),
        ),
      );
      await checked(
        clientA
          .from("deck_concepts")
          .insert(concepts.map((id) => ({ owner_id: ownerA, deck_id: largeDeck, concept_id: id }))),
      );
      await checked(
        clientA.from("practice_items").insert(ids.map((id, index) => item(id, concepts[index]!))),
      );
      await checked(
        clientA
          .from("learning_states")
          .insert(ids.map((id) => state(id, "review", NOW.toISOString(), 3))),
      );
    }
  }, 60_000);

  afterAll(async () => {
    // Delete only this run's synthetic courses. Cascades remove its content and logs.
    if (clientA && ownerA)
      await checked(
        clientA
          .from("courses")
          .delete()
          .eq("owner_id", ownerA)
          .in("id", [mainCourse, otherCourse, largeCourse]),
      );
    if (clientA) await clientA.auth.signOut();
    if (clientB) await clientB.auth.signOut();
  });

  it("matches eligible queue counts, hidden backlog and the recent median", async () => {
    const result = await getTodayOverview(
      createSupabaseDailyQueueRepository(clientA),
      createSupabaseTodayOverviewRepository(clientA),
      { ownerId: ownerA, courseId: mainCourse, now: NOW, timeZone: "Europe/Madrid" },
    );
    expect(result).toEqual({
      ok: true,
      overview: {
        dueReviews: 3,
        availableReviews: 0,
        learningDue: 2,
        newAvailable: 2,
        difficultItems: 2,
        availableCount: 4,
        hiddenDueReviews: 3,
        hiddenNew: 1,
        nextDueAt: new Date(FUTURE),
        estimate: { source: "history", sampleSize: 100, perReviewMs: 25_000, totalMs: 100_000 },
      },
    });
    const queue = createSupabaseDailyQueueRepository(clientA);
    expect(
      await queue.listEligibleItems({
        ownerId: ownerA,
        courseId: mainCourse,
        deckIds: [mainDeck, mainDeck, extraDeck],
      }),
    ).toHaveLength(eligibleIds.length);
    expect(
      await queue.listEligibleItems({ ownerId: ownerA, courseId: mainCourse, deckIds: [] }),
    ).toEqual([]);
  });

  it("finds the last three attempts beyond 1,000 rows and beyond the duration window", async () => {
    const history = createSupabaseTodayOverviewRepository(clientA);
    const signals = await history.getDifficultySignals({
      ownerId: ownerA,
      practiceItemIds: eligibleIds,
      now: NOW,
    });
    expect(signals.find((row) => row.practiceItemId === reviews[0])?.recentRatings).toEqual([
      "good",
      "good",
      "good",
    ]);
    expect(signals.find((row) => row.practiceItemId === reviews[2])?.recentRatings).toEqual([
      "again",
      "good",
      "again",
    ]);
    expect(signals.find((row) => row.practiceItemId === futureDifficult)?.lapses).toBe(3);
    expect(
      await createSupabaseDailyQueueRepository(clientA).countTodayActivity({
        ownerId: ownerA,
        dayStart: new Date("2026-10-05T22:00:00.000Z"),
        dayEnd: new Date("2026-10-06T22:00:00.000Z"),
      }),
    ).toEqual({ newIntroduced: 0, reviewsDone: 1005 });
  });

  it("counts 1,101 eligible concepts, states and difficult items without truncation", async () => {
    const result = await getTodayOverview(
      createSupabaseDailyQueueRepository(clientA),
      createSupabaseTodayOverviewRepository(clientA),
      { ownerId: ownerA, courseId: largeCourse, now: NOW, timeZone: "Europe/Madrid" },
    );
    expect(result.ok && result.overview).toMatchObject({
      dueReviews: 1101,
      availableReviews: 1101,
      availableCount: 1101,
      difficultItems: 1101,
      hiddenDueReviews: 0,
    });
  });

  it("reads course activity and its latest scope without mixing courses or owners", async () => {
    await checked(
      clientA.from("study_sessions").insert([
        {
          owner_id: ownerA,
          course_id: mainCourse,
          started_at: OLD,
          scope: { deckIds: [extraDeck] },
        },
        {
          owner_id: ownerA,
          course_id: mainCourse,
          started_at: NOW.toISOString(),
          scope: { deckIds: [mainDeck] },
        },
        { owner_id: ownerA, course_id: otherCourse, started_at: FUTURE, scope: { deckIds: [] } },
      ]),
    );
    const dashboard = createSupabaseTodayDashboardRepository(clientA);
    expect(await dashboard.getLastStudyScope({ ownerId: ownerA, courseId: mainCourse })).toEqual({
      deckIds: [mainDeck],
    });
    expect(
      await dashboard.listReviewActivity({
        ownerId: ownerA,
        courseId: mainCourse,
        since: new Date("2026-09-29T22:00:00Z"),
        now: NOW,
      }),
    ).toHaveLength(1005);
    expect(
      await dashboard.listReviewActivity({
        ownerId: ownerA,
        courseId: largeCourse,
        since: new Date(OLD),
        now: NOW,
      }),
    ).toEqual([]);
    expect(
      (await dashboard.listActiveDecks({ ownerId: ownerA, courseId: mainCourse }))
        .map((deck) => deck.id)
        .sort(),
    ).toEqual([mainDeck, extraDeck].sort());
    const other = createSupabaseTodayDashboardRepository(clientB);
    expect(await other.getLastStudyScope({ ownerId: ownerA, courseId: mainCourse })).toBeNull();
    expect(
      await other.listReviewActivity({
        ownerId: ownerA,
        courseId: mainCourse,
        since: new Date(OLD),
        now: NOW,
      }),
    ).toEqual([]);
  });

  it("keeps owner and anonymous sessions isolated even with known IDs", async () => {
    const queueB = createSupabaseDailyQueueRepository(clientB);
    const historyB = createSupabaseTodayOverviewRepository(clientB);
    expect(
      await getTodayOverview(queueB, historyB, {
        ownerId: ownerB,
        courseId: mainCourse,
        now: NOW,
        timeZone: "Europe/Madrid",
      }),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(
      await historyB.getDifficultySignals({
        ownerId: ownerA,
        practiceItemIds: eligibleIds,
        now: NOW,
      }),
    ).toEqual([]);
    expect(
      await historyB.listRecentDurations({
        ownerId: ownerA,
        since: new Date(OLD),
        now: NOW,
        limit: 100,
      }),
    ).toEqual([]);
    expect(
      await getTodayOverview(
        createSupabaseDailyQueueRepository(anonymous),
        createSupabaseTodayOverviewRepository(anonymous),
        { ownerId: ownerA, courseId: mainCourse, now: NOW, timeZone: "Europe/Madrid" },
      ),
    ).toEqual({ ok: false, reason: "not-found" });
  });

  it("creates an active scope-only session and replays it without creating memory or logs", async () => {
    const sessions = createSupabaseStudySessionRepository(clientA);
    const queue = createSupabaseDailyQueueRepository(clientA);
    const decks = createSupabaseTodayDashboardRepository(clientA);
    const sessionId = randomUUID();
    const request = {
      ownerId: ownerA,
      courseId: mainCourse,
      sessionId,
      mode: "all",
      deckIds: [],
      now: NOW,
      timeZone: "Europe/Madrid",
    };
    const beforeStates = await checked(
      clientA
        .from("learning_states")
        .select("id")
        .eq("owner_id", ownerA)
        .in("practice_item_id", eligibleIds),
    );
    const beforeLogs = await queue.countTodayActivity({
      ownerId: ownerA,
      dayStart: new Date("2026-10-05T22:00:00Z"),
      dayEnd: new Date("2026-10-06T22:00:00Z"),
    });
    const created = await createStudySession(sessions, queue, decks, request);
    expect(created.ok && created.session).toMatchObject({
      id: sessionId,
      ownerId: ownerA,
      courseId: mainCourse,
      status: "active",
      endedAt: null,
      scope: { deckIds: null },
      startedAt: NOW,
    });
    const loaded = await getStudySession(sessions, queue, {
      ownerId: ownerA,
      sessionId,
      now: NOW,
      timeZone: "Europe/Madrid",
    });
    expect(loaded.ok && loaded.queue?.entries).toHaveLength(4);
    expect(loaded.ok && loaded.queue).toMatchObject({ hiddenDueReviews: 3, hiddenNew: 1 });
    const replayed = await createStudySession(sessions, queue, decks, {
      ...request,
      now: new Date(NOW.getTime() + 1000),
    });
    expect(replayed.ok && replayed.replayed).toBe(true);
    expect(replayed.ok && replayed.session.startedAt).toEqual(NOW);
    const row = await checked(
      clientA
        .from("study_sessions")
        .select("scope, reviews_count, new_count, status")
        .eq("id", sessionId)
        .single(),
    );
    expect(row).toEqual({
      scope: { deckIds: null },
      reviews_count: 0,
      new_count: 0,
      status: "active",
    });
    expect(
      await checked(
        clientA
          .from("learning_states")
          .select("id")
          .eq("owner_id", ownerA)
          .in("practice_item_id", eligibleIds),
      ),
    ).toEqual(beforeStates);
    expect(
      await queue.countTodayActivity({
        ownerId: ownerA,
        dayStart: new Date("2026-10-05T22:00:00Z"),
        dayEnd: new Date("2026-10-06T22:00:00Z"),
      }),
    ).toEqual(beforeLogs);
    expect(
      await createStudySession(sessions, queue, decks, {
        ...request,
        mode: "selected",
        deckIds: [mainDeck],
      }),
    ).toEqual({ ok: false, reason: "session-conflict" });
    expect(
      await createSupabaseStudySessionRepository(clientB).get({ ownerId: ownerA, sessionId }),
    ).toBeNull();
    expect(
      await createSupabaseStudySessionRepository(anonymous).get({ ownerId: ownerA, sessionId }),
    ).toBeNull();
  });

  it("uses one row for concurrent selected-scope submissions and reproduces their queue", async () => {
    const sessions = createSupabaseStudySessionRepository(clientA);
    const queue = createSupabaseDailyQueueRepository(clientA);
    const decks = createSupabaseTodayDashboardRepository(clientA);
    const sessionId = randomUUID();
    const request = {
      ownerId: ownerA,
      courseId: mainCourse,
      sessionId,
      mode: "selected",
      deckIds: [mainDeck, mainDeck],
      now: NOW,
      timeZone: "Europe/Madrid",
    };
    const results = await Promise.all([
      createStudySession(sessions, queue, decks, request),
      createStudySession(sessions, queue, decks, request),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(results.filter((result) => result.ok && result.replayed)).toHaveLength(1);
    expect(
      await checked(clientA.from("study_sessions").select("id, scope").eq("id", sessionId)),
    ).toEqual([{ id: sessionId, scope: { deckIds: [mainDeck] } }]);
    const loaded = await getStudySession(sessions, queue, {
      ownerId: ownerA,
      sessionId,
      now: NOW,
      timeZone: "Europe/Madrid",
    });
    expect(loaded.ok && loaded.queue?.entries).toHaveLength(4);
  });

  it("reads the first authorized front without answers, writes or reserved modes in the queue", async () => {
    const sessions = createSupabaseStudySessionRepository(clientA);
    const queue = createSupabaseDailyQueueRepository(clientA);
    const cards = createSupabaseStudyCardRepository(clientA);
    const sessionId = randomUUID();
    await sessions.create({
      ownerId: ownerA,
      courseId: mainCourse,
      sessionId,
      scope: { deckIds: [mainDeck] },
      startedAt: NOW,
    });
    const beforeStates = await checked(
      clientA
        .from("learning_states")
        .select("id, revision")
        .eq("owner_id", ownerA)
        .in("practice_item_id", eligibleIds),
    );
    const beforeLogs = await checked(
      clientA.from("review_logs").select("id").eq("owner_id", ownerA),
    );
    const result = await getStudySessionCard(sessions, queue, cards, {
      ownerId: ownerA,
      sessionId,
      now: NOW,
      timeZone: "Europe/Madrid",
    });
    expect(result.ok && result.card?.prompt).toEqual({
      mode: "basic_recognition",
      promptText: "Synthetic prompt",
      hintText: null,
    });
    expect(JSON.stringify(result)).not.toContain("Synthetic answer");
    if (!result.ok || !result.card) throw new Error("Expected an authorized front");
    const request = {
      ownerId: ownerA,
      sessionId,
      practiceItemId: result.card.practiceItemId,
      now: NOW,
      timeZone: "Europe/Madrid",
    };
    const revealed = await revealStudySessionCard(sessions, queue, cards, request);
    expect(revealed).toMatchObject({
      ok: true,
      content: { answerText: "Synthetic answer", exampleText: null, explanationText: null },
    });
    expect(
      await revealStudySessionCard(sessions, queue, cards, {
        ...request,
        practiceItemId: newItems[0]!,
      }),
    ).toEqual({ ok: false, reason: "card-changed" });
    for (const client of [clientB, anonymous]) {
      expect(
        await revealStudySessionCard(
          createSupabaseStudySessionRepository(client),
          createSupabaseDailyQueueRepository(client),
          createSupabaseStudyCardRepository(client),
          request,
        ),
      ).toEqual({ ok: false, reason: "not-found" });
    }
    const candidates = await queue.listEligibleItems({
      ownerId: ownerA,
      courseId: mainCourse,
      deckIds: [mainDeck],
    });
    expect(candidates.map((candidate) => candidate.practiceItemId).sort()).toEqual(
      [...eligibleIds].sort(),
    );
    expect(
      await checked(
        clientA
          .from("learning_states")
          .select("id, revision")
          .eq("owner_id", ownerA)
          .in("practice_item_id", eligibleIds),
      ),
    ).toEqual(beforeStates);
    expect(await checked(clientA.from("review_logs").select("id").eq("owner_id", ownerA))).toEqual(
      beforeLogs,
    );
    for (const client of [clientB, anonymous]) {
      expect(
        await createSupabaseStudyCardRepository(client).findContent({
          ownerId: ownerA,
          courseId: mainCourse,
          practiceItemId: learning,
        }),
      ).toBeNull();
    }
    expect(
      await cards.findContent({ ownerId: ownerA, courseId: otherCourse, practiceItemId: learning }),
    ).toBeNull();
    for (const id of reservedIds) {
      expect(
        await cards.findContent({ ownerId: ownerA, courseId: mainCourse, practiceItemId: id }),
      ).toBeNull();
    }
  });

  it("reads recall/cloze content literally and rejects disabled, archived or malformed rows", async () => {
    const cards = createSupabaseStudyCardRepository(clientA);
    const ids = Array.from({ length: 6 }, () => randomUUID());
    const base = {
      owner_id: ownerA,
      concept_id: activeConcept,
      mode: "basic_recall" as const,
      prompt_text: '<img src=x onerror="bad()">',
      answer_text: "<script>answer()</script>",
      hint_text: "<b>hint</b>",
      config: { mode: "basic_recall" },
      enabled: true,
      archived_at: null,
    };
    try {
      await checked(
        clientA.from("practice_items").insert([
          { ...base, id: ids[0]! },
          {
            ...base,
            id: ids[1]!,
            mode: "cloze",
            prompt_text: "I ___ and [gap].",
            config: { mode: "cloze", answers: ["walk", "<b>run</b>"] },
          },
          { ...base, id: ids[2]!, enabled: false },
          { ...base, id: ids[3]!, archived_at: NOW.toISOString() },
          { ...base, id: ids[4]!, concept_id: archivedConcept },
          {
            ...base,
            id: ids[5]!,
            mode: "cloze",
            config: { mode: "cloze", answers: "not-an-array" },
          },
        ]),
      );
      expect(
        await cards.findContent({ ownerId: ownerA, courseId: mainCourse, practiceItemId: ids[0]! }),
      ).toMatchObject({
        mode: "basic_recall",
        promptText: base.prompt_text,
        answerText: base.answer_text,
        hintText: base.hint_text,
        clozeAnswers: [],
      });
      expect(
        await cards.findContent({ ownerId: ownerA, courseId: mainCourse, practiceItemId: ids[1]! }),
      ).toMatchObject({
        mode: "cloze",
        promptText: "I ___ and [gap].",
        clozeAnswers: ["walk", "<b>run</b>"],
      });
      for (const id of ids.slice(2, 5)) {
        expect(
          await cards.findContent({ ownerId: ownerA, courseId: mainCourse, practiceItemId: id }),
        ).toBeNull();
      }
      await expect(
        cards.findContent({ ownerId: ownerA, courseId: mainCourse, practiceItemId: ids[5]! }),
      ).rejects.toMatchObject({ kind: "unavailable" });
    } finally {
      await checked(clientA.from("practice_items").delete().eq("owner_id", ownerA).in("id", ids));
    }
  });

  it("rejects empty, archived and foreign scopes and forged owner writes without a new session", async () => {
    const sessions = createSupabaseStudySessionRepository(clientA);
    const queue = createSupabaseDailyQueueRepository(clientA);
    const decks = createSupabaseTodayDashboardRepository(clientA);
    const emptyDeck = randomUUID();
    await checked(
      clientA.from("decks").insert({
        id: emptyDeck,
        owner_id: ownerA,
        course_id: mainCourse,
        title: "Synthetic empty deck",
      }),
    );
    const request = {
      ownerId: ownerA,
      courseId: mainCourse,
      sessionId: randomUUID(),
      mode: "selected",
      deckIds: [],
      now: NOW,
      timeZone: "Europe/Madrid",
    };
    expect(await createStudySession(sessions, queue, decks, request)).toEqual({
      ok: false,
      reason: "invalid-scope",
    });
    expect(
      await createStudySession(sessions, queue, decks, { ...request, deckIds: [archivedDeck] }),
    ).toEqual({ ok: false, reason: "invalid-scope" });
    expect(
      await createStudySession(sessions, queue, decks, { ...request, deckIds: [emptyDeck] }),
    ).toEqual({ ok: false, reason: "no-items" });
    const otherSessions = createSupabaseStudySessionRepository(clientB);
    expect(
      await createStudySession(
        otherSessions,
        createSupabaseDailyQueueRepository(clientB),
        createSupabaseTodayDashboardRepository(clientB),
        { ...request, ownerId: ownerB, deckIds: [mainDeck] },
      ),
    ).toEqual({ ok: false, reason: "invalid-scope" });
    await expect(
      otherSessions.create({
        ownerId: ownerA,
        courseId: mainCourse,
        sessionId: request.sessionId,
        scope: { deckIds: null },
        startedAt: NOW,
      }),
    ).rejects.toMatchObject({ kind: "forbidden" });
    expect(
      await checked(clientA.from("study_sessions").select("id").eq("id", request.sessionId)),
    ).toEqual([]);
  });
});
