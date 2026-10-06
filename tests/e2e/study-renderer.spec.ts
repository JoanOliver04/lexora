import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import type { Database } from "../../src/shared/infrastructure/supabase/database.types";
import { completeOnboarding, PASSWORD, signUp } from "./helpers";

async function checked<T>(
  query: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

test("V1 session fronts and shared cloze preview are literal, private and read-only", async ({
  page,
}, testInfo) => {
  const email = await signUp(page);
  await completeOnboarding(page);
  if (!process.env["NEXT_PUBLIC_SUPABASE_URL"]) process.loadEnvFile(".env.local");
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]!;
  const parsed = new URL(url);
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || parsed.port !== "54321")
    throw new Error("Study renderer fixtures require local Supabase");
  const client = createClient<Database>(url, process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: auth, error: authError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (authError || !auth.user) throw new Error("Synthetic fixture could not sign in");
  const ownerId = auth.user.id;
  const course = await checked(
    client.from("courses").select("id").eq("owner_id", ownerId).single(),
  );
  const courseId = course!.id;
  const deckId = randomUUID();
  const conceptId = randomUUID();
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const reservedId = randomUUID();
  const prompts = [
    '<img src=x onerror="window.studyInjected=true">',
    `Recupera esta expresión: ${"a".repeat(600)}`,
    "We ___ and [gap].",
  ];
  const modes = ["basic_recognition", "basic_recall", "cloze"] as const;
  const hint = "<script>window.studyInjected=true</script>";
  const secret = "ANSWER_SENTINEL_never_on_session_front";
  try {
    await checked(
      client.from("decks").insert({
        id: deckId,
        owner_id: ownerId,
        course_id: courseId,
        title: "Synthetic renderer deck",
      }),
    );
    await checked(
      client.from("concepts").insert({
        id: conceptId,
        owner_id: ownerId,
        course_id: courseId,
        kind: "vocabulary",
        title: "Synthetic renderer concept",
        summary: "Original fixture",
        example: "EXAMPLE_SENTINEL_<script>example()</script>",
        explanation: "EXPLANATION_SENTINEL_<b>note</b>",
      }),
    );
    await checked(
      client
        .from("deck_concepts")
        .insert({ owner_id: ownerId, deck_id: deckId, concept_id: conceptId }),
    );
    await checked(
      client.from("practice_items").insert([
        ...modes.map((mode, index) => ({
          id: ids[index]!,
          owner_id: ownerId,
          concept_id: conceptId,
          mode,
          prompt_text: prompts[index]!,
          answer_text: secret,
          hint_text: hint,
          enabled: index === 0,
          config:
            mode === "cloze"
              ? { mode, answers: ["SOLUTION_SENTINEL_one", "<b>SOLUTION_SENTINEL_two</b>"] }
              : { mode },
        })),
        {
          id: reservedId,
          owner_id: ownerId,
          concept_id: conceptId,
          mode: "listening_dictation" as const,
          prompt_text: "RESERVED_PROMPT_SENTINEL",
          answer_text: secret,
          hint_text: null,
          enabled: true,
          config: { mode: "listening_dictation" },
        },
      ]),
    );
    await page.goto(`/es/app/study?deck=${deckId}`);
    await page.getByRole("button", { name: "Crear sesión" }).click();
    await expect(page).toHaveURL(/\/es\/app\/study\/[0-9a-f-]+$/);
    const sessionId = page.url().split("/").at(-1)!;
    for (const [index, mode] of modes.entries()) {
      if (index > 0) {
        await checked(
          client
            .from("practice_items")
            .update({ enabled: false })
            .eq("owner_id", ownerId)
            .in("id", ids),
        );
        await checked(
          client
            .from("practice_items")
            .update({ enabled: true })
            .eq("owner_id", ownerId)
            .eq("id", ids[index]!),
        );
      }
      const locale = index === 0 ? "es" : "en";
      const response = await page.goto(`/${locale}/app/study/${sessionId}`);
      expect(response?.status()).toBe(200);
      const card = page.getByTestId("study-card");
      await expect(
        page.getByRole("link", {
          name: locale === "es" ? "Preparar otra sesión" : "Prepare another session",
          exact: true,
        }),
      ).toBeVisible();
      await expect(card.getByText(prompts[index]!, { exact: true })).toBeVisible();
      await expect(
        card.getByText(`${locale === "es" ? "Pista" : "Hint"}: ${hint}`, { exact: true }),
      ).toBeVisible();
      const labels = {
        basic_recognition: "Reconocimiento básico",
        basic_recall: "Basic recall",
        cloze: "Fill in the blanks",
      };
      await expect(card.getByText(labels[mode], { exact: true })).toBeVisible();
      await expect(page.getByTestId("session-available")).toContainText("1");
      expect(await page.content()).not.toContain(secret);
      expect(await page.content()).not.toContain("SOLUTION_SENTINEL");
      expect(await page.content()).not.toContain("RESERVED_PROMPT_SENTINEL");
      await expect(card.locator("script, img, a, audio, iframe, details")).toHaveCount(0);
      expect(await page.evaluate(() => "studyInjected" in window)).toBe(false);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
      if (index === 0)
        await page.screenshot({
          path: testInfo.outputPath("study-recognition-es.png"),
          fullPage: true,
          animations: "disabled",
        });
      const ratingLabels =
        locale === "es"
          ? ["Otra vez", "Difícil", "Bien", "Fácil"]
          : ["Again", "Hard", "Good", "Easy"];
      for (const label of ratingLabels)
        await expect(card.getByRole("button", { name: label, exact: true })).toBeDisabled();
      expect(await page.content()).not.toContain("EXAMPLE_SENTINEL");
      expect(await page.content()).not.toContain("EXPLANATION_SENTINEL");
      const reveal = card.getByRole("button", {
        name: locale === "es" ? "Revelar respuesta" : "Reveal answer",
      });
      await reveal.focus();
      await page.keyboard.press("Enter");
      await expect(
        card.getByRole("heading", { name: locale === "es" ? "Respuesta" : "Answer", exact: true }),
      ).toBeFocused();
      await expect(card.getByText(secret, { exact: true })).toBeVisible();
      await expect(card.getByTestId("interval-good")).toHaveText(
        locale === "es" ? "≈ 10 minutos" : "≈ 10 minutes",
      );
      const intervals = card.getByRole("checkbox", {
        name: locale === "es" ? "Mostrar intervalos aproximados" : "Show approximate intervals",
      });
      await expect(intervals).toBeChecked();
      await intervals.uncheck();
      await expect(card.getByTestId("interval-good")).toHaveCount(0);
      await expect(
        card.getByRole("button", { name: locale === "es" ? "Bien" : "Good", exact: true }),
      ).toBeEnabled();
      await intervals.check();
      await expect(card.getByTestId("interval-good")).toBeVisible();
      await expect(
        page.getByRole("link", {
          name: locale === "es" ? "Preparar otra sesión" : "Prepare another session",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        card.getByText("EXAMPLE_SENTINEL_<script>example()</script>", { exact: true }),
      ).toBeVisible();
      await expect(
        card.getByText("EXPLANATION_SENTINEL_<b>note</b>", { exact: true }),
      ).toBeVisible();
      await expect(card.locator("script, img, b")).toHaveCount(0);
      if (mode === "cloze")
        await expect(card.getByRole("listitem")).toHaveText([
          "SOLUTION_SENTINEL_one",
          "<b>SOLUTION_SENTINEL_two</b>",
        ]);
      for (const label of ratingLabels) {
        await card.getByRole("button", { name: label, exact: true }).click();
        await expect(card.getByRole("button", { name: label, exact: true })).toHaveAttribute(
          "aria-pressed",
          "true",
        );
        await expect(card.getByRole("status")).toContainText(
          locale === "es" ? "No guardada" : "Not saved",
        );
      }
      await expect(
        page.getByRole("link", {
          name: locale === "es" ? "Preparar otra sesión" : "Prepare another session",
          exact: true,
        }),
      ).toBeVisible();
      if (mode === "cloze")
        await page.screenshot({
          path: testInfo.outputPath("study-revealed-en.png"),
          fullPage: true,
          animations: "disabled",
        });
      await page.reload();
      await expect(
        page
          .getByTestId("study-card")
          .getByRole("button", { name: locale === "es" ? "Revelar respuesta" : "Reveal answer" }),
      ).toBeVisible();
      await expect(page.getByTestId("study-card").getByRole("status")).toHaveCount(0);
      expect(await page.content()).not.toContain(secret);
    }
    await page.evaluate(() => {
      document.documentElement.dataset["theme"] = "dark";
      document.documentElement.style.fontSize = "200%";
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("study-cloze-en-dark-zoom.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.goto(`/en/concepts/${conceptId}/items/${ids[2]}`);
    const preview = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "How it will look when studying" }) });
    await expect(preview.getByText(prompts[2]!, { exact: true })).toBeVisible();
    await expect(preview.getByText(secret, { exact: true })).not.toBeVisible();
    const reveal = preview.locator("summary");
    await reveal.focus();
    await page.keyboard.press("Enter");
    await expect(preview.getByText(secret, { exact: true })).toBeVisible();
    await expect(preview.getByRole("listitem")).toHaveText([
      "SOLUTION_SENTINEL_one",
      "<b>SOLUTION_SENTINEL_two</b>",
    ]);
    await expect(preview.locator("script, img, b")).toHaveCount(0);
    await page.goto(`/en/app/study/${sessionId}`);
    await checked(
      client
        .from("practice_items")
        .update({ enabled: false })
        .eq("owner_id", ownerId)
        .in("id", ids),
    );
    await page.getByRole("button", { name: "Reveal answer" }).click();
    await expect(page.getByTestId("study-card").getByRole("alert")).toContainText(
      "The pending items have changed",
    );
    await expect(page.getByRole("button", { name: "Good", exact: true })).toBeDisabled();
    expect(await page.content()).not.toContain(secret);
    await page.getByRole("button", { name: "Reload session" }).click();
    await expect(page.getByTestId("study-card")).toHaveCount(0);
    await expect(page.getByTestId("session-available")).toHaveText("0 items available now");
    expect(
      await checked(
        client
          .from("study_sessions")
          .select("status, reviews_count, new_count")
          .eq("id", sessionId)
          .single(),
      ),
    ).toEqual({ status: "active", reviews_count: 0, new_count: 0 });
    expect(
      await checked(client.from("learning_states").select("id").eq("owner_id", ownerId)),
    ).toEqual([]);
    expect(await checked(client.from("review_logs").select("id").eq("owner_id", ownerId))).toEqual(
      [],
    );
  } finally {
    await checked(client.from("courses").delete().eq("owner_id", ownerId).eq("id", courseId));
    await client.auth.signOut();
  }
});
