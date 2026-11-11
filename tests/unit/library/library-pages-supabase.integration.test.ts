import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/shared/infrastructure/supabase/database.types";
import { createSupabaseDeckRepository } from "@/modules/library/infrastructure/supabase-deck-repository";
import { createSupabaseDeckDetailRepository } from "@/modules/library/infrastructure/supabase-deck-detail-repository";
import { createSupabaseTagRepository } from "@/modules/library/infrastructure/supabase-tag-repository";
import { createSupabaseLibraryOptionsRepository } from "@/modules/library/infrastructure/supabase-library-options-repository";
import { createSupabasePracticeItemRepository } from "@/modules/library/infrastructure/supabase-practice-item-repository";
import {
  getPracticeItem,
  createReversePracticeItem,
} from "@/modules/library/application/practice-item";
import { attachTagByName } from "@/modules/library/application/tag";
import { countConceptsPerDeck } from "@/modules/library/application/deck";
import {
  parseDeckDetailQuery,
  type DeckDetailRepository,
} from "@/modules/library/application/deck-detail";

describe.skipIf(process.env["LEXORA_DB_TESTS"] !== "1")(
  "Library pages against real local RLS",
  () => {
    let a: SupabaseClient<Database>,
      b: SupabaseClient<Database>,
      anonymous: SupabaseClient<Database>;
    let owner: string, course: string, deck: string, emptyDeck: string, otherCourse: string;
    let reader: DeckDetailRepository;
    const accounts: { id: string; email: string }[] = [];
    const ids = Array.from({ length: 2020 }, () => randomUUID());
    beforeAll(async () => {
      if (!process.env["NEXT_PUBLIC_SUPABASE_URL"]) process.loadEnvFile(".env.local");
      const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
        key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]!;
      const target = new URL(url);
      if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.port !== "54321")
        throw new Error("Local synthetic fixtures only");
      const make = () =>
        createClient<Database>(url, key, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
      a = make();
      b = make();
      anonymous = make();
      for (const client of [a, b]) {
        const email = `library-pages-${randomUUID()}@example.com`;
        const { data, error } = await client.auth.signUp({ email, password: randomUUID() });
        if (error || !data.user || !data.session)
          throw new Error("Synthetic local session missing");
        accounts.push({ id: data.user.id, email });
        if ((await client.from("profiles").insert({ id: data.user.id })).error)
          throw new Error("Fixture profile failed");
        if (
          (
            await client.rpc("complete_onboarding", {
              p_ui_locale: "en",
              p_declared_level: "A1",
              p_start_level: "A1",
              p_daily_new_limit: 5,
            })
          ).error
        )
          throw new Error("Fixture course failed");
      }
      owner = accounts[0]!.id;
      const own = await a.from("courses").select("id").single(),
        foreign = await b.from("courses").select("id").single();
      if (!own.data || !foreign.data) throw new Error("Fixture courses missing");
      course = own.data.id;
      otherCourse = foreign.data.id;
      deck = randomUUID();
      emptyDeck = randomUUID();
      if (
        (
          await a.from("decks").insert([
            { id: deck, owner_id: owner, course_id: course, title: "Synthetic large deck" },
            { id: emptyDeck, owner_id: owner, course_id: course, title: "Synthetic empty deck" },
          ])
        ).error
      )
        throw new Error("Fixture decks failed");
      for (let start = 0; start < ids.length; start += 500) {
        const inserted = await a.from("concepts").insert(
          ids.slice(start, start + 500).map((id, index) => ({
            id,
            owner_id: owner,
            course_id: course,
            kind: "vocabulary" as const,
            title: `Synthetic library ${String(start + index).padStart(5, "0")}`,
            summary: "Synthetic meaning",
          })),
        );
        if (inserted.error) throw new Error("Fixture concepts failed");
      }
      for (let start = 0; start < 1010; start += 500) {
        if (
          (
            await a.from("deck_concepts").insert(
              ids.slice(start, Math.min(start + 500, 1010)).map((id, index) => ({
                owner_id: owner,
                deck_id: deck,
                concept_id: id,
                position: start + index,
              })),
            )
          ).error
        )
          throw new Error("Fixture membership failed");
      }
      reader = createSupabaseDeckDetailRepository(a);
    }, 30000);
    afterAll(() => {
      for (const account of accounts) {
        if (
          !/^[0-9a-f-]{36}$/.test(account.id) ||
          !/^library-pages-[0-9a-f-]{36}@example\.com$/.test(account.email)
        )
          throw new Error("Unsafe fixture identity");
        execFileSync(
          "docker",
          [
            "exec",
            "-i",
            "supabase_db_lexora",
            "psql",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            `delete from auth.users where id='${account.id}'::uuid and email='${account.email}';`,
          ],
          { stdio: ["pipe", "pipe", "pipe"] },
        );
      }
    });
    const read = (query: Record<string, unknown> = {}) =>
      reader.read({
        ownerId: owner,
        courseId: course,
        deckId: deck,
        ...parseDeckDetailQuery(query),
      });

    it("counts all 1010 relationships and returns only bounded member/available pages", async () => {
      const counts = await createSupabaseDeckRepository(a).countConceptsByDeck({
        ownerId: owner,
        deckIds: [deck, emptyDeck],
      });
      expect(counts).toEqual({ [deck]: 1010, [emptyDeck]: 0 });
      expect(
        await countConceptsPerDeck(createSupabaseDeckRepository(a), owner, [
          deck,
          emptyDeck,
          ...Array.from({ length: 99 }, () => randomUUID()),
        ]),
      ).toEqual({ [deck]: 1010, [emptyDeck]: 0 });
      const first = await read();
      expect(first).toMatchObject({
        memberCount: 1010,
        pageSize: 20,
        members: { total: 1010, offset: 0 },
        available: { total: 1010, offset: 0 },
      });
      expect(first!.members.items).toHaveLength(20);
      expect(first!.available.items).toHaveLength(20);
      expect(first!.members.items[0]?.title).toBe("Synthetic library 00000");
      expect(first!.available.items[0]?.title).toBe("Synthetic library 01010");
      const deep = await read({ memberPage: "51", availablePage: "51" });
      expect(deep!.members.items).toHaveLength(10);
      expect(deep!.available.items).toHaveLength(10);
      expect(deep!.members.items[0]?.title).toBe("Synthetic library 01000");
      expect(deep!.available.items.at(-1)?.title).toBe("Synthetic library 02019");
    });

    it("finds the last linked and last available concept beyond the old 1000 cap and clamps stale page URLs", async () => {
      const exact = await read({ members: "01009", available: "02019" });
      expect(exact!.members.items).toEqual([{ id: ids[1009], title: "Synthetic library 01009" }]);
      expect(exact!.available.items).toEqual([{ id: ids[2019], title: "Synthetic library 02019" }]);
      const stale = await read({ memberPage: "99999999", availablePage: "99999999" });
      expect(stale!.members.offset).toBe(1000);
      expect(stale!.available.offset).toBe(1000);
      const bounded = await reader.read({
        ownerId: owner,
        courseId: course,
        deckId: deck,
        ...parseDeckDetailQuery({}),
        limit: 10000,
      });
      expect(bounded?.pageSize).toBe(100);
      expect(bounded?.members.items).toHaveLength(100);
    });

    it("hides foreign owner/course/deck data and denies anonymous execution", async () => {
      const foreign = createSupabaseDeckDetailRepository(b);
      expect(
        await foreign.read({
          ownerId: accounts[1]!.id,
          courseId: course,
          deckId: deck,
          ...parseDeckDetailQuery({}),
        }),
      ).toBeNull();
      expect(
        await reader.read({
          ownerId: accounts[1]!.id,
          courseId: course,
          deckId: deck,
          ...parseDeckDetailQuery({}),
        }),
      ).toBeNull();
      expect(
        await reader.read({
          ownerId: owner,
          courseId: otherCourse,
          deckId: deck,
          ...parseDeckDetailQuery({}),
        }),
      ).toBeNull();
      expect(
        await createSupabaseDeckRepository(b).countConceptsByDeck({
          ownerId: accounts[1]!.id,
          deckIds: [deck],
        }),
      ).toEqual({});
      expect(
        (
          await anonymous.rpc("read_library_deck_detail", {
            p_owner_id: owner,
            p_course_id: course,
            p_deck_id: deck,
          })
        ).error?.code,
      ).toBe("42501");
      expect(
        (
          await a.rpc("count_library_deck_concepts", {
            p_owner_id: owner,
            p_deck_ids: Array(101).fill(deck),
          })
        ).error?.code,
      ).toBe("22023");
    });

    it("excludes archived concepts but keeps an archived deck readable for restoration", async () => {
      expect(
        (
          await a
            .from("concepts")
            .update({ archived_at: "2026-11-11T21:00:00Z" })
            .eq("id", ids[1009]!)
        ).error,
      ).toBeNull();
      expect(
        await createSupabaseDeckRepository(a).countConceptsByDeck({
          ownerId: owner,
          deckIds: [deck],
        }),
      ).toEqual({ [deck]: 1009 });
      const view = await read({ members: "01009", available: "01009" });
      expect(view?.memberCount).toBe(1009);
      expect(view?.members.total).toBe(0);
      expect(view?.available.total).toBe(0);
      expect(
        (await a.from("decks").update({ archived_at: "2026-11-11T21:00:00Z" }).eq("id", deck))
          .error,
      ).toBeNull();
      expect((await read())?.deck.archivedAt).not.toBeNull();
    });

    it("paginates tags, items and destination decks beyond 1000 with private bounded previews", async () => {
      const tagIds = Array.from({ length: 1010 }, () => randomUUID());
      const deckIds = Array.from({ length: 1010 }, () => randomUUID());
      for (let start = 0; start < 1010; start += 500) {
        const batch = tagIds.slice(start, start + 500);
        expect(
          (
            await a.from("tags").insert(
              batch.map((id, i) => ({
                id,
                owner_id: owner,
                course_id: course,
                display_name: `Options_${String(start + i).padStart(5, "0")}`,
                normalized_name: `options_${String(start + i).padStart(5, "0")}`,
              })),
            )
          ).error,
        ).toBeNull();
        expect(
          (
            await a
              .from("concept_tags")
              .insert(batch.map((id) => ({ owner_id: owner, concept_id: ids[3]!, tag_id: id })))
          ).error,
        ).toBeNull();
        expect(
          (
            await a.from("practice_items").insert(
              batch.map((_, i) => ({
                owner_id: owner,
                concept_id: ids[3]!,
                mode: "basic_recognition" as const,
                prompt_text: `Prompt ${String(start + i).padStart(5, "0")}`,
                answer_text: "Meaning",
                config: { mode: "basic_recognition" },
                created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, start + i)).toISOString(),
              })),
            )
          ).error,
        ).toBeNull();
        expect(
          (
            await a.from("decks").insert(
              deckIds.slice(start, start + 500).map((id, i) => ({
                id,
                owner_id: owner,
                course_id: course,
                title: `Options deck ${String(start + i).padStart(5, "0")}`,
                position: start + i,
              })),
            )
          ).error,
        ).toBeNull();
      }
      const options = createSupabaseLibraryOptionsRepository(a);
      const first = await options.concept({
        ownerId: owner,
        courseId: course,
        conceptId: ids[3]!,
        tagOffset: 0,
        itemOffset: 0,
      });
      expect(first?.tags.total).toBe(1010);
      expect(first?.items.total).toBe(1010);
      expect(first?.tags.items).toHaveLength(20);
      expect(first?.items.items).toHaveLength(20);
      const last = await options.concept({
        ownerId: owner,
        courseId: course,
        conceptId: ids[3]!,
        tagOffset: 19999980,
        itemOffset: 19999980,
      });
      expect(last?.tags.offset).toBe(1000);
      expect(last?.items.offset).toBe(1000);
      expect(last?.tags.items.at(-1)?.displayName).toBe("Options_01009");
      expect(last?.items.items.at(-1)?.promptText).toBe("Prompt 01009");
      const itemId = last!.items.items.at(-1)!.id;
      const itemRepository = createSupabasePracticeItemRepository(a);
      const selected = await getPracticeItem(itemRepository, owner, ids[3]!, itemId);
      expect(selected?.promptText).toBe("Prompt 01009");
      expect(await getPracticeItem(itemRepository, owner, ids[4]!, itemId)).toBeNull();
      expect(
        await getPracticeItem(
          createSupabasePracticeItemRepository(b),
          accounts[1]!.id,
          ids[3]!,
          itemId,
        ),
      ).toBeNull();
      expect(await createReversePracticeItem(itemRepository, owner, selected!)).toMatchObject({
        ok: true,
        item: { mode: "basic_recall", answerText: "Prompt 01009" },
      });
      expect(await options.tagPreviews({ ownerId: owner, conceptIds: [ids[3]!, ids[4]!] })).toEqual(
        [{ conceptId: ids[3], total: 1010, items: first?.tags.items.slice(0, 3) }],
      );
      const destination = await options.decks({
        ownerId: owner,
        courseId: course,
        search: "Options deck 01009",
        offset: 0,
        selectedId: deckIds[0]!,
      });
      expect(destination.items).toEqual([{ id: deckIds[1009], title: "Options deck 01009" }]);
      expect(destination.selected?.id).toBe(deckIds[0]);
      expect(
        (
          await options.decks({
            ownerId: owner,
            courseId: course,
            search: "Options deck",
            offset: 1000000,
          })
        ).offset,
      ).toBe(1000);
      const foreign = createSupabaseLibraryOptionsRepository(b);
      expect(
        await foreign.concept({
          ownerId: accounts[1]!.id,
          courseId: course,
          conceptId: ids[3]!,
          tagOffset: 0,
          itemOffset: 0,
        }),
      ).toBeNull();
      expect(
        await foreign.tagPreviews({ ownerId: accounts[1]!.id, conceptIds: [ids[3]!] }),
      ).toEqual([]);
      expect(
        await foreign.decks({
          ownerId: accounts[1]!.id,
          courseId: course,
          search: "",
          offset: 0,
          selectedId: deckIds[0]!,
        }),
      ).toEqual({ items: [], total: 0, offset: 0, selected: null });
      expect(
        (await b.rpc("read_library_tag_previews", { p_owner_id: owner, p_concept_ids: [ids[3]!] }))
          .data,
      ).toEqual([]);
      expect(
        (
          await a.rpc("read_library_tag_previews", {
            p_owner_id: owner,
            p_concept_ids: Array.from({ length: 21 }, () => ids[3]!),
          })
        ).error?.code,
      ).toBe("22023");
      expect(
        (
          await anonymous.rpc("read_library_tag_previews", {
            p_owner_id: owner,
            p_concept_ids: [ids[3]!],
          })
        ).error?.code,
      ).toBe("42501");
      expect(
        (
          await anonymous.rpc("read_library_concept_options", {
            p_owner_id: owner,
            p_course_id: course,
            p_concept_id: ids[3]!,
          })
        ).error?.code,
      ).toBe("42501");
      expect(
        (
          await anonymous.rpc("read_library_deck_options", {
            p_owner_id: owner,
            p_course_id: course,
          })
        ).error?.code,
      ).toBe("42501");
    }, 30000);

    it("reuses a tag beyond 1000 and atomically resolves simultaneous normalized-name associations", async () => {
      const tagIds = Array.from({ length: 1005 }, () => randomUUID());
      for (let start = 0; start < tagIds.length; start += 500) {
        const inserted = await a.from("tags").insert(
          tagIds.slice(start, start + 500).map((id, index) => ({
            id,
            owner_id: owner,
            course_id: course,
            display_name: `Synthetic_Tag_${String(start + index).padStart(5, "0")}`,
            normalized_name: `synthetic_tag_${String(start + index).padStart(5, "0")}`,
          })),
        );
        expect(inserted.error).toBeNull();
      }
      const repository = createSupabaseTagRepository(a);
      expect(
        await attachTagByName(repository, owner, course, ids[0]!, " SYNTHETIC_TAG_01004 "),
      ).toEqual({ ok: true });
      expect(
        await attachTagByName(repository, owner, course, ids[0]!, "synthetic_tag_01004"),
      ).toEqual({ ok: true });
      const associations = await a.from("concept_tags").select("tag_id").eq("concept_id", ids[0]!);
      expect(associations.data).toEqual([{ tag_id: tagIds[1004] }]);
      expect(
        (await a.from("tags").select("display_name").eq("id", tagIds[1004]!).single()).data
          ?.display_name,
      ).toBe("Synthetic_Tag_01004");
      await Promise.all([
        attachTagByName(repository, owner, course, ids[1]!, "Concurrent :: New"),
        attachTagByName(repository, owner, course, ids[2]!, "CONCURRENT::NEW"),
      ]);
      const tag = await a.from("tags").select("id").eq("normalized_name", "concurrent::new");
      expect(tag.data).toHaveLength(1);
      expect(
        (await a.from("concept_tags").select("concept_id").eq("tag_id", tag.data![0]!.id)).data,
      ).toHaveLength(2);
      await expect(
        attachTagByName(repository, owner, course, randomUUID(), "Must not survive"),
      ).rejects.toMatchObject({ kind: "parent-missing" });
      expect(
        (await a.from("tags").select("id").eq("normalized_name", "must not survive")).data,
      ).toEqual([]);
      await expect(
        attachTagByName(
          createSupabaseTagRepository(b),
          accounts[1]!.id,
          course,
          ids[0]!,
          "Foreign attempt",
        ),
      ).rejects.toMatchObject({ kind: "parent-missing" });
      expect(
        (
          await anonymous.rpc("attach_library_tag", {
            p_owner_id: owner,
            p_course_id: course,
            p_concept_id: ids[0]!,
            p_display_name: "Anonymous",
            p_normalized_name: "anonymous",
          })
        ).error?.code,
      ).toBe("42501");
    });
  },
);
