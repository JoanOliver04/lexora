// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";
import { z } from "zod";
import type { Database } from "@/shared/infrastructure/supabase/database.types";
import { localBackend } from "../../e2e/local-backend";
const batch = z.object({ paths: z.array(z.string()), more: z.boolean() });
async function checked<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const result = await q;
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
function localSql(sql: string) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_lexora",
      "psql",
      "-XAt",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, encoding: "utf8", timeout: 10000 },
  );
}
it.skipIf(process.env["LEXORA_DB_TESTS"] !== "1")(
  "reclaims cancelled and expired uploads for missing courses and preserves shared live audio, including a lost cleanup receipt",
  async () => {
    const { url, publishableKey } = localBackend();
    const client = createClient<Database>(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signup = await client.auth.signUp({
      email: "archive-media-" + randomUUID() + "@example.com",
      password: randomUUID(),
    });
    if (signup.error || !signup.data.user || !signup.data.session)
      throw new Error("Local synthetic sign-up failed");
    const owner = signup.data.user.id;
    const missing = randomUUID(),
      store = client.storage.from("study-audio"),
      paths: string[] = [];
    const body = Buffer.from("RIFFsynthetic recovery audio");
    const hash = createHash("sha256").update(body).digest("hex");
    const manage = (action: string, id: string, course?: string) =>
      client.rpc("manage_account_archive_media", {
        p_request: { action, id, ...(course ? { course, hash } : {}) },
      });
    const restore = (action: string, id: string, extra = {}) =>
      client.rpc("restore_account_archive", { p_request: { action, id, ...extra } });
    try {
      await checked(client.from("profiles").insert({ id: owner }));
      await checked(
        client.rpc("complete_onboarding", {
          p_ui_locale: "en",
          p_declared_level: "A1",
          p_start_level: "A1",
          p_daily_new_limit: 5,
        }),
      );
      const live = (await checked(client.from("courses").select("id").single()))!.id;
      const manifest = {
        format: "lexora-account-archive/1",
        owner,
        exportedAtUtc: new Date().toISOString(),
        pages: [{ entity: "profiles", after: null, rows: 1, bytes: 10, sha256: "0".repeat(64) }],
        audio: [missing, live].map((course) => ({
          course,
          hash,
          bytes: body.length,
          type: "audio/wav",
        })),
      };
      const id = randomUUID();
      await checked(restore("begin", id, { manifest }));
      for (const course of [missing, live]) {
        const path = [owner, course, hash].join("/");
        paths.push(path);
        await checked(manage("reserve", id, course));
        await checked(store.upload(path, body, { contentType: "audio/wav" }));
        await checked(manage("settle", id, course));
      }
      await checked(
        client
          .from("courses")
          .update({
            eoi_sources: { a: { audio: "first.wav", hash }, b: { audio: "shared.wav", hash } },
          })
          .eq("id", live),
      );
      expect(batch.parse(await checked(manage("claim", randomUUID()))).paths).toEqual([]);
      await checked(restore("cancel", id));
      const token = randomUUID();
      expect(batch.parse(await checked(manage("claim", token))).paths).toEqual([paths[0]]);
      // A second worker cannot claim the same live removal. A new restore cannot
      // bind the pathname while that request still owns it.
      expect(batch.parse(await checked(manage("claim", randomUUID()))).paths).toEqual([]);
      localSql(
        "update private.account_archive_restores set created_at=now()-interval '5 seconds' where owner_id='" +
          owner +
          "';",
      );
      expect((await restore("begin", randomUUID(), { manifest })).error?.code).toBe("PT409");
      await checked(store.remove([paths[0]!]));
      localSql(
        "update private.account_archive_media set claim_until=now()-interval '1 minute' where owner_id='" +
          owner +
          "';",
      );
      expect(batch.parse(await checked(manage("claim", randomUUID()))).paths).toEqual([]);
      expect(await checked(store.list(owner + "/" + missing))).toHaveLength(0);
      expect((await checked(store.download(paths[1]!)))?.size).toBe(body.length);
      const second = randomUUID();
      await checked(restore("begin", second, { manifest }));
      await checked(manage("reserve", second, missing));
      await checked(store.upload(paths[0]!, body, { contentType: "audio/wav" }));
      // Simulate closing the browser after Storage accepted the binary, before
      // the settle request, and then letting the original restore expire.
      localSql(
        "update private.account_archive_restores set expires_at=now()-interval '1 minute' where owner_id='" +
          owner +
          "'; update private.account_archive_media set ready_at=now()-interval '1 minute' where owner_id='" +
          owner +
          "';",
      );
      const resumed = randomUUID();
      expect(batch.parse(await checked(manage("claim", resumed))).paths).toEqual([paths[0]]);
      await checked(store.remove([paths[0]!]));
      expect(await checked(manage("finish", resumed))).toBe(true);
      expect(await checked(store.list(owner + "/" + missing))).toHaveLength(0);
      expect((await checked(store.download(paths[1]!)))?.size).toBe(body.length);
      expect(
        localSql(
          "select count(*) from private.account_archive_media where owner_id='" + owner + "';",
        ).trim(),
      ).toBe("0");
    } finally {
      localSql(
        "delete from public.profiles where id='" +
          owner +
          "' and exists(select 1 from auth.users where id='" +
          owner +
          "' and email like 'archive-media-%@example.com');",
      );
      if (paths.length) await checked(store.remove(paths));
      localSql(
        "delete from auth.users where id='" +
          owner +
          "' and email like 'archive-media-%@example.com';",
      );
    }
  },
  60000,
);
