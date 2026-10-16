import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { saveSessionReview } from "@/modules/study/application/save-session-review";
import {
  getStudySessionCard,
  revealStudySessionCard,
} from "@/modules/study/application/study-card";
import { V1_SCHEDULER_CONFIG } from "@/modules/study/domain/scheduler-config";
import { createSupabaseDailyQueueRepository } from "@/modules/study/infrastructure/supabase-daily-queue-repository";
import { createSupabaseLearningStateRepository } from "@/modules/study/infrastructure/supabase-learning-state-repository";
import { createSupabaseReviewCommitter } from "@/modules/study/infrastructure/supabase-review-committer";
import { createSupabaseStudyCardRepository } from "@/modules/study/infrastructure/supabase-study-card-repository";
import { createSupabaseStudySessionRepository } from "@/modules/study/infrastructure/supabase-study-session-repository";
import { createTsFsrsScheduler } from "@/modules/study/infrastructure/ts-fsrs-scheduler";
import type { Database } from "@/shared/infrastructure/supabase/database.types";
import {
  changeStudySession,
  getStudySession,
  listOpenStudySessions,
} from "@/modules/study/application/study-session";
import type { StoredLearningState } from "@/modules/study/application/learning-state";
import { holdLocalSessionRow } from "./local-session-lock";

type Client = SupabaseClient<Database>;
const enabled = process.env["LEXORA_DB_TESTS"] === "1";
const now = new Date("2026-10-11T10:00:00Z");
const later = new Date("2026-10-11T10:11:00Z");
async function checked<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}
function ports(client: Client) {
  return {
    sessions: createSupabaseStudySessionRepository(client),
    queue: createSupabaseDailyQueueRepository(client),
    cards: createSupabaseStudyCardRepository(client),
    memory: createSupabaseLearningStateRepository(client),
    committer: createSupabaseReviewCommitter(client),
    scheduler: createTsFsrsScheduler(),
  };
}

