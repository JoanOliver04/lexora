import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "../../src/shared/infrastructure/supabase/database.types";
import { completeOnboarding, PASSWORD, signUp } from "./helpers";
import { localBackend } from "./local-backend";
import { assertStudyLayout } from "./study-layout";

async function checked<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

async function addContent(
  client: SupabaseClient<Database>,
  owner: string,
  course: string,
  label: string,
) {
  const deck = randomUUID();
  const concept = randomUUID();
  const item = randomUUID();
  await checked(
    client
      .from("decks")
      .insert({ id: deck, owner_id: owner, course_id: course, title: `${label} deck` }),
  );
  await checked(
    client.from("concepts").insert({
      id: concept,
      owner_id: owner,
      course_id: course,
      title: `${label} concept`,
      kind: "vocabulary",
      summary: label,
    }),
  );
  await checked(
    client.from("deck_concepts").insert({ owner_id: owner, deck_id: deck, concept_id: concept }),
  );
  await checked(
    client.from("practice_items").insert({
      id: item,
      owner_id: owner,
      concept_id: concept,
      mode: "basic_recall",
      prompt_text: `${label} question`,
      answer_text: `${label} answer`,
      config: { mode: "basic_recall" },
    }),
  );
  return { deck, concept, item };
}

function courseLink(page: Page, title: string) {
  return page.getByRole("link", { name: `Cambiar de curso. Curso activo ${title}` });
}

