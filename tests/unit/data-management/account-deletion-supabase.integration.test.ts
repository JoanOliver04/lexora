import { randomUUID, createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  createSupabaseAccountDeletionGateway,
  readOwnDeletionFactors,
} from "@/modules/data-management/infrastructure/supabase-account-deletion";
import { createSupabaseProfileRepository } from "@/modules/identity/infrastructure/supabase-profile-repository";
import { MissingAuthOwnerError } from "@/modules/identity/application/ensure-profile";
import { createSupabaseDataExportRepository } from "@/modules/data-management/infrastructure/supabase-data-export-repository";
import { formatDataExport } from "@/modules/data-management/infrastructure/export-format";
import type { Database } from "@/shared/infrastructure/supabase/database.types";

function sql(input: string) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_lexora",
      "psql",
      "-X",
      "-q",
      "-t",
      "-A",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 10000 },
  ).trim();
}
async function checked<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}
function totp(secret: string) {
  let bits = 0,
    value = 0;
  const bytes: number[] = [];
  for (const char of secret.toUpperCase().replace(/=+$/, "")) {
    const n = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(char);
    if (n < 0) throw new Error("Invalid local TOTP fixture");
    value = (value << 5) | n;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
    }
  }
  const time = Buffer.alloc(8);
  time.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", Buffer.from(bytes)).update(time).digest(),
    offset = hash[19]! & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
}

