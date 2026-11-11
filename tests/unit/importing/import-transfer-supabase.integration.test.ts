import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/shared/infrastructure/supabase/database.types";
import { createSupabaseImportTransferRepository } from "@/modules/importing/infrastructure/supabase-import-transfer-repository";
import {
  preparePersistenceRecords,
  type ImportDescriptor,
  type ImportTransferRepository,
} from "@/modules/importing/application/import-transfer";

describe.skipIf(process.env["LEXORA_DB_TESTS"] !== "1")(
  "Bounded imports against real local RLS",
  () => {
    let url: string,
      key: string,
      a: SupabaseClient<Database>,
      b: SupabaseClient<Database>,
      anonymous: SupabaseClient<Database>;
    let owner: string, course: string, deck: string, port: ImportTransferRepository;
    const users: string[] = [];
    const make = () =>
      createClient<Database>(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
    const descriptor = (rowsTotal: number): ImportDescriptor => ({
      id: randomUUID(),
      courseId: course,
      deckId: deck,
      filename: "synthetic-import.tsv",
      fileHash: "a".repeat(64),
      rowsTotal,
      mapping: {
        front: 0,
        back: 1,
        tags: 2,
        strategy: "skip",
        createReverse: true,
        originalBytes: 100000,
      },
    });
    beforeAll(async () => {
      if (!process.env["NEXT_PUBLIC_SUPABASE_URL"]) process.loadEnvFile(".env.local");
      url = process.env["NEXT_PUBLIC_SUPABASE_URL"]!;
      key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]!;
      const parsed = new URL(url);
      if (!["127.0.0.1", "localhost"].includes(parsed.hostname) || parsed.port !== "54321")
        throw new Error("Synthetic local fixtures only");
      a = make();
      b = make();
      anonymous = make();
      for (const client of [a, b]) {
        const { data, error } = await client.auth.signUp({
          email: `import-transfer-${randomUUID()}@example.com`,
          password: randomUUID(),
        });
        if (error || !data.user || !data.session) throw new Error("Local fixture session required");
        users.push(data.user.id);
        const profile = await client.from("profiles").insert({ id: data.user.id });
        if (profile.error) throw new Error("Fixture profile failed");
        const setup = await client.rpc("complete_onboarding", {
          p_ui_locale: "en",
          p_declared_level: "A1",
          p_start_level: "A1",
          p_daily_new_limit: 5,
        });
        if (setup.error) throw new Error("Fixture course failed");
      }
      owner = users[0]!;
      const courses = await a.from("courses").select("id").single();
      if (courses.error || !courses.data) throw new Error("Fixture course missing");
      course = courses.data.id;
      deck = randomUUID();
      const added = await a
        .from("decks")
        .insert({ id: deck, owner_id: owner, course_id: course, title: "Synthetic import target" });
      if (added.error) throw new Error("Fixture deck missing");
      port = createSupabaseImportTransferRepository(a, owner);
    }, 30000);
    afterAll(() => {
      for (const id of users)
        if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Unsafe fixture identity");
      if (users.length)
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
            `delete from auth.users where id in (${users.map((id) => `'${id}'::uuid`).join(",")}) and email like 'import-transfer-%@example.com';`,
          ],
          { stdio: ["pipe", "pipe", "pipe"] },
        );
    });

    it("persists 1010 rows in five batches, retries once, preserves inverses/tags and finds a duplicate beyond 1000", async () => {
      const input = descriptor(1010),
        job = await port.begin(input);
      expect(job.processedRows).toBe(0);
      const records = preparePersistenceRecords(
        Array.from({ length: 1010 }, (_, index) => ({
          kind: "valid" as const,
          rowNumber: index + 1,
          front: `Synthetic ${String(index).padStart(5, "0")}`,
          back: `Synthetic meaning ${index}`,
          tags: ["Árbol::rama"],
        })),
        "en",
      );
      let progress = job;
      for (let offset = 0; offset < records.length; offset += 250) {
        progress = await port.append(job.id, offset, records.slice(offset, offset + 250));
        if (offset === 0) {
          const replay = await port.append(job.id, offset, records.slice(0, 250));
          expect(replay.processedRows).toBe(250);
        }
      }
      expect(progress).toMatchObject({
        status: "completed",
        processedRows: 1010,
        rowsCreated: 1010,
        rowsSkipped: 0,
        rowsFailed: 0,
      });
      const concepts = await a
        .from("concepts")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", owner);
      expect(concepts.count).toBe(1010);
      const items = await a
        .from("practice_items")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", owner);
      expect(items.count).toBe(2020);
      const tags = await a.from("tags").select("normalized_name").eq("owner_id", owner);
      expect(tags.data).toEqual([{ normalized_name: "árbol::rama" }]);
      const receipts = await a
        .from("import_job_batches")
        .select("request_payload")
        .eq("owner_id", owner);
      expect(receipts.data).toHaveLength(5);
      expect(receipts.data!.every((row) => row.request_payload === null)).toBe(true);
      const matches = await port.duplicates(course, [{ rowNumber: 1, front: "Synthetic 01009" }]);
      expect(matches).toEqual([
        { rowNumber: 1, canonicalKey: "synthetic 01009", existingTitles: ["Synthetic 01009"] },
      ]);
      await new Promise((resolve) => setTimeout(resolve, 2100));
      const retry = await port.begin(descriptor(1));
      const duplicate = await port.append(
        retry.id,
        0,
        preparePersistenceRecords(
          [
            {
              kind: "valid",
              rowNumber: 1,
              front: "Synthetic 01009",
              back: "Synthetic meaning 1009",
              tags: [],
            },
          ],
          "en",
        ),
      );
      expect(duplicate).toMatchObject({
        status: "completed",
        rowsCreated: 0,
        rowsSkipped: 1,
        rowsDuplicate: 1,
      });
      expect((await port.begin(input)).id).toBe(job.id);
      await expect(port.begin({ ...input, fileHash: "b".repeat(64) })).rejects.toMatchObject({
        kind: "conflict",
      });
      await expect(
        port.append(job.id, 0, [
          { kind: "valid", rowNumber: 1, front: "Changed retry", back: "Changed", tags: [] },
        ]),
      ).rejects.toMatchObject({ kind: "conflict" });
    }, 30000);

    it("hides owner data and rejects foreign/anonymous RPC calls and fabricated progress", async () => {
      const pending = await a
        .from("import_jobs")
        .select("id")
        .eq("owner_id", owner)
        .not("request_fingerprint", "is", null)
        .limit(1)
        .single();
      if (!pending.data) throw new Error("Completed fixture missing");
      const foreign = createSupabaseImportTransferRepository(b, users[1]!);
      await expect(foreign.status(pending.data.id)).rejects.toMatchObject({ kind: "not-found" });
      await expect(foreign.append(pending.data.id, 0, [])).rejects.toMatchObject({
        kind: "not-found",
      });
      expect(
        (await b.from("import_job_batches").select("*").eq("import_job_id", pending.data.id)).data,
      ).toEqual([]);
      expect(
        (
          await anonymous.rpc("commit_import_batch", {
            p_job_id: pending.data.id,
            p_offset: 0,
            p_records: [],
            p_stop: false,
          })
        ).error?.code,
      ).toBe("42501");
      expect(
        (
          await a
            .from("import_jobs")
            .update({ processed_rows: 0, rows_created: 0 })
            .eq("id", pending.data.id)
        ).error?.code,
      ).toBe("42501");
      expect((await a.from("import_jobs").delete().eq("id", pending.data.id)).error?.code).toBe(
        "42501",
      );
      expect(
        (await a.from("import_job_batches").delete().eq("import_job_id", pending.data.id)).error
          ?.code,
      ).toBe("42501");
    });

    it("records bounded row errors and stops atomically without a hidden retry or quota reset", async () => {
      await new Promise((resolve) => setTimeout(resolve, 2100));
      const job = await port.begin(descriptor(3));
      const records = preparePersistenceRecords(
        [
          { kind: "valid", rowNumber: 1, front: "x".repeat(201), back: "Synthetic", tags: [] },
          {
            kind: "valid",
            rowNumber: 2,
            front: "Synthetic final",
            back: "Synthetic final meaning",
            tags: [],
          },
        ],
        "en",
      );
      const progress = await port.append(job.id, 0, records);
      expect(progress).toMatchObject({
        processedRows: 2,
        rowsCreated: 1,
        rowsFailed: 1,
        status: "importing",
      });
      expect((await port.errors(job.id, 0))[0]).toMatchObject({
        rowNumber: 1,
        code: "front_too_long",
      });
      await expect(port.append(job.id, 0, [records[1]!])).rejects.toMatchObject({
        kind: "conflict",
      });
      const stopped = await port.stop(job.id);
      expect(stopped).toMatchObject({ status: "failed", processedRows: 2, rowsCreated: 1 });
      await expect(
        port.append(job.id, 2, [{ ...records[1]!, rowNumber: 3 }]),
      ).rejects.toMatchObject({ kind: "conflict" });
      await expect(port.begin(descriptor(1))).rejects.toMatchObject({ kind: "cooldown" });
      expect((await a.from("import_rate_limits").delete().eq("owner_id", owner)).error?.code).toBe(
        "42501",
      );
    });

    it("serializes concurrent starts and identical batch submissions without charging or creating twice", async () => {
      await new Promise((resolve) => setTimeout(resolve, 2100));
      const input = {
        ...descriptor(2),
        mapping: { ...descriptor(2).mapping, strategy: "copy" as const },
      };
      const before = await a.from("import_rate_limits").select("attempts").single();
      const [first, second] = await Promise.all([
        port.begin(input),
        port.begin({ ...input, id: randomUUID() }),
      ]);
      expect(first.id).toBe(second.id);
      const after = await a.from("import_rate_limits").select("attempts").single();
      expect(after.data?.attempts).toBe((before.data?.attempts ?? 0) + 1);
      const batch = preparePersistenceRecords(
        [
          {
            kind: "valid",
            rowNumber: 1,
            front: "Concurrent synthetic one",
            back: "Meaning",
            tags: [],
          },
          {
            kind: "valid",
            rowNumber: 2,
            front: "Concurrent synthetic two",
            back: "Meaning",
            tags: [],
          },
        ],
        "en",
      );
      const results = await Promise.all([
        port.append(first.id, 0, batch),
        port.append(first.id, 0, batch),
      ]);
      expect(results.map((result) => result.rowsCreated)).toEqual([2, 2]);
      expect(
        (await a.from("import_job_batches").select("batch_offset").eq("import_job_id", first.id))
          .data,
      ).toEqual([{ batch_offset: 0 }]);
      expect(
        (
          await a
            .from("concepts")
            .select("id", { count: "exact", head: true })
            .like("title", "Concurrent synthetic %")
        ).count,
      ).toBe(2);
    });

    it("rolls back content, diagnostics, receipts and progress after a late database failure", async () => {
      await new Promise((resolve) => setTimeout(resolve, 2100));
      const job = await port.begin(descriptor(2));
      const invalid = await a.rpc("commit_import_batch", {
        p_job_id: job.id,
        p_offset: 0,
        p_stop: false,
        p_records: [
          {
            kind: "valid",
            rowNumber: 1,
            front: "Synthetic rollback probe",
            back: "Meaning",
            tags: [],
          },
          // This fails the diagnostic NOT NULL constraint after content inserts.
          { kind: "error", rowNumber: 2, code: null, message: "Synthetic failure", sample: "" },
        ],
      });
      expect(invalid.error?.code).toBe("23502");
      expect((await port.status(job.id)).processedRows).toBe(0);
      expect(await port.errors(job.id, 0)).toEqual([]);
      expect(
        (await a.from("import_job_batches").select("batch_offset").eq("import_job_id", job.id))
          .data,
      ).toEqual([]);
      expect(
        (await a.from("concepts").select("id").eq("title", "Synthetic rollback probe")).data,
      ).toEqual([]);
      const safe = preparePersistenceRecords(
        [
          { kind: "valid", rowNumber: 1, front: "a".repeat(199) + "😀", back: "Meaning", tags: [] },
          {
            kind: "valid",
            rowNumber: 2,
            front: "<script>literal text</script>",
            back: "Literal plaintext",
            tags: [],
          },
        ],
        "en",
      );
      const finished = await port.append(job.id, 0, safe);
      expect(finished).toMatchObject({ rowsCreated: 1, rowsFailed: 1, status: "completed" });
      expect((await port.errors(job.id, 0))[0]?.sample?.isWellFormed()).toBe(true);
    });
  },
);
