import { expect, test } from "@playwright/test";
import { completeOnboarding, signUp } from "./helpers";

test.setTimeout(60_000);

test.beforeEach(async ({ page }) => {
  await signUp(page);
  await completeOnboarding(page);
});

test("a pending submission protects the draft until the validation response arrives", async ({
  page,
}) => {
  await page.goto("/es/decks");
  const description = page.getByLabel("Descripción (opcional)", { exact: true });
  await description.fill("Draft awaiting validation");
  let release = () => {};
  let entered = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  await page.route("**/es/decks", async (route) => {
    if (route.request().method() !== "POST" || !route.request().headers()["next-action"])
      return route.continue();
    entered();
    await held;
    await route.continue();
  });
  try {
    await page.getByRole("button", { name: "Crear mazo", exact: true }).click();
    await started;
    await expect(description).toBeDisabled();
    await expect(page.getByLabel("Nombre", { exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Creando…", exact: true })).toBeDisabled();
    release();
    await expect(page.locator("#create-deck-error")).toBeVisible();
    await expect(description).toBeEnabled();
    await expect(description).toHaveValue("Draft awaiting validation");
    await expect(page.getByLabel("Nombre", { exact: true })).toBeFocused();
  } finally {
    release();
  }
});

test("deck creation and editing retain text and choices after repeated validation errors", async ({
  page,
}) => {
  await page.goto("/es/decks");
  const description = page.getByLabel("Descripción (opcional)", { exact: true });
  const level = page.getByLabel("Nivel (opcional)", { exact: true });
  const category = page.getByLabel("Categoría (opcional)", { exact: true });
  await description.fill("Keep this draft — café");
  await level.selectOption("B1");
  await category.selectOption("vocabulary");
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole("button", { name: "Crear mazo", exact: true }).click();
    await expect(page.locator("#create-deck-error")).toBeVisible();
    await expect(description).toHaveValue("Keep this draft — café");
    await expect(level).toHaveValue("B1");
    await expect(category).toHaveValue("vocabulary");
    await expect(page.getByLabel("Nombre", { exact: true })).toBeFocused();
  }
  await page.getByLabel("Nombre", { exact: true }).fill("Recovered deck");
  await page.getByRole("button", { name: "Crear mazo", exact: true }).click();
  await page.getByRole("link", { name: "Recovered deck", exact: true }).click();
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("Recovered deck");
  await page.getByLabel("Nombre", { exact: true }).fill("");
  await description.fill("Edited draft");
  await level.selectOption("B2");
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.locator("#edit-deck-error")).toBeVisible();
  await expect(description).toHaveValue("Edited draft");
  await expect(level).toHaveValue("B2");
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("");
  await page.getByLabel("Nombre", { exact: true }).fill("Recovered edited deck");
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await page.getByRole("link", { name: "Recovered edited deck", exact: true }).click();
  await expect(description).toHaveValue("Edited draft");
  await expect(level).toHaveValue("B2");
});

test("concept, practice item and tag drafts survive failed submissions", async ({ page }) => {
  await page.goto("/es/concepts");
  await page.getByLabel("Título", { exact: true }).fill("Recovered concept");
  await page.getByLabel("Resumen", { exact: true }).fill("Original summary");
  await page.getByRole("button", { name: "Crear concepto", exact: true }).click();
  await page.getByRole("link", { name: "Recovered concept", exact: true }).click();
  await expect(page.getByLabel("Título", { exact: true })).toHaveValue("Recovered concept");
  await page.getByLabel("Título", { exact: true }).fill("");
  await page.getByLabel("Resumen", { exact: true }).fill("Edited concept draft");
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.locator("#edit-concept-error")).toBeVisible();
  await expect(page.getByLabel("Resumen", { exact: true })).toHaveValue("Edited concept draft");
  await page.getByLabel("Título", { exact: true }).fill("Recovered concept");
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await page.getByRole("link", { name: "Recovered concept", exact: true }).click();
  await expect(page.getByLabel("Título", { exact: true })).toHaveValue("Recovered concept");

  const mode = page.getByLabel("Modo", { exact: true });
  const prompt = page.getByLabel("Enunciado", { exact: true });
  const answer = page.getByLabel("Respuesta", { exact: true });
  const hint = page.getByLabel("Pista (opcional)", { exact: true });
  const solutions = page.getByLabel("Soluciones del hueco (una por línea)", { exact: true });
  await mode.selectOption("cloze");
  await prompt.fill("Please ___ this draft.");
  await answer.fill("keep");
  await hint.fill("A useful hint");
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole("button", { name: "Crear ítem", exact: true }).click();
    await expect(page.locator("#create-practice-item-error")).toBeVisible();
    await expect(mode).toHaveValue("cloze");
    await expect(prompt).toHaveValue("Please ___ this draft.");
    await expect(answer).toHaveValue("keep");
    await expect(hint).toHaveValue("A useful hint");
  }
  await solutions.fill("keep");
  await page.getByRole("button", { name: "Crear ítem", exact: true }).click();
  await page.getByRole("link", { name: "Editar", exact: true }).click();
  await expect(prompt).toHaveValue("Please ___ this draft.");
  await prompt.fill("");
  await hint.fill("Edited item draft");
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.locator("#edit-practice-item-error")).toBeVisible();
  await expect(prompt).toHaveValue("");
  await expect(hint).toHaveValue("Edited item draft");
  await expect(solutions).toHaveValue("keep");
  await prompt.fill("Please ___ this draft.");
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();

  const tag = page.locator("#tag-name");
  await tag.fill("   ");
  await page.locator("form", { has: tag }).getByRole("button").click();
  await expect(page.locator("#add-tag-error")).toBeVisible();
  await expect(tag).toHaveValue("   ");
  await tag.fill("recovered");
  await page.locator("form", { has: tag }).getByRole("button").click();
  await expect(page.getByText("recovered", { exact: true })).toBeVisible();
});