async function review(page: Page, deck: string, label: string) {
  await page.goto(`/es/app/study?deck=${deck}`);
  await page.getByRole("button", { name: "Crear sesión" }).click();
  await expect(page.getByText(`${label} question`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Revelar respuesta" }).click();
  await page.getByRole("button", { name: "Bien", exact: true }).click();
  await expect(page.getByTestId("review-save-status")).toContainText("Último repaso guardado");
  return new URL(page.url()).pathname;
}

test("create and switch persistent courses with independent library, reviews, and new-card limits", async ({
  page,
  context,
}, info) => {
  test.setTimeout(90_000);
  const email = await signUp(page);
  await completeOnboarding(page);
  const { url, publishableKey } = localBackend();
  const client = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.user) throw new Error("Expected a synthetic fixture owner");
  const user = data.user;
  const owner = user.id;
  const english = (await checked(
    client.from("courses").select("id,title").eq("owner_id", owner).single(),
  ))!;
  await checked(
    client.from("course_settings").update({ daily_new_limit: 1 }).eq("course_id", english.id),
  );
  const spoken = await addContent(client, owner, english.id, "Original English");
  const englishSession = await review(page, spoken.deck, "Original English");
  const stale = await context.newPage();
  await stale.goto("/es/decks");

  const originalCourseLink = courseLink(page, english.title);
  await expect(originalCourseLink).toBeVisible();
  const name = originalCourseLink.getByText(english.title, { exact: true });
  expect(await name.evaluate((label) => label.scrollWidth - label.clientWidth)).toBeLessThanOrEqual(
    1,
  );
  await originalCourseLink.click();
  await expect(page.getByRole("heading", { name: "Mis cursos" })).toBeVisible();
  await assertStudyLayout(page, info, "course-picker");
  const language = page.getByLabel("Idioma que quieres estudiar");
  for (const locale of ["en-GB", "fr", "de", "it"]) {
    await expect(language.locator(`option[value="${locale}"]`)).toHaveCount(1);
  }
  const frenchTitle = "Francés de viaje";
  await page.getByLabel("Nombre del curso").fill(frenchTitle);
  await language.selectOption("fr");
  await page.getByRole("button", { name: "Crear curso" }).click();
  await expect(page).toHaveURL("/es/app");
  await expect(courseLink(page, frenchTitle)).toBeVisible();
  await page.reload();
  await expect(courseLink(page, frenchTitle)).toBeVisible();
  await expect(page.getByRole("link", { name: "Importar vocabulario", exact: true })).toBeVisible();
  const french = (await checked(
    client.from("courses").select("id,target_locale").eq("title", frenchTitle).single(),
  ))!;
  expect(french.target_locale).toBe("fr");
  expect(await checked(client.from("decks").select("id").eq("course_id", french.id))).toEqual([]);
  await page.goto("/es/import");
  const template = page.getByRole("region", { name: "Plantilla de importación" });
  await expect(template.getByText("le sifflet", { exact: true })).toBeVisible();
  await template.getByLabel("Idioma del reverso").selectOption("target");
  await expect(
    template.locator("dd[lang=fr]").filter({ hasText: "Petit instrument qui produit un son aigu" }),
  ).toBeVisible();
  await template.getByText("Preparar un tema con ChatGPT", { exact: true }).click();
  await template.getByText("Ver el prompt", { exact: true }).click();
  await expect(template.getByRole("textbox", { name: "Ver el prompt" })).toHaveValue(
    /Crea 60 tarjetas de francés[\s\S]*reverso en francés/,
  );
  await stale.getByLabel("Nombre", { exact: true }).fill("Stale English draft");
  await stale.getByRole("button", { name: "Crear mazo", exact: true }).click();
  await expect(stale.getByRole("alert")).toBeVisible();
  expect(
    await checked(client.from("decks").select("id").eq("title", "Stale English draft")),
  ).toEqual([]);
  await stale.close();

  await page.goto("/es/decks");
  await expect(page.getByText("Original English deck", { exact: true })).toHaveCount(0);
  await page.goto("/es/concepts");
  await expect(page.getByText("Original English concept", { exact: true })).toHaveCount(0);
  await page.goto(englishSession);
  await expect(page.getByTestId("study-card")).toHaveCount(0);
  await page.goto("/es/app/statistics");
  await expect(page.getByText(/^Todavía no hay repasos en este periodo/)).toBeVisible();
  await page.goto("/es/app/settings");
  const limit = page.getByLabel("Tarjetas nuevas al día", { exact: true });
  await expect(limit).toHaveValue("5");
  await checked(
    client.from("course_settings").update({ daily_new_limit: 1 }).eq("course_id", french.id),
  );

  const travel = await addContent(client, owner, french.id, "Synthetic French");
  await review(page, travel.deck, "Synthetic French");
  await page.goto("/es/app/settings");
  await limit.fill("2");
  await page.getByRole("button", { name: "Guardar preferencias" }).click();
  await expect(page.getByText("Preferencias guardadas.", { exact: true })).toBeVisible();
  await page.goto("/es/app/history");
  await expect(page.getByRole("link", { name: "Synthetic French concept" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Original English concept" })).toHaveCount(0);
  await courseLink(page, frenchTitle).click();
  const courseSelector = page.getByLabel("Curso activo", { exact: true });
  await expect(courseSelector.locator("option:checked")).toHaveText(`${frenchTitle} · francés`);
  await courseSelector.selectOption(english.id);
  await page.getByRole("button", { name: "Cambiar de curso", exact: true }).click();
  await expect(page).toHaveURL("/es/app");
  await page.reload();
  await expect(courseLink(page, english.title)).toBeVisible();
  await page.goto("/es/app/settings");
  await expect(limit).toHaveValue("1");
  await page.goto("/es/app/history");
  await expect(page.getByRole("link", { name: "Original English concept" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Synthetic French concept" })).toHaveCount(0);
  expect(
    await checked(client.from("review_logs").select("practice_item_id").eq("owner_id", owner)),
  ).toEqual(
    expect.arrayContaining([{ practice_item_id: spoken.item }, { practice_item_id: travel.item }]),
  );
  expect(
    await checked(
      client.from("course_settings").select("daily_new_limit").eq("course_id", french.id).single(),
    ),
  ).toEqual({ daily_new_limit: 2 });
  await client.auth.signOut();
});
