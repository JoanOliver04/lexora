import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { saveSessionReview } from "@/modules/study/application/save-session-review";
import { getStudySessionCard } from "@/modules/study/application/study-card";
import { V1_SCHEDULER_CONFIG } from "@/modules/study/domain/scheduler-config";
import { createSupabaseDailyQueueRepository } from "@/modules/study/infrastructure/supabase-daily-queue-repository";
import { createSupabaseLearningStateRepository } from "@/modules/study/infrastructure/supabase-learning-state-repository";
import { createSupabaseReviewCommitter } from "@/modules/study/infrastructure/supabase-review-committer";
import { createSupabaseStudyCardRepository } from "@/modules/study/infrastructure/supabase-study-card-repository";
import { createSupabaseStudySessionRepository } from "@/modules/study/infrastructure/supabase-study-session-repository";
import { createTsFsrsScheduler } from "@/modules/study/infrastructure/ts-fsrs-scheduler";
import type { Database } from "@/shared/infrastructure/supabase/database.types";

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
});
