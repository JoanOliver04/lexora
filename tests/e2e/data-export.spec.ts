import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import Papa from "papaparse";
import { expect, test, type Download } from "@playwright/test";
import type { Database } from "../../src/shared/infrastructure/supabase/database.types";
import { signUp, completeOnboarding, PASSWORD } from "./helpers";
import { assertStudyLayout } from "./study-layout";

async function checked<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}
for (const locale of ["es", "en"] as const)
  test(`verified ${locale === "es" ? "large JSON" : "safe CSV"} download, corruption refusal and cooldown (${locale})`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    const email = await signUp(page);
    await completeOnboarding(page, { uiLocale: locale });
    if (!process.env["NEXT_PUBLIC_SUPABASE_URL"]) process.loadEnvFile(".env.local");
    const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
      parsed = new URL(url);
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || parsed.port !== "54321")
      throw new Error("Local synthetic export only");
    const client = createClient<Database>(
      url,
      process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );
    const { data: auth, error: authError } = await client.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });
    if (authError) throw authError;
    const owner = auth.user.id,
      concept = randomUUID();
    const course = await checked(client.from("courses").select("id").single());
    const original = ' \u200f=HYPERLINK("https://example.invalid","Original")';
    const literal = 'Original, "quoted"\nnew line\r\nمرحبا 😀';
    try {
      await checked(
        client.from("concepts").insert({
          id: concept,
          owner_id: owner,
          course_id: course!.id,
          kind: "vocabulary",
          title: original,
          summary: literal,
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
          input: `update public.concepts set metadata = jsonb_build_object('padding', repeat('x', ${locale === "es" ? "5*1024*1024" : "0"})) || '{"__proto__":{"kept":true},"integer":9007199254740993,"decimal":0.12345678901234567890123456789}'::jsonb where id='${concept}' and owner_id='${owner}';`,
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 10000,
        },
      );
      await page.goto(`/${locale}/app/settings`);
      const section = page.getByRole("region", {
        name: locale === "es" ? "Tus datos, contigo" : "Keep your data with you",
      });
      const button = section.getByRole("button", {
        name: locale === "es" ? "Descargar JSON" : "Download CSV",
        exact: true,
      });
      const downloads: Download[] = [];
      page.on("download", (download) => downloads.push(download));
      await page.route("**/api/account/export", (route) =>
        route.fulfill({
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Lexora-Bytes": "500",
            "X-Lexora-SHA256": "0".repeat(64),
          },
          body: "partial",
        }),
      );
      await button.click();
      await expect(section.getByRole("alert")).toContainText(
        locale === "es" ? "integridad" : "integrity",
      );
      expect(downloads).toHaveLength(0);
      await page.unroute("**/api/account/export");
      const downloading = page.waitForEvent("download");
      await button.click();
      const download = await downloading;
      expect(download.suggestedFilename()).toBe(
        locale === "es" ? "lexora-export.json" : "lexora-export.csv",
      );
      const path = await download.path();
      if (!path) throw new Error("Verified file missing");
      const bytes = await readFile(path);
      if (locale === "en") await download.saveAs(info.outputPath("account-export.csv"));
      if (locale === "es") {
        expect(bytes.byteLength).toBeGreaterThan(4.5 * 1024 * 1024);
        const text = bytes.toString("utf8");
        const file = JSON.parse(text);
        expect(file.schemaVersion).toBe(1);
        expect(file.payload.profiles[0].id).toBe(owner);
        expect(file.payload.concepts[0]).toMatchObject({ title: original, summary: literal });
        expect(file.payload.concepts[0].metadata.padding.length).toBe(5 * 1024 * 1024);
        const rawPayload = text.slice(text.indexOf(',"payload":') + ',"payload":'.length, -1);
        expect(createHash("sha256").update(rawPayload).digest("hex")).toBe(file.payloadSha256);
        expect(text).toContain('"integer":9007199254740993');
        expect(text).toContain('"decimal":0.12345678901234567890123456789');
        expect(Object.hasOwn(file.payload.concepts[0].metadata, "__proto__")).toBe(true);
      } else {
        const file = Papa.parse<Record<string, string>>(bytes.toString("utf8"), {
          header: true,
          skipEmptyLines: true,
        });
        expect(file.errors).toEqual([]);
        const row = file.data.find((row) => row["id"] === concept)!;
        expect(row["title"]).toBe("'" + original);
        expect(row["summary"]).toBe(literal);
        expect(JSON.parse(row["raw_json"]!).title).toBe(original);
        expect(row["raw_json"]).toContain('"integer":9007199254740993');
        expect(row["raw_json"]).toContain('"decimal":0.12345678901234567890123456789');
        expect(Object.hasOwn(JSON.parse(row["raw_json"]!).metadata, "__proto__")).toBe(true);
      }
      await expect(section.getByRole("status")).toContainText(
        locale === "es" ? "Descarga preparada" : "Download prepared",
      );
      await button.click();
      await expect(section.getByRole("alert")).toContainText(
        locale === "es" ? "un minuto" : "one minute",
      );
      expect(downloads).toHaveLength(1);
      await assertStudyLayout(page, info, `data-export-${locale}`);
    } finally {
      await checked(client.from("courses").delete().eq("id", course!.id));
      await client.auth.signOut();
    }
  });
