import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabasePreferencesRepository } from "@/modules/preferences/infrastructure/supabase-preferences-repository";
import {
  PreferencesError,
  type PreferenceChange,
} from "@/modules/preferences/application/preferences";
import { getDailyQueue } from "@/modules/study/application/daily-queue";
import { createSupabaseDailyQueueRepository } from "@/modules/study/infrastructure/supabase-daily-queue-repository";
import type { Database } from "@/shared/infrastructure/supabase/database.types";

async function checked<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}
describe.skipIf(process.env["LEXORA_DB_TESTS"] !== "1")(
  "Preferences with real RLS and compare-and-swap",
  () => {
    let a: SupabaseClient<Database>, b: SupabaseClient<Database>, anon: SupabaseClient<Database>;
    let owner: string;
    const userIds: string[] = [],
      otherCourse = randomUUID(),
      deck = randomUUID(),
      concept = randomUUID();
    const items = Array.from({ length: 4 }, () => randomUUID());
    const repository = () => createSupabasePreferencesRepository(a);
    async function current(): Promise<PreferenceChange> {
      const snapshot = await repository().read(owner);
      if (!snapshot) throw new Error("Missing fixture snapshot");
      const { courses: _courses, ...change } = snapshot;
      return change;
    }
    beforeAll(async () => {
      if (!process.env["NEXT_PUBLIC_SUPABASE_URL"]) process.loadEnvFile(".env.local");
      const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
        parsed = new URL(url);
      if (!["127.0.0.1", "localhost"].includes(parsed.hostname) || parsed.port !== "54321")
        throw new Error("Synthetic local fixtures only");
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
            email: `preferences-${randomUUID()}@example.com`,
            password: randomUUID(),
          }),
        );
        if (!auth.user || !auth.session) throw new Error("Fixture session required");
        userIds.push(auth.user.id);
        await checked(client.from("profiles").insert({ id: auth.user.id }));
        await checked(
          client.rpc("complete_onboarding", {
            p_ui_locale: "en",
            p_declared_level: "A1",
            p_start_level: "A1",
            p_daily_new_limit: 5,
          }),
        );
        if (client === a) owner = auth.user.id;
      }
      const initial = await current();
      const original = await checked(
        a
          .from("courses")
          .select("source_language_id,target_language_id")
          .eq("id", initial.courseId)
          .single(),
      );
      await checked(
        a.from("courses").insert({
          ...original!,
          id: otherCourse,
          owner_id: owner,
          title: "Second original course",
        }),
      );
      await checked(
        a
          .from("course_settings")
          .insert({ course_id: otherCourse, user_id: owner, daily_new_limit: 19 }),
      );
      await checked(
        a.from("decks").insert({
          id: deck,
          course_id: initial.courseId,
          owner_id: owner,
          title: "Preferences fixture",
        }),
      );
      await checked(
        a.from("concepts").insert({
          id: concept,
          course_id: initial.courseId,
          owner_id: owner,
          kind: "vocabulary",
          title: "Original fixture",
          summary: "Original",
        }),
      );
      await checked(
        a.from("deck_concepts").insert({ owner_id: owner, deck_id: deck, concept_id: concept }),
      );
      await checked(
        a.from("practice_items").insert(
          items.map((id) => ({
            id,
            owner_id: owner,
            concept_id: concept,
            mode: "basic_recall" as const,
            prompt_text: "Original prompt",
            answer_text: "Original answer",
            config: { mode: "basic_recall" },
          })),
        ),
      );
      await checked(
        a.from("learning_states").insert([
          {
            owner_id: owner,
            practice_item_id: items[2]!,
            phase: "review",
            due_at: "2026-01-01T00:00:00Z",
            scheduler_version: "5.4.2",
            config_version: "v1",
          },
          {
            owner_id: owner,
            practice_item_id: items[3]!,
            phase: "learning",
            due_at: "2026-01-01T00:00:00Z",
            scheduler_version: "5.4.2",
            config_version: "v1",
          },
        ]),
      );
    });
    afterAll(async () => {
      for (const client of [a, b]) if (client) await client.auth.signOut();
      if (userIds.length)
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
            input: `delete from auth.users where id in (${userIds.map((id) => `'${id}'`).join(",")}) and email like 'preferences-%@example.com';`,
            stdio: ["pipe", "pipe", "pipe"],
            timeout: 10000,
          },
        );
    });
    it("persists all safe fields and leaves internal scheduler configuration alone", async () => {
      const before = await current();
      await repository().save(owner, {
        ...before,
        theme: "dark",
        timeZone: "America/New_York",
        dailyNewLimit: 2,
        maximumReviews: 0,
        showIntervals: false,
      });
      const saved = await current();
      expect(saved).toMatchObject({
        theme: "dark",
        timeZone: "America/New_York",
        dailyNewLimit: 2,
        maximumReviews: 0,
        showIntervals: false,
      });
      expect(saved.profileVersion).not.toBe(before.profileVersion);
      const internal = await checked(
        a
          .from("course_settings")
          .select("requested_retention,scheduler_config_version")
          .eq("course_id", saved.courseId)
          .single(),
      );
      expect(internal).toEqual({ requested_retention: null, scheduler_config_version: 1 });
    });
    it("new limits affect the real queue while due learning stays available", async () => {
      const change = await current();
      const queue = async () => {
        const result = await getDailyQueue(createSupabaseDailyQueueRepository(a), {
          ownerId: owner,
          courseId: change.courseId,
          timeZone: change.timeZone,
          now: new Date("2026-11-11T12:00:00Z"),
        });
        if (!result.ok) throw new Error("Queue missing");
        return result.queue;
      };
      expect((await queue()).entries.map((e) => e.practiceItemId)).toHaveLength(3);
      expect((await queue()).hiddenDueReviews).toBe(1);
      await repository().save(owner, { ...change, dailyNewLimit: 0, maximumReviews: 0 });
      const paused = await queue();
      expect(paused.entries.map((e) => e.practiceItemId)).toEqual([items[3]]);
      expect(paused.hiddenNew).toBe(2);
      await repository().save(owner, { ...(await current()), maximumReviews: null });
      expect((await queue()).entries.map((e) => e.practiceItemId)).toHaveLength(2);
    });
    it("permits exactly one concurrent writer and never partially updates the loser", async () => {
      const change = await current();
      const results = await Promise.allSettled([
        repository().save(owner, { ...change, theme: "light", dailyNewLimit: 7 }),
        repository().save(owner, { ...change, theme: "dark", dailyNewLimit: 8 }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const failed = results.find((r) => r.status === "rejected");
      expect(failed?.status === "rejected" && failed.reason).toEqual(
        new PreferencesError("conflict"),
      );
      const result = await current();
      expect([
        ["light", 7],
        ["dark", 8],
      ]).toContainEqual([result.theme, result.dailyNewLimit]);
      await expect(repository().save(owner, change)).rejects.toMatchObject({ kind: "conflict" });
      expect(await current()).toEqual(result);
    });
    it("rejects a stale course version without changing profile data", async () => {
      const change = await current();
      await checked(
        a.from("course_settings").update({ daily_new_limit: 9 }).eq("course_id", change.courseId),
      );
      await expect(repository().save(owner, { ...change, uiLocale: "es" })).rejects.toMatchObject({
        kind: "conflict",
      });
      expect((await current()).uiLocale).toBe(change.uiLocale);
    });
    it("switches only to an owned active course and preserves each course's settings", async () => {
      const first = await current();
      await repository().selectCourse(owner, {
        courseId: otherCourse,
        profileVersion: first.profileVersion,
      });
      const second = await current();
      expect(second.courseId).toBe(otherCourse);
      expect(second.dailyNewLimit).toBe(19);
      await repository().selectCourse(owner, {
        courseId: first.courseId,
        profileVersion: second.profileVersion,
      });
      expect((await current()).dailyNewLimit).toBe(first.dailyNewLimit);
      await checked(a.from("courses").update({ active: false }).eq("id", otherCourse));
      await expect(
        repository().selectCourse(owner, {
          courseId: otherCourse,
          profileVersion: (await current()).profileVersion,
        }),
      ).rejects.toMatchObject({ kind: "unavailable" });
    });
    it("counts each course separately and applies a changed time zone to the day window", async () => {
      const change = await current();
      const event = (phase: string, time: string) => {
        const id = randomUUID();
        return `('${id}','${owner}','${items[0]}','${id}','good','${time}','{"phase":"${phase}"}','{"phase":"review"}','2026-11-10','2026-11-12','fixture','fixture')`;
      };
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
          input: `insert into public.review_logs(id,owner_id,practice_item_id,idempotency_key,rating,reviewed_at,state_before,state_after,due_before,due_after,scheduler_version,config_version) values ${event("new", "2026-11-11T00:30:00Z")},${event("review", "2026-11-11T12:00:00Z")};`,
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 10000,
        },
      );
      const q = createSupabaseDailyQueueRepository(a);
      const period = {
        ownerId: owner,
        courseId: change.courseId,
        dayStart: new Date("2026-11-10T23:00:00Z"),
        dayEnd: new Date("2026-11-11T23:00:00Z"),
      };
      expect(await q.countTodayActivity(period)).toEqual({ newIntroduced: 1, reviewsDone: 1 });
      expect(await q.countTodayActivity({ ...period, courseId: otherCourse })).toEqual({
        newIntroduced: 0,
        reviewsDone: 0,
      });
      expect(
        await q.countTodayActivity({
          ...period,
          dayStart: new Date("2026-11-11T05:00:00Z"),
          dayEnd: new Date("2026-11-12T05:00:00Z"),
        }),
      ).toEqual({ newIntroduced: 0, reviewsDone: 1 });
    });
    it("denies B and anonymous writes or reads of A's preferences", async () => {
      const before = await current();
      expect(await createSupabasePreferencesRepository(b).read(owner)).toBeNull();
      expect(await createSupabasePreferencesRepository(anon).read(owner)).toBeNull();
      const pb = await checked(b.from("profiles").select("updated_at").single());
      await expect(
        createSupabasePreferencesRepository(b).save(owner, {
          ...before,
          profileVersion: pb!.updated_at,
        }),
      ).rejects.toMatchObject({ kind: "unavailable" });
      await expect(
        createSupabasePreferencesRepository(anon).save(owner, before),
      ).rejects.toBeInstanceOf(PreferencesError);
      await expect(
        createSupabasePreferencesRepository(b).selectCourse(owner, {
          courseId: before.courseId,
          profileVersion: pb!.updated_at,
        }),
      ).rejects.toMatchObject({ kind: "unavailable" });
      expect(await current()).toEqual(before);
    });
  },
);
