import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, signUp } from "./helpers";

async function prepare(page: Page) {
  await signUp(page);
  await completeOnboarding(page);
  await page.goto("/es/decks");
  await page.getByLabel("Nombre").fill("Synthetic bounded import");
  await page.getByRole("button", { name: "Crear mazo" }).click();
  await expect(
    page.getByRole("link", { name: "Synthetic bounded import", exact: true }),
  ).toBeVisible();
  await page.goto("/es/import");
}
async function confirm(page: Page) {
  for (const heading of ["Mazo e inversa", "Duplicados", "Confirmar importación"]) {
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
}

test("rejecting a replacement file invalidates the earlier preview", async ({ page }) => {
  await prepare(page);
  await page.getByLabel("Archivo", { exact: true }).setInputFiles({
    name: "synthetic-first.tsv",
    mimeType: "text/plain",
    buffer: Buffer.from("Earlier title\tEarlier meaning\ttag"),
  });
  await page.getByRole("button", { name: "Previsualizar", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("Earlier title");
  await page.getByRole("button", { name: "1. Archivo", exact: true }).click();
  await page.getByLabel("Archivo", { exact: true }).setInputFiles({
    name: "synthetic-invalid.tsv",
    mimeType: "text/plain",
    buffer: Buffer.from([0xc3, 0x28]),
  });
  await page.getByRole("button", { name: "Previsualizar", exact: true }).click();
  await expect(page.getByText("No hemos podido leer el archivo.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuar", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Importar al curso", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Previsualizar", exact: true }).click();
  await expect(page.getByText("Elige un archivo.", { exact: true })).toBeVisible();
});

test("a near-5MB original file stays local while its prepared rows use bounded requests", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/es/concepts");
  await page.getByRole("link", { name: "Volver al inicio", exact: true }).click();
  await page.getByRole("link", { name: "Importar", exact: true }).click();
  const sizes: number[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/import/jobs")
      sizes.push(request.postDataBuffer()?.byteLength ?? 0);
  });
  const content =
    "&lt;script&gt;literal vocabulary&lt;/script&gt;\tMeaning\ttag\t" +
    "x".repeat(5 * 1024 * 1024 - 200);
  await page.getByLabel("Archivo", { exact: true }).setInputFiles({
    name: "synthetic-large.tsv",
    mimeType: "text/plain",
    buffer: Buffer.from(content),
  });
  await page.getByRole("button", { name: "Previsualizar", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("<script>literal vocabulary</script>");
  await confirm(page);
  await page.getByRole("button", { name: "Importar al curso", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Importación terminada", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Creadas: 1", { exact: true })).toBeVisible();
  expect(sizes.length).toBeGreaterThanOrEqual(3);
  expect(Math.max(...sizes)).toBeLessThanOrEqual(256 * 1024);
  await page.getByRole("link", { name: "Volver al inicio", exact: true }).click();
  await page.getByRole("link", { name: "Mis conceptos", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "<script>literal vocabulary</script>", exact: true }),
  ).toBeVisible();
});

test("a lost committed acknowledgement can resume after reload without repeating copies", async ({
  page,
}) => {
  await prepare(page);
  const offsets: number[] = [];
  let loseFirst = true;
  await page.route("**/api/import/jobs", async (route) => {
    const body = route.request().postDataJSON() as { action: string; offset?: number };
    if (body.action !== "append") return route.continue();
    offsets.push(body.offset!);
    if (!loseFirst) return route.continue();
    loseFirst = false;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    expect(await response.json()).toMatchObject({ ok: true, job: { processedRows: 250 } });
    await route.abort("failed");
  });
  const file = {
    name: "synthetic-recovery.tsv",
    mimeType: "text/plain",
    buffer: Buffer.from(
      Array.from(
        { length: 600 },
        (_, index) => `Recovery ${String(index).padStart(4, "0")}\tMeaning ${index}\ttag`,
      ).join("\n"),
    ),
  };
  await page.getByLabel("Archivo", { exact: true }).setInputFiles(file);
  await page.getByRole("button", { name: "Previsualizar", exact: true }).click();
  await page.getByLabel("Columna de etiquetas", { exact: true }).selectOption("none");
  await page.getByRole("button", { name: "Actualizar vista previa", exact: true }).click();
  await expect(page.getByLabel("Columna de etiquetas", { exact: true })).toHaveValue("none");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("radio", { name: "Crear una copia independiente", exact: true }).check();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Importar al curso", exact: true }).click();
  await expect(
    page.getByText("No se ha podido confirmar la respuesta.", { exact: false }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/es\/import\?job=[0-9a-f-]+$/);
  expect(offsets).toEqual([0]);
  await page.reload();
  await expect(page.getByText("250 de 600 filas confirmadas", { exact: true })).toBeVisible();
  await page.getByLabel("Archivo", { exact: true }).setInputFiles(file);
  await page.getByRole("button", { name: "Previsualizar", exact: true }).click();
  await expect(page.getByLabel("Columna de etiquetas", { exact: true })).toHaveValue("none");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Crear una copia independiente", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Comprobar y continuar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Importación terminada", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Creadas: 600", { exact: true })).toBeVisible();
  expect(offsets).toEqual([0, 250, 500]);
  await page.reload();
  await page.getByRole("button", { name: "Importar otro archivo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Archivo", exact: true })).toBeVisible();
  await expect(page).toHaveURL("/es/import");
});

test("a replacement file does not reuse earlier prepared rows after duplicate preview fails", async ({
  page,
}) => {
  await prepare(page);
  const choose = async (front: string) =>
    page.getByLabel("Archivo", { exact: true }).setInputFiles({
      name: `synthetic-${front}.tsv`,
      mimeType: "text/plain",
      buffer: Buffer.from(`${front}\tMeaning\ttag`),
    });
  await choose("Earlier");
  await page.getByRole("button", { name: "Previsualizar", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("Earlier");
  await page.getByRole("button", { name: "1. Archivo", exact: true }).click();
  let fail = true;
  await page.route("**/api/import/jobs", (route) => {
    if (route.request().postDataJSON()?.action === "duplicates" && fail) {
      fail = false;
      return route.abort("failed");
    }
    return route.continue();
  });
  await choose("Replacement");
  await page.getByRole("button", { name: "Previsualizar", exact: true }).click();
  await expect(
    page.getByText("No se ha podido confirmar la respuesta.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuar", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Previsualizar", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("Replacement");
  await expect(page.locator("tbody")).not.toContainText("Earlier");
  await confirm(page);
  await page.getByRole("button", { name: "Importar al curso", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Importación terminada", exact: true }),
  ).toBeVisible();
});

test("mapping follows the replacement file when the earlier column index is out of range", async ({
  page,
}) => {
  await prepare(page);
  await page.getByLabel("Archivo", { exact: true }).setInputFiles({
    name: "synthetic-four.tsv",
    mimeType: "text/plain",
    buffer: Buffer.from("Old\tMeaning\ttag\tOld fourth"),
  });
  await page.getByRole("button", { name: "Previsualizar", exact: true }).click();
  await page.getByLabel("Columna de frente", { exact: true }).selectOption("3");
  await page.getByRole("button", { name: "Actualizar vista previa", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("Old fourth");
  await page.getByRole("button", { name: "1. Archivo", exact: true }).click();
  await page.getByLabel("Archivo", { exact: true }).setInputFiles({
    name: "synthetic-two.tsv",
    mimeType: "text/plain",
    buffer: Buffer.from("Replacement\tNew meaning"),
  });
  await page.getByRole("button", { name: "Previsualizar", exact: true }).click();
  await expect(page.getByLabel("Columna de frente", { exact: true })).toHaveValue("0");
  await expect(page.getByLabel("Columna de reverso", { exact: true })).toHaveValue("1");
  await expect(page.locator("tbody tr").first().locator("td").nth(1)).toHaveText("Replacement");
  await expect(page.locator("tbody tr").first().locator("td").nth(2)).toHaveText("New meaning");
});

test("pause and finish keep keyboard focus while preserving a confirmed batch", async ({
  page,
}) => {
  await prepare(page);
  let confirmCommit: (() => void) | undefined, releaseResponse: (() => void) | undefined;
  const committed = new Promise<void>((resolve) => {
    confirmCommit = resolve;
  });
  const released = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await page.route("**/api/import/jobs", async (route) => {
    if (route.request().postDataJSON()?.action !== "append") return route.continue();
    expect((await route.fetch()).ok()).toBe(true);
    confirmCommit?.();
    await released;
    await route.abort("aborted");
  });
  await page.getByLabel("Archivo", { exact: true }).setInputFiles({
    name: "synthetic-pause.tsv",
    mimeType: "text/plain",
    buffer: Buffer.from(
      Array.from({ length: 600 }, (_, index) => `Pause ${index}\tMeaning\ttag`).join("\n"),
    ),
  });
  await page.getByRole("button", { name: "Previsualizar", exact: true }).click();
  await confirm(page);
  await page.getByRole("button", { name: "Importar al curso", exact: true }).click();
  await committed;
  await page.getByRole("button", { name: "Pausar importación", exact: true }).click();
  releaseResponse?.();
  const heading = page.getByRole("heading", { name: "Estado de la importación", exact: true });
  await expect(heading).toBeFocused();
  await page.getByRole("button", { name: "Finalizar este intento", exact: true }).click();
  await expect(heading).toBeFocused();
  await expect(page.getByText("250 de 600 filas confirmadas", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Importar otro archivo", exact: true }),
  ).toBeVisible();
});

test("import API enforces origin, content type, body budget and authentication", async ({
  request,
  baseURL,
}) => {
  expect(
    (
      await request.post("/api/import/jobs", {
        headers: { Origin: "https://foreign.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/import/jobs", {
        headers: { Origin: baseURL!, "Content-Type": "text/plain" },
        data: "{}",
      })
    ).status(),
  ).toBe(415);
  expect(
    (
      await request.post("/api/import/jobs", {
        headers: { Origin: baseURL! },
        data: { padding: "x".repeat(256 * 1024) },
      })
    ).status(),
  ).toBe(413);
  const unauthenticated = await request.post("/api/import/jobs", {
    headers: { Origin: baseURL! },
    data: { action: "status", jobId: "10000000-0000-4000-8000-000000000001" },
  });
  expect(unauthenticated.status()).toBe(401);
  expect(unauthenticated.headers()["cache-control"]).toContain("no-store");
});
