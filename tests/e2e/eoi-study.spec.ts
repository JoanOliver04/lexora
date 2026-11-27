import { expect, test } from "@playwright/test";
import { templatePack } from "../../src/modules/library/domain/eoi";
import { completeOnboarding, signUp } from "./helpers";

test("imports a reading, preserves its second question and highlights its own evidence", async ({
  page,
}) => {
  test.setTimeout(60000);
  await signUp(page);
  await completeOnboarding(page);
  const pack = templatePack("reading");
  const c = pack.cards[0]!;
  pack.cards.push({
    ...c,
    key: "q2",
    prompt: "When is the last service?",
    answer: "Nine",
    alternatives: ["9"],
    evidence: "The last service is at nine.",
  });
  await page.goto("/es/import");
  await page.getByRole("link", { name: "Mazos de destrezas B1" }).click();
  await page.getByLabel(/Abrir mazo/).setInputFiles({
    name: "reading.lexora.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(pack)),
  });
  await page.getByRole("button", { name: "Revisar importación" }).click();
  await expect(page.getByText(/Nuevas: 2/)).toBeVisible();
  await page.getByRole("button", { name: "Guardar y vincular coincidencias" }).click();
  const saved = page.getByRole("link", { name: "Abrir mazo guardado" });
  await saved.click();
  await expect(page).toHaveURL(/\/decks\/[a-f0-9-]{36}$/);
  const id = new URL(page.url()).pathname.split("/").pop()!;
  await page.getByRole("link", { name: "Editar, exportar o practicar el mazo B1" }).click();
  await page.getByRole("combobox", { name: "Tarjeta", exact: true }).selectOption("1");
  const preview = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Vista previa de la tarjeta" }) });
  await preview.getByRole("textbox").fill("9");
  await expect(preview.locator("mark")).toHaveCount(0);
  await page.getByRole("button", { name: "Mostrar u ocultar el modelo" }).click();
  await expect(preview.locator("mark")).toHaveText("The last service is at nine.");
  await expect(preview.getByText(/coincide con una variante/)).toBeVisible();
  await page.getByRole("button", { name: "Revisar importación" }).click();
  await expect(page.getByText(/Nuevas: 0.*Actualizadas: 2/)).toBeVisible();
  for (const [path, start] of [
    ["/es/app/study/free", "Empezar estudio libre"],
    ["/es/app/study", "Crear sesión"],
  ]) {
    await page.goto(path + "?deck=" + id);
    await page.getByRole("button", { name: start! }).click();
    await expect(
      page.getByText("Bus seven stops at the theatre. The last service is at nine.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("textbox", { name: "Tu respuesta", exact: true }).fill("9");
    await expect(page.locator("mark")).toHaveCount(0);
    await page.getByRole("button", { name: "Revelar respuesta", exact: true }).click();
    await expect(page.locator("mark")).toHaveCount(1);
  }
});

test("imports private audio and corrects a listening block after the attempt", async ({ page }) => {
  test.setTimeout(60000);
  await signUp(page);
  await completeOnboarding(page);
  await page.goto("/es/import/eoi");
  await page.getByLabel("Plantilla de destreza").selectOption("listening");
  await page.getByText("Textos y audios compartidos", { exact: true }).click();
  const wav = Buffer.alloc(1644);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  await page
    .getByLabel(/Audio modelo/i)
    .setInputFiles({ name: "model.wav", mimeType: "audio/wav", buffer: wav });
  await expect(page.getByText("Audio modelo model.wav")).toBeVisible();
  await page.getByRole("button", { name: "Escuchar modelo" }).click();
  const modelPlayer = page.locator("audio").first();
  const originalSrc = await modelPlayer.getAttribute("src");
  expect(originalSrc).toMatch(/^blob:/);
  const replacement = Buffer.from(wav);
  replacement.writeInt16LE(93, 100);
  await page
    .getByLabel(/Audio modelo/)
    .setInputFiles({ name: "changed.wav", mimeType: "audio/wav", buffer: replacement });
  await expect(page.getByText("Audio modelo changed.wav")).toBeVisible();
  await page.getByRole("button", { name: "Escuchar modelo" }).click();
  await expect(modelPlayer).not.toHaveAttribute("src", originalSrc!);
  const modelFile = page.getByRole("link", { name: /Descargar copia del audio/ });
  const downloaded = page.waitForEvent("download");
  await modelFile.click();
  const stream = await (await downloaded).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks)).toEqual(replacement);
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await page.getByText("Textos y audios compartidos", { exact: true }).click();
  await expect(modelFile).toHaveAttribute("href", /^blob:/);
  await page.getByRole("button", { name: "Revisar importación" }).click();
  await page.getByRole("button", { name: "Guardar y vincular coincidencias" }).click();
  await page.getByRole("link", { name: "Abrir mazo guardado" }).click();
  await page.getByRole("link", { name: "Simulacro de escucha" }).click();
  const listen = page.getByRole("button", { name: "Escuchar modelo" });
  for (let n = 1; n <= 2; n++) {
    await listen.click();
    await expect(page.getByText(`Escuchas: ${n} de 2`)).toBeVisible();
  }
  await expect(listen).toBeDisabled();
  await expect(page.getByText("I need the blue one.", { exact: true })).toHaveCount(0);
  await page.getByRole("textbox").fill("blue");
  await page.reload();
  await expect(page.getByText("Escuchas: 2 de 2")).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveValue("blue");
  await page.getByRole("button", { name: "Corregir el bloque" }).click();
  await expect(page.getByText(/coincide con una variante/)).toBeVisible();
  await expect(page.getByText("I need the blue one.", { exact: true })).toBeVisible();
});

