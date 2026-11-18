import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

import { auditAxe } from "./a11y-audit";
import { completeOnboarding, signUp } from "./helpers";
import { assertStudyLayout } from "./study-layout";

test("descargar la plantilla, personalizar el prompt e importar gramática pegada", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (value: string) => {
          document.documentElement.dataset["testCopiedPrompt"] = value;
        },
      },
    });
  });
  await signUp(page);
  await completeOnboarding(page);
  await page.goto("/es/decks");
  await page.getByLabel("Nombre").fill("Gramática");
  await page.getByRole("button", { name: "Crear mazo" }).click();
  await expect(page.getByRole("link", { name: "Gramática", exact: true })).toBeVisible();
  await page.goto("/es/import");

  const template = page.getByRole("region", { name: "Plantilla de importación" });
  await expect(template.getByText("referee", { exact: true })).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await template.getByRole("link", { name: "Descargar ejemplo CSV" }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("lexora-vocabulary.csv");
  expect(await readFile(await download.path(), "utf8")).toContain(
    '#separator:comma\n"referee","Árbitro',
  );

  await template.getByLabel("Tipo de tarjetas").selectOption("grammar");
  await template.getByLabel("Idioma del reverso").selectOption("en");
  await expect(
    template.getByText("I have finished my homework. Use have + past participle.", {
      exact: true,
    }),
  ).toBeVisible();
  await template.getByText("Preparar un tema con ChatGPT", { exact: true }).click();
  await template.getByLabel("Tema", { exact: true }).fill("Past perfect");
  await template.getByLabel("Nivel de inglés").selectOption("C1");
  await template.getByLabel("Cantidad de tarjetas").selectOption("100");
  await template.getByLabel("Enfoque (opcional)").fill("Con ejemplos de viajes");
  await template.getByRole("button", { name: "Copiar prompt" }).click();
  await expect(template.getByRole("status")).toContainText("Prompt copiado");
  const copied = await page.locator("html").getAttribute("data-test-copied-prompt");
  expect(copied).toContain('Crea 100 tarjetas de inglés de nivel C1 sobre el tema "Past perfect"');
  expect(copied).toContain("Con ejemplos de viajes");
  expect(copied).toContain("en Inglés");
  expect(copied).toContain("#separator:comma");
  await template.getByText("Ver el prompt", { exact: true }).click();
  await expect(template.getByRole("textbox", { name: "Ver el prompt" })).toHaveValue(copied!);
  await template.getByText("Ver el CSV", { exact: true }).click();
  await template.getByRole("link", { name: "Ir a subir o pegar" }).click();
  await expect(page.locator("#import-source")).toBeFocused();
  await page.getByRole("radio", { name: "Pegar contenido" }).check();
  const pasted = page.getByRole("textbox", { name: "Contenido del CSV o TSV" });
  await expect(pasted).toBeVisible();
  await assertStudyLayout(page, info, "import-preparation");

  const submit = page.getByRole("button", { name: "Previsualizar", exact: true });
  await submit.click();
  await expect(page.getByText("El contenido está vacío.", { exact: true })).toBeVisible();
  await expect(pasted).toBeFocused();
  await pasted.fill(
    [
      "```csv",
      "#separator:comma",
      '"Complete: The train ___ (leave) before we arrived.","The train had left. Use had + past participle.","grammar::past-perfect rail"',
      '"Choose the earlier event: The gates had closed when we arrived.","The gates closed first.","grammar::past-perfect"',
      "```",
    ].join("\n"),
  );
  await submit.click();
  await expect(page.getByText("2 nuevas · sin duplicados")).toBeVisible();
  await expect(page.locator("tbody tr").first()).toContainText("The train had left.");
  await expect(page.locator("tbody tr").first()).toContainText("grammar::past-perfect");
  for (const name of ["Mazo e inversa", "Duplicados", "Confirmar importación"]) {
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible();
  }
  await expect(page.getByText("Mazo: Gramática")).toBeVisible();
  await page.getByRole("button", { name: "Importar al curso" }).click();
  await expect(page.getByRole("heading", { name: "Importación terminada" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Creadas: 2")).toBeVisible();
  await page.goto("/es/concepts");
  await expect(
    page.getByRole("link", { name: "Complete: The train ___ (leave) before we arrived." }),
  ).toBeVisible();
});

test("English import helper offers a selectable prompt when the clipboard is blocked", async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("Clipboard blocked");
        },
      },
    });
  });
  await signUp(page);
  await completeOnboarding(page, { uiLocale: "en" });
  await page.goto("/en/import");

  const template = page.getByRole("region", { name: "Import template" });
  await template.getByLabel("Card type").selectOption("phrases");
  await expect(template.getByText("Can I try this on?", { exact: true })).toBeVisible();
  await template.getByText("Prepare a topic with ChatGPT", { exact: true }).click();
  await template.getByRole("button", { name: "Copy prompt" }).click();
  const prompt = template.getByRole("textbox", { name: "View the prompt" });
  await expect(prompt).toBeFocused();
  await expect(prompt).toHaveValue(/Create 60 level B1 English flashcards about "Shopping"/);
  await expect(template.getByRole("status")).toContainText("could not be copied automatically");
  await expect(template.getByRole("link", { name: "Open ChatGPT" })).toHaveAttribute(
    "href",
    "https://chatgpt.com/",
  );
  await auditAxe(page, info, "import-preparation");
});
