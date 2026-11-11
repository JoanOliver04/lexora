import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getReviewHistory } from "@/modules/study/application/review-history";
import { createSupabaseReviewHistoryRepository } from "@/modules/study/infrastructure/supabase-review-history-repository";
import { createSupabaseStatisticsRepository } from "@/modules/study/infrastructure/supabase-statistics-repository";
import { getStatistics } from "@/modules/study/application/statistics";
import type { Database } from "@/shared/infrastructure/supabase/database.types";

const enabled = process.env["LEXORA_DB_TESTS"] === "1";
type Client = SupabaseClient<Database>;
async function checked<T>(request: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return data;
}

describe.skipIf(!enabled)("History against local Supabase and real RLS", () => {
  let a: Client, b: Client, anon: Client, ownerId: string;
  const courseId = randomUUID(),
    otherCourse = randomUUID(),
    deck = randomUUID(),
    concept = randomUUID(),
    item = randomUUID();
  const ids = Array.from({ length: 43 }, () => randomUUID())
    .sort()
    .reverse();
  const input = () => ({
    ownerId,
    courseId,
    query: {},
    timeZone: "Europe/Madrid",
    now: new Date("2026-11-11T12:00:00Z"),
  });
  beforeAll(async () => {
    if (!process.env["NEXT_PUBLIC_SUPABASE_URL"]) process.loadEnvFile(".env.local");
    const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]!;
    const local = new URL(url);
    if (!["127.0.0.1", "localhost"].includes(local.hostname) || local.port !== "54321")
      throw new Error("Local synthetic fixtures only");
    const make = () =>
      createClient<Database>(url, process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]!, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
    a = make();
    b = make();
    anon = make();
    for (const client of [a, b]) {
      const auth = await checked(
        client.auth.signUp({
          email: `history-${randomUUID()}@example.com`,
          password: randomUUID(),
        }),
      );
      if (!auth.user || !auth.session) throw new Error("Fixture signup requires a session");
      await checked(client.from("profiles").insert({ id: auth.user.id }));
      if (client === a) ownerId = auth.user.id;
    }
    const languages = await checked(a.from("languages").select("id,locale"));
    for (const id of [courseId, otherCourse])
      await checked(
        a.from("courses").insert({
          id,
          owner_id: ownerId,
          title: "Original history fixture",
          source_language_id: languages!.find((l) => l.locale === "es")!.id,
          target_language_id: languages!.find((l) => l.locale === "en")!.id,
        }),
      );
    await checked(
      a
        .from("decks")
        .insert({ id: deck, owner_id: ownerId, course_id: courseId, title: "Original fixture" }),
    );
    await checked(
      a.from("concepts").insert({
        id: concept,
        owner_id: ownerId,
        course_id: courseId,
        kind: "vocabulary",
        cefr_level: "A2",
        title: "<script>Original literal</script>",
        summary: "Original fixture",
      }),
    );
    await checked(
      a.from("deck_concepts").insert({ deck_id: deck, concept_id: concept, owner_id: ownerId }),
    );
    await checked(
      a.from("practice_items").insert({
        id: item,
        owner_id: ownerId,
        concept_id: concept,
        mode: "basic_recall",
        prompt_text: "Original",
        answer_text: "Original",
        config: { mode: "basic_recall" },
      }),
    );
    // Fixed local container only. These generated fixture IDs contain no user content.
    const values = ids
      .map(
        (id, i) =>
          `('${id}','${ownerId}','${item}','${id}','${i === 0 ? "again" : "good"}','2026-10-25T01:30:00.123456Z',${i === 0 ? "null" : "15000"},'{"phase":"new"}','{"phase":"review","dueAt":"2026-11-01T00:00:00Z"}','2026-10-24','2026-11-01','fixture','fixture')`,
      )
      .join(",");
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "supabase_db_lexora",
        "psql",
        "-X",
        "-q",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      {
        input: `insert into public.review_logs(id,owner_id,practice_item_id,idempotency_key,rating,reviewed_at,duration_ms,state_before,state_after,due_before,due_after,scheduler_version,config_version) values ${values};`,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 10000,
      },
    );
  });
  afterAll(async () => {
    if (a && ownerId)
      await checked(
        a.from("courses").delete().eq("owner_id", ownerId).in("id", [courseId, otherCourse]),
      );
    for (const client of [a, b]) if (client) await client.auth.signOut();
  });
  it("paginates 43 tied timestamps without gaps and preserves literal titles", async () => {
    const repo = createSupabaseReviewHistoryRepository(a);
    const first = await getReviewHistory(repo, input());
    if (!first.ok || !first.nextCursor) throw new Error("First page missing");
    expect(first.entries.map((r) => r.id)).toEqual(ids.slice(0, 40));
    expect(first.entries[0]?.title).toBe("<script>Original literal</script>");
    const next = await getReviewHistory(repo, { ...input(), query: { cursor: first.nextCursor } });
    if (!next.ok) throw new Error("Second page missing");
    expect(next.entries.map((r) => r.id)).toEqual(ids.slice(40));
    expect(next.nextCursor).toBeNull();
  });
  it("filters dates, deck, concept, item, rating, phase and course on the server", async () => {
    const repo = createSupabaseReviewHistoryRepository(a);
    const result = await getReviewHistory(repo, {
      ...input(),
      query: {
        from: "2026-10-25",
        until: "2026-10-25",
        deck,
        concept,
        item,
        rating: "again",
        phase: "new",
      },
    });
    if (!result.ok) throw new Error("Valid filters rejected");
    expect(result.entries.map((r) => r.id)).toEqual([ids[0]]);
    for (const query of [
      { from: "2026-10-26" },
      { until: "2026-10-24" },
      { phase: "review" },
      { deck: randomUUID() },
    ]) {
      const empty = await getReviewHistory(repo, { ...input(), query });
      expect(empty.ok && empty.entries).toEqual([]);
    }
    const other = await getReviewHistory(repo, { ...input(), courseId: otherCourse });
    expect(other.ok && other.entries).toEqual([]);
  });
  it("RLS blocks another user and anon even when given the owner's ID", async () => {
    for (const client of [b, anon]) {
      const result = await getReviewHistory(createSupabaseReviewHistoryRepository(client), input());
      expect(result.ok && result.entries).toEqual([]);
    }
  });
  it("aggregates over 1,000 reviews without truncation and forecasts current memory", async () => {
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "supabase_db_lexora",
        "psql",
        "-X",
        "-q",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      {
        input: `insert into public.review_logs(owner_id,practice_item_id,idempotency_key,rating,reviewed_at,duration_ms,state_before,state_after,due_before,due_after,scheduler_version,config_version) select '${ownerId}','${item}','stats-extra-' || n,'hard','2026-10-24T10:00:00Z',1000,'{}'::jsonb,'{}'::jsonb,'2026-10-24','2026-10-26','fixture','fixture' from generate_series(1,1001) n;`,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 10000,
      },
    );
    await checked(
      a.from("learning_states").insert({
        owner_id: ownerId,
        practice_item_id: item,
        due_at: "2026-10-26T10:00:00Z",
        phase: "review",
        lapses: 3,
        scheduler_version: "fixture",
        config_version: "fixture",
      }),
    );
    const request = { ...input(), now: new Date("2026-10-25T12:00:00Z"), days: "7", deck };
    const result = await getStatistics(createSupabaseStatisticsRepository(a), request);
    if (!result.ok) throw new Error("Valid statistics rejected");
    expect(result.statistics.totals).toEqual({
      reviews: 1044,
      durationMs: 1631000,
      measured: 1043,
    });
    expect(result.statistics.observedRecall).toBe(1043 / 1044);
    expect(result.statistics.states.review).toBe(1);
    expect(result.statistics.byKind).toEqual([
      {
        key: "vocabulary",
        reviews: 1044,
        states: { new: 0, learning: 0, review: 1, relearning: 0 },
      },
    ]);
    expect(result.statistics.byLevel).toEqual([
      { key: "A2", reviews: 1044, states: { new: 0, learning: 0, review: 1, relearning: 0 } },
    ]);
    expect(result.statistics.lapses).toBe(3);
    expect(result.statistics.difficultTotal).toBe(1);
    expect(result.statistics.difficult[0]?.id).toBe(item);
    expect(result.statistics.forecast.find((d) => d.day === "2026-10-26")?.count).toBe(1);
    expect(result.statistics.overdue).toBe(0);
    for (const client of [b, anon])
      await expect(
        getStatistics(createSupabaseStatisticsRepository(client), request),
      ).rejects.toThrow();
    const empty = await getStatistics(createSupabaseStatisticsRepository(a), {
      ...request,
      courseId: otherCourse,
      deck: undefined,
    });
    expect(empty.ok && empty.statistics.totals.reviews).toBe(0);
  });
  it("deduplicates multiple deck membership and uses current content classification", async () => {
    const secondDeck = randomUUID();
    await checked(
      a.from("decks").insert({
        id: secondDeck,
        owner_id: ownerId,
        course_id: courseId,
        title: "Second original fixture",
      }),
    );
    await checked(
      a
        .from("deck_concepts")
        .insert({ deck_id: secondDeck, concept_id: concept, owner_id: ownerId }),
    );
    await checked(
      a.from("concepts").update({ kind: "grammar", cefr_level: "B1" }).eq("id", concept),
    );
    const result = await getStatistics(createSupabaseStatisticsRepository(a), {
      ...input(),
      days: "30",
      deck: undefined,
    });
    if (!result.ok) throw new Error("Valid period rejected");
    expect(result.statistics.totals.reviews).toBe(1044);
    expect(result.statistics.states.review).toBe(1);
    expect(result.statistics.byKind[0]).toMatchObject({ key: "grammar", reviews: 1044 });
    expect(result.statistics.byLevel[0]).toMatchObject({ key: "B1", reviews: 1044 });
  });
  it("uses an owner/time index on a dataset with over 1,000 rows", () => {
    const plan = execFileSync(
      "docker",
      [
        "exec",
        "supabase_db_lexora",
        "psql",
        "-X",
        "-qAt",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `analyze public.review_logs; explain (analyze, buffers, format json) select id, reviewed_at from public.review_logs where owner_id = '${ownerId}' order by reviewed_at desc, id desc limit 41;`,
      ],
      { encoding: "utf8", timeout: 10000 },
    );
    // PostgreSQL may prefer the pre-existing time index plus a small incremental
    // sort for this fixture. Both valid plans avoid an unindexed history scan.
    expect(plan).toMatch(/"Index Name": "review_logs_owner_reviewed(?:_at|_id)_idx"/);
  });
  it("includes archived history and excludes archived content from current metrics", async () => {
    const before = await checked(
      a.from("review_logs").select("id,state_after").eq("owner_id", ownerId).order("id"),
    );
    await checked(
      a.from("concepts").update({ archived_at: "2026-11-10T00:00:00Z" }).eq("id", concept),
    );
    const result = await getReviewHistory(createSupabaseReviewHistoryRepository(a), input());
    expect(result.ok && result.entries.length).toBe(40);
    const after = await checked(
      a.from("review_logs").select("id,state_after").eq("owner_id", ownerId).order("id"),
    );
    expect(after).toEqual(before);
    const statistics = await getStatistics(createSupabaseStatisticsRepository(a), {
      ...input(),
      days: "30",
      deck: undefined,
    });
    expect(statistics.ok && statistics.statistics.totals.reviews).toBe(1044);
    expect(statistics.ok && statistics.statistics.states.review).toBe(0);
    expect(statistics.ok && statistics.statistics.byLevel).toEqual([
      { key: "B1", reviews: 1044, states: { new: 0, learning: 0, review: 0, relearning: 0 } },
    ]);
  });
});