describe.skipIf(process.env["LEXORA_DB_TESTS"] !== "1")(
  "Self deletion against real local Auth and RLS",
  () => {
    let a: SupabaseClient<Database>,
      b: SupabaseClient<Database>,
      mfa: SupabaseClient<Database>,
      anon: SupabaseClient<Database>,
      make: () => SupabaseClient<Database>;
    const users: { id: string; email: string; password: string }[] = [];
    beforeAll(async () => {
      if (!process.env["NEXT_PUBLIC_SUPABASE_URL"]) process.loadEnvFile(".env.local");
      const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
        parsed = new URL(url);
      if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || parsed.port !== "54321")
        throw new Error("Synthetic local deletion fixtures only");
      make = () =>
        createClient<Database>(url, process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]!, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
      a = make();
      b = make();
      mfa = make();
      anon = make();
      for (const client of [a, b, mfa]) {
        const email = `delete-${randomUUID()}@example.com`,
          password = randomUUID();
        const auth = await checked(client.auth.signUp({ email, password }));
        if (!auth.user || !auth.session) throw new Error("Local session required");
        users.push({ id: auth.user.id, email, password });
        await checked(client.from("profiles").insert({ id: auth.user.id }));
        await checked(
          client.rpc("complete_onboarding", {
            p_ui_locale: "en",
            p_declared_level: "A1",
            p_start_level: "A1",
            p_daily_new_limit: 5,
          }),
        );
      }
    });
    afterAll(async () => {
      for (const user of users) {
        if (
          !/^delete-[a-f0-9-]+@example\.com$/.test(user.email) ||
          !/^[-a-f0-9]{36}$/.test(user.id)
        )
          throw new Error("Unsafe fixture cleanup");
        sql(`delete from auth.users where id='${user.id}' and email='${user.email}';`);
      }
      for (const client of [a, b, mfa, anon]) await client?.auth.signOut();
    });
    it("does not invoke deletion for an unauthenticated caller, another email or wrong password", async () => {
      const user = users[0]!,
        input = { ...user, confirmation: "DELETE" as const, acknowledged: true as const };
      expect(
        await createSupabaseAccountDeletionGateway(anon).reauthenticateAndDelete(input),
      ).toEqual({ ok: false, error: "unauthenticated" });
      expect(
        await createSupabaseAccountDeletionGateway(a).reauthenticateAndDelete({
          ...input,
          email: users[1]!.email,
        }),
      ).toEqual({ ok: false, error: "invalid-credentials" });
      expect(
        await createSupabaseAccountDeletionGateway(a).reauthenticateAndDelete({
          ...input,
          password: "Wrong-password-123",
        }),
      ).toEqual({ ok: false, error: "invalid-credentials" });
      expect(sql(`select count(*) from auth.users where id='${user.id}';`)).toBe("1");
    });
    it("exports first, requires reauthentication, deletes all app entities and Auth atomically, and preserves B", async () => {
      const user = users[0]!,
        owner = user.id,
        course = (await checked(a.from("courses").select("id").single()))!.id;
      const deck = randomUUID(),
        concept = randomUUID(),
        item = randomUUID(),
        tag = randomUUID(),
        job = randomUUID(),
        session = randomUUID();
      await checked(
        a.from("decks").insert({
          id: deck,
          owner_id: owner,
          course_id: course,
          title: "Original archived",
          archived_at: new Date().toISOString(),
        }),
      );
      await checked(
        a.from("concepts").insert({
          id: concept,
          owner_id: owner,
          course_id: course,
          kind: "vocabulary",
          title: "Original",
          summary: "Original synthetic deletion fixture",
        }),
      );
      await checked(
        a.from("deck_concepts").insert({ deck_id: deck, concept_id: concept, owner_id: owner }),
      );
      await checked(
        a.from("practice_items").insert({
          id: item,
          owner_id: owner,
          concept_id: concept,
          mode: "basic_recall",
          prompt_text: "Original",
          answer_text: "Answer",
          config: { mode: "basic_recall" },
        }),
      );
      await checked(
        a.from("tags").insert({
          id: tag,
          owner_id: owner,
          course_id: course,
          display_name: "Original tag",
          normalized_name: "original tag",
        }),
      );
      await checked(
        a.from("concept_tags").insert({ owner_id: owner, concept_id: concept, tag_id: tag }),
      );
      await checked(
        a.from("import_jobs").insert({
          id: job,
          owner_id: owner,
          course_id: course,
          original_filename: "original.csv",
          content_hash: "fixture",
        }),
      );
      await checked(
        a.from("import_job_errors").insert({
          owner_id: owner,
          import_job_id: job,
          row_number: 1,
          code: "front_empty",
          message: "Original bounded diagnostic",
        }),
      );
      await checked(
        a.from("study_sessions").insert({ id: session, owner_id: owner, course_id: course }),
      );
      sql(
        `insert into public.learning_states(owner_id,practice_item_id,due_at,scheduler_version,config_version) values('${owner}','${item}',now(),'fixture','fixture'); insert into public.review_logs(owner_id,practice_item_id,study_session_id,idempotency_key,rating,reviewed_at,state_before,state_after,due_before,due_after,scheduler_version,config_version) values('${owner}','${item}','${session}',gen_random_uuid(),'good',now(),'{}','{}',now(),now(),'fixture','fixture');`,
      );
      const snapshot = await createSupabaseDataExportRepository(a).readOwnData();
      const artifact = formatDataExport(snapshot, "json"),
        backup = JSON.parse([...artifact.chunks()].join(""));
      for (const entity of [
        "profiles",
        "courses",
        "course_settings",
        "decks",
        "concepts",
        "deck_concepts",
        "practice_items",
        "tags",
        "concept_tags",
        "learning_states",
        "review_logs",
        "study_sessions",
        "import_jobs",
        "import_job_errors",
      ] as const)
        expect(backup.payload[entity]).toHaveLength(1);
      const { data: oldSession, error: sessionError } = await a.auth.getSession();
      if (sessionError || !oldSession.session) throw new Error("Expected original local session");
      sql(`update auth.sessions set created_at=now()-interval '1 hour' where user_id='${owner}';`);
      expect(
        (await a.rpc("delete_own_account", { p_email: user.email, p_confirmation: "DELETE" })).error
          ?.code,
      ).toBe("PT401");
      const stale = make();
      await checked(
        stale.auth.setSession({
          access_token: oldSession.session!.access_token,
          refresh_token: oldSession.session!.refresh_token,
        }),
      );
      expect(
        await createSupabaseAccountDeletionGateway(a).reauthenticateAndDelete({
          ...user,
          confirmation: "DELETE",
          acknowledged: true,
        }),
      ).toEqual({ ok: true });
      expect(sql(`select count(*) from auth.users where id='${owner}';`)).toBe("0");
      expect(sql(`select count(*) from auth.sessions where user_id='${owner}';`)).toBe("0");
      for (const entity of [
        "courses",
        "decks",
        "concepts",
        "deck_concepts",
        "practice_items",
        "tags",
        "concept_tags",
        "learning_states",
        "review_logs",
        "study_sessions",
        "import_jobs",
        "import_job_errors",
        "account_export_requests",
      ] as const)
        expect(sql(`select count(*) from public.${entity} where owner_id='${owner}';`)).toBe("0");
      expect(sql(`select count(*) from public.course_settings where user_id='${owner}';`)).toBe(
        "0",
      );
      expect(sql(`select count(*) from public.profiles where id='${owner}';`)).toBe("0");
      expect((await b.from("profiles").select("id").single()).data?.id).toBe(users[1]!.id);
      expect((await stale.from("concepts").select("id")).data).toEqual([]);
      await expect(
        createSupabaseProfileRepository(stale).ensureExists(owner),
      ).rejects.toBeInstanceOf(MissingAuthOwnerError);
      expect(
        (await stale.rpc("delete_own_account", { p_email: user.email, p_confirmation: "DELETE" }))
          .data,
      ).toBe(true);
      expect(
        (await a.auth.signInWithPassword({ email: user.email, password: user.password })).error,
      ).not.toBeNull();
      await stale.auth.signOut();
    });
    it("requires MFA and deletes using the second of two real verified TOTP factors", async () => {
      const user = users[2]!;
      const enrollment = await checked(
        mfa.auth.mfa.enroll({ factorType: "totp", friendlyName: "Synthetic deletion test" }),
      );
      if (!enrollment || enrollment.type !== "totp") throw new Error("Expected local TOTP");
      await checked(
        mfa.auth.mfa.challengeAndVerify({
          factorId: enrollment.id,
          code: totp(enrollment.totp.secret),
        }),
      );
      const second = await checked(
        mfa.auth.mfa.enroll({ factorType: "totp", friendlyName: "Second synthetic authenticator" }),
      );
      if (!second || second.type !== "totp") throw new Error("Expected second local TOTP");
      await checked(
        mfa.auth.mfa.challengeAndVerify({ factorId: second.id, code: totp(second.totp.secret) }),
      );
      const available = await readOwnDeletionFactors(mfa);
      expect(available?.requiresMfa).toBe(true);
      expect(available?.factors.map((f) => f.id)).toEqual(
        expect.arrayContaining([enrollment.id, second.id]),
      );
      const gateway = createSupabaseAccountDeletionGateway(mfa),
        input = { ...user, confirmation: "DELETE" as const, acknowledged: true as const };
      expect(await gateway.reauthenticateAndDelete(input)).toEqual({
        ok: false,
        error: "mfa-required",
      });
      expect(sql(`select count(*) from auth.users where id='${user.id}';`)).toBe("1");
      expect(
        await gateway.reauthenticateAndDelete({
          ...input,
          otp: totp(second.totp.secret),
          factorId: randomUUID(),
        }),
      ).toEqual({ ok: false, error: "mfa-required" });
      // A real Auth server rejects reuse of the enrollment TOTP. Wait for the
      // next real 30-second step rather than faking a server clock or bypassing MFA.
      await new Promise((resolve) => setTimeout(resolve, 31000 - (Date.now() % 30000)));
      expect(
        await gateway.reauthenticateAndDelete({
          ...input,
          otp: totp(second.totp.secret),
          factorId: second.id,
        }),
      ).toEqual({ ok: true });
      expect(sql(`select count(*) from auth.users where id='${user.id}';`)).toBe("0");
    }, 45000);
  },
);
