import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { completeOnboarding, signUp } from "./helpers";
import { checked, localLibraryFixture } from "./local-library-fixture";

function syntheticWav(period: number) {
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
  for (let at = 44; at < wav.length; at += 2)
    wav.writeInt16LE(Math.round(2000 * Math.sin(at / period)), at);
  return wav;
}

test("restores downloadable audio to empty private Storage before recreating its course", async ({
  page,
}) => {
  const email = await signUp(page);
  await completeOnboarding(page);
  const { client, ownerId, courseId, cleanup } = await localLibraryFixture(email);
  const models = [10, 17].map((period) => {
    const wav = syntheticWav(period);
    const hash = createHash("sha256").update(wav).digest("hex");
    return { wav, hash, path: [ownerId, courseId, hash].join("/") };
  });
  const store = client.storage.from("study-audio");
  const paths = models.map((model) => model.path);
  try {
    for (const { path, wav } of models)
      await checked(store.upload(path, wav, { contentType: "audio/wav", upsert: false }));
    await checked(
      client
        .from("courses")
        .update({
          eoi_sources: {
            first: { key: "first", audio: "model.wav", hash: models[0]!.hash },
            second: { key: "second", audio: "same.wav", hash: models[0]!.hash },
            third: { key: "third", audio: "another.wav", hash: models[1]!.hash },
          },
        })
        .eq("id", courseId),
    );
    await page.goto("/es/app/settings");
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar copia completa", exact: true }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe("lexora-account.lexora");
    const downloaded = (await download.path())!;
    const bytes = await readFile(downloaded);
    expect(bytes.subarray(0, 8).toString()).toBe("LEXORA1\n");
    for (const { wav } of models) expect(bytes.includes(wav)).toBe(true);
    const manifest = JSON.parse(
      bytes.subarray(82, 82 + parseInt(bytes.subarray(8, 16).toString(), 16)).toString(),
    );
    expect(manifest.audio).toHaveLength(2);
    expect(manifest.audio).toEqual(
      expect.arrayContaining(
        models.map(({ wav, hash }) => ({
          course: courseId,
          hash,
          bytes: wav.length,
          type: "audio/wav",
        })),
      ),
    );
    await checked(store.remove(paths));
    expect(await checked(store.list(ownerId + "/" + courseId))).toHaveLength(0);
    await checked(client.from("courses").delete().eq("id", courseId));
    expect(await checked(client.from("courses").select("id").eq("id", courseId))).toHaveLength(0);
    await page.getByLabel("Archivo de la copia").setInputFiles(downloaded);
    await expect(page.getByText("2 archivos de audio", { exact: true })).toBeVisible();
    await page.getByLabel("Escribe RESTAURAR para confirmar").fill("RESTAURAR");
    await page.getByRole("button", { name: "Restaurar copia", exact: true }).click();
    await expect(page.getByText("Copia restaurada. Ya puedes continuar estudiando.")).toBeVisible({
      timeout: 30000,
    });
    expect(await checked(client.from("courses").select("id").eq("id", courseId))).toEqual([
      { id: courseId },
    ]);
    for (const { path, hash } of models) {
      const restored = await checked(store.download(path));
      expect(restored).toBeTruthy();
      expect(
        createHash("sha256")
          .update(Buffer.from(await restored!.arrayBuffer()))
          .digest("hex"),
      ).toBe(hash);
      const played = await page.evaluate(
        async ({ course, hash }) => {
          const data = await fetch(
            "/api/account/archive/audio?" + new URLSearchParams({ course, hash }),
          );
          if (!data.ok) return false;
          const audio = new Audio(URL.createObjectURL(await data.blob()));
          try {
            const ended = new Promise<boolean>((resolve) => {
              audio.onended = () => resolve(true);
              audio.onerror = () => resolve(false);
            });
            await audio.play();
            return await ended;
          } finally {
            URL.revokeObjectURL(audio.src);
          }
        },
        { course: courseId, hash },
      );
      expect(played).toBe(true);
    }
  } finally {
    await checked(store.remove(paths));
    await cleanup();
  }
});
