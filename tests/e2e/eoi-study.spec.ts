import { expect, test } from "@playwright/test";
import { templatePack } from "../../src/modules/library/domain/eoi";
import { completeOnboarding, signUp } from "./helpers";

test("imports a reading, preserves its second question and highlights its own evidence", async ({
  page,
}) => {
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
  await page.getByRole("link", { name: "Abrir mazo guardado" }).click();
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
  await page.getByRole("button", { name: "Corregir el bloque" }).click();
  await expect(page.getByText(/coincide con una variante/)).toBeVisible();
  await expect(page.getByText("I need the blue one.", { exact: true })).toBeVisible();
});