describe.skipIf(!enabled)("Session reviews against local Supabase", () => {
  let clientA: Client;
  let clientB: Client;
  let anonymous: Client;
  let ownerId: string;
  const courseId = randomUUID();
  const deckId = randomUUID();
  const conceptId = randomUUID();
  const itemIds = Array.from({ length: 4 }, () => randomUUID()).sort();
  const keys = itemIds.map(() => randomUUID());
  const sessionId = randomUUID();
  const otherSessionId = randomUUID();
  const pausedId = randomUUID();
  const request = (index = 0) => ({
    ownerId,
    sessionId,
    practiceItemId: itemIds[index]!,
    idempotencyKey: keys[index]!,
    rating: "good",
    expectedRevision: null,
    now,
    timeZone: "Europe/Madrid",
    config: V1_SCHEDULER_CONFIG,
  });
  beforeAll(async () => {
    if (!process.env["NEXT_PUBLIC_SUPABASE_URL"]) process.loadEnvFile(".env.local");
    const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]!;
    const parsed = new URL(url);
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || parsed.port !== "54321")
      throw new Error("Session review fixtures require local Supabase on port 54321");
    const makeClient = () =>
      createClient<Database>(url, process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]!, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
    anonymous = makeClient();
    clientA = makeClient();
    clientB = makeClient();
    for (const client of [clientA, clientB]) {
      const auth = await checked(
        client.auth.signUp({ email: `lex67-${randomUUID()}@example.com`, password: randomUUID() }),
      );
      if (!auth.user || !auth.session) throw new Error("Synthetic local signup requires a session");
      await checked(client.from("profiles").insert({ id: auth.user.id }));
      if (client === clientA) ownerId = auth.user.id;
    }
    const languages = await checked(clientA.from("languages").select("id, locale"));
    await checked(
      clientA.from("courses").insert({
        id: courseId,
        owner_id: ownerId,
        title: "Synthetic session review course",
        source_language_id: languages!.find((row) => row.locale === "es")!.id,
        target_language_id: languages!.find((row) => row.locale === "en")!.id,
      }),
    );
    await checked(
      clientA
        .from("course_settings")
        .insert({ course_id: courseId, user_id: ownerId, daily_new_limit: 5 }),
    );
    await checked(
      clientA
        .from("decks")
        .insert({ id: deckId, course_id: courseId, owner_id: ownerId, title: "Synthetic" }),
    );
    await checked(
      clientA.from("concepts").insert({
        id: conceptId,
        course_id: courseId,
        owner_id: ownerId,
        kind: "vocabulary",
        title: "Original fixture",
        summary: "Original",
      }),
    );
    await checked(
      clientA
        .from("deck_concepts")
        .insert({ deck_id: deckId, concept_id: conceptId, owner_id: ownerId }),
    );
    await checked(
      clientA.from("practice_items").insert(
        itemIds.map((id, index) => ({
          id,
          owner_id: ownerId,
          concept_id: conceptId,
          mode: "basic_recall" as const,
          prompt_text: `Original front ${index}`,
          answer_text: `Original answer ${index}`,
          config: { mode: "basic_recall" },
        })),
      ),
    );
    for (const id of [sessionId, otherSessionId, pausedId])
      await ports(clientA).sessions.create({
        ownerId,
        courseId,
        sessionId: id,
        scope: { deckIds: [deckId] },
        startedAt: now,
      });
    await checked(clientA.from("study_sessions").update({ status: "paused" }).eq("id", pausedId));
  });
  afterAll(async () => {
    if (clientA && ownerId)
      await checked(clientA.from("courses").delete().eq("owner_id", ownerId).eq("id", courseId));
    for (const client of [clientA, clientB]) if (client) await client.auth.signOut();
  });
  it("rejects B/anon, inactive sessions, non-first cards and disabled content without creating memory", async () => {
    for (const client of [clientB, anonymous])
      expect(await saveSessionReview(ports(client), request())).toEqual({
        ok: false,
        reason: "not-found",
      });
    expect(await saveSessionReview(ports(clientA), { ...request(), sessionId: pausedId })).toEqual({
      ok: false,
      reason: "inactive-session",
    });
    expect(await saveSessionReview(ports(clientA), request(1))).toEqual({
      ok: false,
      reason: "card-changed",
    });
    await checked(clientA.from("practice_items").update({ enabled: false }).eq("id", itemIds[0]!));
    try {
      expect(await saveSessionReview(ports(clientA), request())).toEqual({
        ok: false,
        reason: "card-changed",
      });
    } finally {
      await checked(clientA.from("practice_items").update({ enabled: true }).eq("id", itemIds[0]!));
    }
    expect(
      await checked(clientA.from("learning_states").select("id").in("practice_item_id", itemIds)),
    ).toEqual([]);
    expect(
      await checked(clientA.from("review_logs").select("id").eq("study_session_id", sessionId)),
    ).toEqual([]);
  });
  it("saves all four ratings through real FSRS/RPC, advances the queue and replays after each item leaves it", async () => {
    const f = ports(clientA);
    const ratings = ["again", "hard", "good", "easy"] as const;
    for (const [index, rating] of ratings.entries()) {
      const front = await getStudySessionCard(f.sessions, f.queue, f.cards, {
        ownerId,
        sessionId,
        now,
        timeZone: "Europe/Madrid",
      });
      expect(front.ok && front.card?.practiceItemId).toBe(itemIds[index]);
      const command = { ...request(index), rating };
      expect(await saveSessionReview(f, command)).toEqual({ ok: true, rating, replayed: false });
      const stored = await f.memory.getByItem({ ownerId, practiceItemId: itemIds[index]! });
      expect(stored).toMatchObject({
        revision: 2,
        state: { reps: 1, lastReviewedAt: now },
        schedulerVersion: "5.4.2",
        configVersion: "v1",
      });
      expect(stored!.state.dueAt.getTime()).toBeGreaterThan(now.getTime());
      const before = await checked(
        clientA
          .from("learning_states")
          .select("*")
          .eq("practice_item_id", itemIds[index]!)
          .single(),
      );
      expect(await saveSessionReview(f, command)).toEqual({ ok: true, rating, replayed: true });
      expect(
        await checked(
          clientA
            .from("learning_states")
            .select("*")
            .eq("practice_item_id", itemIds[index]!)
            .single(),
        ),
      ).toEqual(before);
    }
    const front = await getStudySessionCard(f.sessions, f.queue, f.cards, {
      ownerId,
      sessionId,
      now,
      timeZone: "Europe/Madrid",
    });
    expect(front.ok && front.card).toBeNull();
    const logs = await checked(
      clientA
        .from("review_logs")
        .select("rating, study_session_id, state_before, state_after")
        .eq("study_session_id", sessionId),
    );
    expect(logs).toHaveLength(4);
    expect(logs!.map((log) => log.rating).sort()).toEqual([...ratings].sort());
    for (const client of [clientB, anonymous]) {
      expect(
        await checked(client.from("review_logs").select("id").eq("study_session_id", sessionId)),
      ).toEqual([]);
      expect(
        await checked(client.from("learning_states").select("id").in("practice_item_id", itemIds)),
      ).toEqual([]);
    }
  });
  it("does not acknowledge a key for another session or rating", async () => {
    expect(
      await saveSessionReview(ports(clientA), {
        ...request(),
        rating: "again",
        sessionId: otherSessionId,
      }),
    ).toEqual({ ok: false, reason: "idempotency-conflict" });
    expect(await saveSessionReview(ports(clientA), request())).toEqual({
      ok: false,
      reason: "idempotency-conflict",
    });
    expect(
      await checked(clientA.from("review_logs").select("id").eq("study_session_id", sessionId)),
    ).toHaveLength(4);
  });
  it("rejects a stale revealed revision without modifying memory", async () => {
    const f = ports(clientA);
    const front = await getStudySessionCard(f.sessions, f.queue, f.cards, {
      ownerId,
      sessionId,
      now: later,
      timeZone: "Europe/Madrid",
    });
    if (!front.ok || !front.card)
      throw new Error("Expected a short-step candidate at the later clock");
    const before = await checked(
      clientA
        .from("learning_states")
        .select("*")
        .eq("practice_item_id", front.card.practiceItemId)
        .single(),
    );
    expect(
      await saveSessionReview(f, {
        ...request(),
        practiceItemId: front.card.practiceItemId,
        idempotencyKey: randomUUID(),
        expectedRevision: 1,
        now: later,
      }),
    ).toEqual({ ok: false, reason: "revision-conflict" });
    expect(
      await checked(
        clientA
          .from("learning_states")
          .select("*")
          .eq("practice_item_id", front.card.practiceItemId)
          .single(),
      ),
    ).toEqual(before);
  });
  it("serializes same-key concurrent submissions with one durable log", async () => {
    const f = ports(clientA);
    const front = await getStudySessionCard(f.sessions, f.queue, f.cards, {
      ownerId,
      sessionId,
      now: later,
      timeZone: "Europe/Madrid",
    });
    if (!front.ok || !front.card) throw new Error("Expected a pending front");
    const command = {
      ...request(),
      practiceItemId: front.card.practiceItemId,
      expectedRevision: front.card.revision,
      idempotencyKey: randomUUID(),
      now: later,
    };
    const results = await Promise.all([
      saveSessionReview(f, command),
      saveSessionReview(f, command),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(
      await checked(
        clientA.from("review_logs").select("id").eq("idempotency_key", command.idempotencyKey),
      ),
    ).toHaveLength(1);
    expect(
      (await f.memory.getByItem({ ownerId, practiceItemId: front.card.practiceItemId }))?.revision,
    ).toBe(3);
  });
  it("preserves confirmed reviews across pause, fresh resume, completion and abandonment with RLS", async () => {
    const f = ports(clientA);
    const id = randomUUID();
    const fresh = [randomUUID(), randomUUID()].sort();
    await checked(
      clientA
        .from("course_settings")
        .update({ daily_new_limit: 100, maximum_reviews_per_day: null })
        .eq("course_id", courseId),
    );
    await checked(
      clientA.from("practice_items").insert(
        fresh.map((item) => ({
          id: item,
          owner_id: ownerId,
          concept_id: conceptId,
          mode: "basic_recall" as const,
          prompt_text: "Lifecycle front",
          answer_text: "Lifecycle answer",
          config: { mode: "basic_recall" },
        })),
      ),
    );
    await f.sessions.create({
      ownerId,
      sessionId: id,
      courseId,
      scope: { deckIds: [deckId] },
      startedAt: now,
    });
    const command = {
      ...request(),
      sessionId: id,
      practiceItemId: fresh[0]!,
      idempotencyKey: randomUUID(),
    };
    expect(await saveSessionReview(f, command)).toMatchObject({ ok: true });
    const saved = await f.memory.getByItem({ ownerId, practiceItemId: fresh[0]! });
    const transition = (action: string, expectedStatus: string, at = now) =>
      changeStudySession(f.sessions, f.queue, {
        ownerId,
        sessionId: id,
        action,
        expectedStatus,
        now: at,
        timeZone: "Europe/Madrid",
      });
    expect(await transition("pause", "active")).toMatchObject({
      ok: true,
      session: { status: "paused", endedAt: null },
    });
    expect(
      await getStudySession(f.sessions, f.queue, {
        ownerId,
        sessionId: id,
        now,
        timeZone: "Europe/Madrid",
      }),
    ).toMatchObject({ queue: null });
    expect(await saveSessionReview(f, command)).toEqual({
      ok: true,
      replayed: true,
      rating: "good",
    });
    expect(await f.memory.getByItem({ ownerId, practiceItemId: fresh[0]! })).toEqual(saved);
    for (const client of [clientB, anonymous]) {
      const alien = ports(client);
      expect(
        await changeStudySession(alien.sessions, alien.queue, {
          ownerId,
          sessionId: id,
          action: "resume",
          expectedStatus: "paused",
          now,
          timeZone: "Europe/Madrid",
        }),
      ).toEqual({ ok: false, reason: "not-found" });
      expect(
        await alien.sessions.transition({
          ownerId,
          sessionId: id,
          expectedStatus: "paused",
          status: "active",
          endedAt: null,
        }),
      ).toBeNull();
      expect(await listOpenStudySessions(alien.sessions, { ownerId, courseId })).toEqual([]);
    }
    expect(
      (await listOpenStudySessions(f.sessions, { ownerId, courseId })).some(
        (session) => session.id === id,
      ),
    ).toBe(true);
    // Disable the previously pending card: resuming cannot replay an old visual order.
    await checked(clientA.from("practice_items").update({ enabled: false }).eq("id", fresh[1]!));
    expect(await transition("resume", "paused")).toMatchObject({
      ok: true,
      session: { status: "active", scope: { deckIds: [deckId] } },
    });
    const resumed = await getStudySessionCard(f.sessions, f.queue, f.cards, {
      ownerId,
      sessionId: id,
      now,
      timeZone: "Europe/Madrid",
    });
    expect(resumed.ok && resumed.card).toBeNull();
    const done = await transition("complete", "active");
    expect(done).toMatchObject({ ok: true, session: { status: "completed", endedAt: now } });
    expect(await transition("complete", "active", later)).toEqual(done);
    expect(await transition("resume", "completed")).toEqual({
      ok: false,
      reason: "invalid-transition",
    });
    expect(await saveSessionReview(f, command)).toMatchObject({ ok: true, replayed: true });
    expect(
      await checked(clientA.from("review_logs").select("id").eq("study_session_id", id)),
    ).toHaveLength(1);
    const abandoned = randomUUID();
    await f.sessions.create({
      ownerId,
      sessionId: abandoned,
      courseId,
      scope: { deckIds: [deckId] },
      startedAt: now,
    });
    expect(
      await changeStudySession(f.sessions, f.queue, {
        ownerId,
        sessionId: abandoned,
        action: "abandon",
        expectedStatus: "active",
        now: later,
        timeZone: "Europe/Madrid",
      }),
    ).toMatchObject({ ok: true, session: { status: "abandoned", endedAt: later } });
    const open = await listOpenStudySessions(f.sessions, { ownerId, courseId });
    expect(open.some((session) => new Set<string>([id, abandoned]).has(session.id))).toBe(false);
  });
  it.each(["pause-first", "review-first"] as const)(
    "serializes real database transactions: %s",
    async (order) => {
      const f = ports(clientA);
      const id = randomUUID();
      await f.sessions.create({
        ownerId,
        sessionId: id,
        courseId,
        scope: { deckIds: [deckId] },
        startedAt: now,
      });
      const stored = (await f.memory.getByItem({
        ownerId,
        practiceItemId: itemIds[0]!,
      })) as StoredLearningState;
      const at = new Date("2026-10-12T12:00:00Z");
      const key = randomUUID();
      const command = {
        ownerId,
        practiceItemId: stored.practiceItemId,
        expectedRevision: stored.revision,
        idempotencyKey: key,
        rating: "good" as const,
        reviewedAt: at,
        previous: stored.state,
        next: f.scheduler.review(stored.state, "good", at, V1_SCHEDULER_CONFIG).state,
        schedulerVersion: "5.4.2",
        configVersion: "v1",
        studySessionId: id,
        durationMs: null,
      };
      const held = await holdLocalSessionRow(
        ownerId,
        order === "pause-first"
          ? `update public.study_sessions set status = 'paused' where id = '${id}'`
          : `select 1 from public.learning_states where id = '${stored.id}' for update`,
      );
      let commit: ReturnType<typeof f.committer.commit> | undefined;
      let pause: ReturnType<typeof f.sessions.transition> | undefined;
      try {
        commit = f.committer.commit(command);
        await held.waitForBlocked(1);
        if (order === "review-first") {
          pause = f.sessions.transition({
            ownerId,
            sessionId: id,
            expectedStatus: "active",
            status: "paused",
            endedAt: null,
          });
          await held.waitForBlocked(2);
        }
      } finally {
        await held.release();
      }
      expect(await commit).toEqual(
        order === "pause-first"
          ? { ok: false, reason: "not-found" }
          : { ok: true, replayed: false },
      );
      if (pause) expect(await pause).toMatchObject({ status: "paused", endedAt: null });
      const memory = await f.memory.getByItem({ ownerId, practiceItemId: stored.practiceItemId });
      expect(memory?.revision).toBe(stored.revision + (order === "review-first" ? 1 : 0));
      expect(
        await checked(clientA.from("review_logs").select("id").eq("study_session_id", id)),
      ).toHaveLength(order === "review-first" ? 1 : 0);
      if (order === "pause-first") expect(memory).toEqual(stored);
      else
        expect(
          await saveSessionReview(f, {
            ...request(),
            sessionId: id,
            practiceItemId: stored.practiceItemId,
            expectedRevision: stored.revision,
            idempotencyKey: key,
          }),
        ).toEqual({ ok: true, rating: "good", replayed: true });
    },
    20_000,
  );
  it.each(["learning", "relearning"] as const)(
    "reintroduces a real FSRS %s step only at its deadline, independently of both daily caps",
    async (phase) => {
      const f = ports(clientA);
      const stepDeck = randomUUID();
      const stepConcept = randomUUID();
      const stepSession = randomUUID();
      const [stepItem, otherItem] = [randomUUID(), randomUUID()].sort() as [string, string];
      await checked(
        clientA
          .from("course_settings")
          .update({ daily_new_limit: 100, maximum_reviews_per_day: null })
          .eq("course_id", courseId),
      );
      await checked(
        clientA.from("decks").insert({
          id: stepDeck,
          owner_id: ownerId,
          course_id: courseId,
          title: "Synthetic short steps",
        }),
      );
      await checked(
        clientA.from("concepts").insert({
          id: stepConcept,
          owner_id: ownerId,
          course_id: courseId,
          kind: "vocabulary",
          title: "Original steps",
          summary: "Original",
        }),
      );
      await checked(
        clientA
          .from("deck_concepts")
          .insert({ owner_id: ownerId, deck_id: stepDeck, concept_id: stepConcept }),
      );
      await checked(
        clientA.from("practice_items").insert(
          [stepItem, otherItem].map((id) => ({
            id,
            owner_id: ownerId,
            concept_id: stepConcept,
            mode: "basic_recall" as const,
            prompt_text: "Original step front",
            answer_text: "Original step answer",
            config: { mode: "basic_recall" },
          })),
        ),
      );
      if (phase === "relearning")
        await f.memory.create({
          ownerId,
          practiceItemId: stepItem,
          schedulerVersion: "5.4.2",
          configVersion: "v1",
          state: {
            ...f.scheduler.createInitialState(now, V1_SCHEDULER_CONFIG),
            phase: "review",
            stability: 5,
            difficulty: 4,
            reps: 5,
            lastReviewedAt: new Date(now.getTime() - 86_400_000),
            scheduledDays: 1,
          },
        });
      await f.sessions.create({
        ownerId,
        courseId,
        sessionId: stepSession,
        scope: { deckIds: [stepDeck] },
        startedAt: now,
      });
      const command = {
        ...request(),
        sessionId: stepSession,
        practiceItemId: stepItem,
        idempotencyKey: randomUUID(),
        rating: "again",
        expectedRevision: phase === "relearning" ? 1 : null,
      };
      expect(await saveSessionReview(f, command)).toEqual({
        ok: true,
        rating: "again",
        replayed: false,
      });
      const stored = await f.memory.getByItem({ ownerId, practiceItemId: stepItem });
      expect(stored).toMatchObject({ revision: 2, state: { phase } });
      const dueAt = stored!.state.dueAt;
      expect(dueAt.getTime() - now.getTime()).toBe(phase === "learning" ? 60_000 : 600_000);
      const read = (at: Date) =>
        getStudySessionCard(f.sessions, f.queue, f.cards, {
          ownerId,
          sessionId: stepSession,
          now: at,
          timeZone: "Europe/Madrid",
        });
      const working = await read(now);
      expect(working.ok && working.card?.practiceItemId).toBe(otherItem);
      await checked(
        clientA
          .from("course_settings")
          .update({ daily_new_limit: 0, maximum_reviews_per_day: 0 })
          .eq("course_id", courseId),
      );
      const before = new Date(dueAt.getTime() - 1);
      const waiting = await read(before);
      expect(waiting.ok && waiting.card).toBeNull();
      expect(waiting.ok && waiting.queue?.nextLearningDueAt).toEqual(dueAt);
      const nextIntent = {
        ...command,
        idempotencyKey: randomUUID(),
        expectedRevision: 2,
        rating: "good",
      };
      expect(await saveSessionReview(f, { ...nextIntent, now: before })).toEqual({
        ok: false,
        reason: "card-changed",
      });
      expect(
        await revealStudySessionCard(f.sessions, f.queue, f.cards, {
          ownerId,
          sessionId: stepSession,
          practiceItemId: stepItem,
          now: before,
          timeZone: "Europe/Madrid",
        }),
      ).toEqual({ ok: false, reason: "card-changed" });
      for (const client of [clientB, anonymous]) {
        const alien = ports(client);
        expect(
          await getStudySessionCard(alien.sessions, alien.queue, alien.cards, {
            ownerId,
            sessionId: stepSession,
            now: before,
            timeZone: "Europe/Madrid",
          }),
        ).toEqual({ ok: false, reason: "not-found" });
      }
      const available = await read(dueAt);
      expect(available.ok && available.card).toMatchObject({
        practiceItemId: stepItem,
        revision: 2,
      });
      expect(await saveSessionReview(f, { ...nextIntent, now: dueAt })).toEqual({
        ok: true,
        rating: "good",
        replayed: false,
      });
      expect(await saveSessionReview(f, command)).toEqual({
        ok: true,
        rating: "again",
        replayed: true,
      });
      expect(
        await checked(clientA.from("review_logs").select("id").eq("study_session_id", stepSession)),
      ).toHaveLength(2);
      expect((await f.memory.getByItem({ ownerId, practiceItemId: stepItem }))?.revision).toBe(3);
    },
  );
});