test("keeps drafts, allocates fresh question keys and rejects an edit from an old tab", async ({
  page,
  context,
}) => {
  await signUp(page);
  await completeOnboarding(page);
  await page.goto("/es/import/eoi");
  await page.getByLabel("Plantilla de destreza").selectOption("grammar");
  const prompt = page.getByLabel("Pregunta o situación");
  await prompt.fill("First synthetic prompt");
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(prompt).toHaveValue("First synthetic prompt");
  await page.getByRole("button", { name: "Añadir tarjeta", exact: true }).click();
  const oldKey = await page.getByLabel("Identificador estable de la tarjeta").inputValue();
  await page.getByRole("button", { name: "Revisar importación" }).click();
  await expect(page.locator("#eoi-error")).toContainText("tarjeta 2");
  await expect(prompt).toBeFocused();
  await page.getByRole("button", { name: "Quitar tarjeta del mazo" }).click();
  await page.getByRole("button", { name: "Añadir tarjeta", exact: true }).click();
  expect(await page.getByLabel("Identificador estable de la tarjeta").inputValue()).not.toBe(
    oldKey,
  );
  await prompt.fill("Second synthetic prompt");
  await page.getByLabel("Respuesta modelo").fill("answer");
  await page.getByRole("button", { name: "Revisar importación" }).click();
  await page.getByRole("button", { name: "Guardar y vincular coincidencias" }).click();
  const href = await page.getByRole("link", { name: "Abrir mazo guardado" }).getAttribute("href");
  const url = "/es/import/eoi?deck=" + href!.split("/").pop();
  await page.goto(url);
  const other = await context.newPage();
  await other.goto(url);
  await prompt.fill("First tab correction");
  await page.getByRole("button", { name: "Revisar importación" }).click();
  await page.getByRole("button", { name: "Guardar y vincular coincidencias" }).click();
  await expect(page.getByRole("link", { name: "Abrir mazo guardado" })).toBeVisible();
  await other.getByLabel("Título", { exact: true }).first().fill("Changed title");
  await other.getByRole("button", { name: "Revisar importación" }).click();
  await expect(other.locator("#eoi-error")).toContainText("Otra edición");
  await page.reload();
  await expect(prompt).toHaveValue("First tab correction");
});
test("requires an explicit direction for a CSV opened from the EOI menu", async ({ page }) => {
  await signUp(page);
  await completeOnboarding(page);
  await page.goto("/es/import/eoi");
  await page.getByLabel(/Abrir mazo/).setInputFiles({
    name: "past.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("front,back,tags\nShe ___ (go) yesterday.,went,grammar::past\n"),
  });
  await expect(page.getByRole("button", { name: "Revisar importación" })).toBeDisabled();
  await page.getByRole("button", { name: /Grammar ·/ }).click();
  await expect(page.getByLabel("Plantilla de destreza")).toHaveValue("grammar");
  await expect(page.getByText("Tarjeta inversa")).toHaveCount(0);
});
