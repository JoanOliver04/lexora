import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { formatDataExport } from "@/modules/data-management/infrastructure/export-format";
import { createSupabaseDataExportRepository } from "@/modules/data-management/infrastructure/supabase-data-export-repository";
import type { ExportSnapshot, ExportPayload } from "@/modules/data-management/domain/data-export";
import type { Database } from "@/shared/infrastructure/supabase/database.types";
async function checked<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}
describe.skipIf(process.env["LEXORA_DB_TESTS"] !== "1")(
  "Export against real local RLS and quota",
  () => {
    let a: SupabaseClient<Database>,
      b: SupabaseClient<Database>,
      c: SupabaseClient<Database>,
      anon: SupabaseClient<Database>,
      owner: string;
    let snapshot: ExportSnapshot & { payload: ExportPayload };
    const users: string[] = [],
      concept = randomUUID(),
      item = randomUUID(),
      deck = randomUUID(),
      foreign = `Foreign-${randomUUID()}`;
    beforeAll(async () => {
      if (!process.env["NEXT_PUBLIC_SUPABASE_URL"]) process.loadEnvFile(".env.local");
      const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
        parsed = new URL(url);
      if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || parsed.port !== "54321")
        throw new Error("Synthetic local fixtures only");
      const make = () =>
        createClient<Database>(url, process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]!, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
      a = make();
      b = make();
      c = make();
      anon = make();
      for (const client of [a, b, c]) {
        const auth = await checked(
          client.auth.signUp({
            email: `export-${randomUUID()}@example.com`,
            password: randomUUID(),
          }),
        );
        if (!auth.user || !auth.session) throw new Error("Local fixture session required");
        users.push(auth.user.id);
        await checked(
          client
            .from("profiles")
            .insert({ id: auth.user.id, display_name: client === a ? "Own original" : foreign }),
        );
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
      const course = await checked(a.from("courses").select("id").single());
      await checked(
        a.from("decks").insert({
          id: deck,
          owner_id: owner,
          course_id: course!.id,
          title: "Original fixture",
          archived_at: "2026-11-01T00:00:00Z",
        }),
      );
      await checked(
        a.from("concepts").insert({
          id: concept,
          owner_id: owner,
          course_id: course!.id,
          kind: "vocabulary",
          title: "=Original formula-like title",
          summary: 'Original,\nquoted "text" 😀',
          archived_at: "2026-11-01T00:00:00Z",
        }),
      );
      await checked(
        a.from("deck_concepts").insert({ owner_id: owner, deck_id: deck, concept_id: concept }),
      );
      await checked(
        a.from("practice_items").insert({
          id: item,
          owner_id: owner,
          concept_id: concept,
          mode: "basic_recall",
          prompt_text: "Original",
          answer_text: "Original answer",
          config: { mode: "basic_recall" },
        }),
      );
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
          input: `insert into public.review_logs(owner_id,practice_item_id,idempotency_key,rating,reviewed_at,state_before,state_after,due_before,due_after,scheduler_version,config_version) select '${owner}','${item}',gen_random_uuid(),'good','2026-11-11T12:00:00Z','{"phase":"review"}','{"phase":"review"}','2026-11-10','2026-11-12','fixture','fixture' from generate_series(1,1003); update public.concepts set metadata='{"__proto__":{"kept":true},"integer":9007199254740993,"decimal":0.12345678901234567890123456789}'::jsonb where id='${concept}' and owner_id='${owner}';`,
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 10000,
        },
      );
    });
    afterAll(async () => {
      for (const client of [a, b, c]) if (client) await client.auth.signOut();
      if (users.length)
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
            input: `delete from auth.users where id in (${users.map((id) => `'${id}'`).join(",")}) and email like 'export-%@example.com';`,
            stdio: ["pipe", "pipe", "pipe"],
            timeout: 10000,
          },
        );
    });
    it("admits one concurrent export and returns all 1,003 historical events", async () => {
      const repo = createSupabaseDataExportRepository(a);
      const results = await Promise.allSettled([repo.readOwnData(), repo.readOwnData()]);
      const success = results.filter((r) => r.status === "fulfilled");
      expect(success).toHaveLength(1);
      const winner = success[0]!;
      if (winner.status !== "fulfilled") throw new Error("Export missing");
      snapshot = {
        ...winner.value,
        payload: JSON.parse(winner.value.payloadText) as ExportPayload,
      };
      expect(results.find((r) => r.status === "rejected")).toMatchObject({
        reason: { kind: "cooldown" },
      });
      expect(snapshot.payload.review_logs).toHaveLength(1003);
      expect(snapshot.payload.concepts[0]).toMatchObject({
        id: concept,
        archived_at: "2026-11-01T00:00:00+00:00",
      });
      expect(snapshot.payload.deck_concepts[0]).toMatchObject({
        deck_id: deck,
        concept_id: concept,
      });
      const json = [...formatDataExport(snapshot, "json").chunks()].join("");
      expect(json).toContain('"integer":9007199254740993');
      expect(json).toContain('"decimal":0.12345678901234567890123456789');
      expect(Object.hasOwn(JSON.parse(json).payload.concepts[0].metadata, "__proto__")).toBe(true);
      const csv = [...formatDataExport(snapshot, "csv").chunks()].join("");
      expect(csv).toContain('""integer"":9007199254740993');
      expect(snapshot.rows).toBe(
        Object.values(snapshot.payload).reduce((sum, rows) => sum + rows.length, 0),
      );
    });
    it("B exports only B; anonymous cannot execute the RPC", async () => {
      const other = await createSupabaseDataExportRepository(b).readOwnData();
      const otherPayload = JSON.parse(other.payloadText) as ExportPayload;
      expect(otherPayload.review_logs).toEqual([]);
      expect(otherPayload.profiles[0]?.["display_name"]).toBe(foreign);
      expect(JSON.stringify(snapshot)).not.toContain(foreign);
      for (const [entity, rows] of Object.entries(snapshot.payload))
        for (const row of rows) {
          if (entity === "profiles") expect(row["id"]).toBe(owner);
          if ("owner_id" in row) expect(row["owner_id"]).toBe(owner);
          if ("user_id" in row) expect(row["user_id"]).toBe(owner);
        }
      expect((await anon.rpc("export_account_data")).error?.code).toBe("42501");
      expect(Object.keys(snapshot.payload)).not.toContain("users");
      expect(Object.keys(snapshot.payload.profiles[0]!)).not.toContain("email");
    });
    it("refuses an oversized account completely and commits its cooldown", async () => {
      const course = await checked(c.from("courses").select("id").single());
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
          input: `insert into public.concepts(owner_id,course_id,kind,title,summary,metadata) values ('${users[2]}','${course!.id}','vocabulary','Original large fixture','Original',jsonb_build_object('padding',repeat('x',16777217)));`,
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 10000,
        },
      );
      const repo = createSupabaseDataExportRepository(c);
      await expect(repo.readOwnData()).rejects.toMatchObject({ kind: "too-large" });
      await expect(repo.readOwnData()).rejects.toMatchObject({ kind: "cooldown" });
    });
    it("cannot bypass cooldown by backdating, deleting or changing ownership", async () => {
      expect(
        (
          await a
            .from("account_export_requests")
            .update({ requested_at: "2000-01-01T00:00:00Z" })
            .eq("owner_id", owner)
        ).error?.code,
      ).toBe("PT429");
      expect(
        (await a.from("account_export_requests").delete().eq("owner_id", owner)).error?.code,
      ).toBe("42501");
      expect(
        (await a.from("account_export_requests").insert({ owner_id: users[1]! })).error?.code,
      ).toBe("42501");
      await expect(createSupabaseDataExportRepository(a).readOwnData()).rejects.toMatchObject({
        kind: "cooldown",
      });
      const logs = await a.from("review_logs").select("id", { count: "exact", head: true });
      expect(logs.error).toBeNull();
      expect(logs.count).toBe(1003);
    });
  },
);
