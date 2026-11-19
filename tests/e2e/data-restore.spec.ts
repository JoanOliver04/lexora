import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { completeOnboarding, signUp } from "./helpers";
import { checked, localLibraryFixture } from "./local-library-fixture";

for (const kind of ["JSON", "CSV"] as const) {
  test(`download and restore a ${kind} account backup`, async ({ page }) => {
    const email = await signUp(page);
    await completeOnboarding(page);
    const fixture = await localLibraryFixture(email);
    const { client, deckId, ownerId, courseId, cleanup } = fixture;
    let customCourseId: string | null = null;
    try {
      await page.goto("/en/app/courses");
      await page.getByLabel("Course name").fill("Learning Japanese");
      await page.getByLabel("Language you want to study").fill("日本語");
      await page.getByRole("button", { name: "Create course", exact: true }).click();
      await expect(page).toHaveURL("/en/app");
      const customCourse = await checked(
        client
          .from("courses")
          .select("id,target_language_name,target_language_id")
          .eq("title", "Learning Japanese")
          .single(),
      );
      if (!customCourse) throw new Error("Missing synthetic course");
      customCourseId = customCourse.id;
      expect(customCourse).toMatchObject({
        target_language_name: "日本語",
        target_language_id: null,
      });
      await page.goto("/es/import");
      const template = page.getByRole("region", { name: "Plantilla de importación" });
      await template.getByLabel("Idioma del reverso").selectOption("target");
      await template.getByText("Preparar un tema con ChatGPT", { exact: true }).click();
      await template.getByText("Ver el prompt", { exact: true }).click();
      await expect(template.getByRole("textbox", { name: "Ver el prompt" })).toHaveValue(
        /Crea 60 tarjetas de 日本語[\s\S]*reverso en 日本語/,
      );
      const customDeck = randomUUID();
      await checked(
        client.from("decks").insert({
          id: customDeck,
          course_id: customCourseId,
          owner_id: ownerId,
          title: "Backup Japanese deck",
        }),
      );
      await page.goto("/es/app/settings");
      const pending = page.waitForEvent("download");
      await page.getByRole("button", { name: `Descargar ${kind}`, exact: true }).click();
      const download = await pending;
      const file = await download.path();
      expect(file).toBeTruthy();
      await checked(
        client.from("profiles").update({ active_course_id: courseId }).eq("id", ownerId),
      );
      await checked(
        client.from("decks").update({ title: "Changed after export" }).eq("id", deckId),
      );
      const addition = randomUUID();
      await checked(
        client.from("decks").insert({
          id: addition,
          owner_id: ownerId,
          course_id: courseId,
          title: "Added after export",
        }),
      );
      await page.getByLabel("Archivo de la copia").setInputFiles(file!);
      await expect(page.getByText("2 mazos · 1 tarjeta · 0 repasos")).toBeVisible();
      const restore = page.getByRole("button", { name: "Restaurar copia", exact: true });
      await expect(restore).toBeDisabled();
      expect(await checked(client.from("decks").select("title").eq("id", deckId).single())).toEqual(
        { title: "Changed after export" },
      );
      await page.getByLabel("Escribe RESTAURAR para confirmar").fill("RESTAURAR");
      await restore.click();
      await expect(
        page.getByText("Copia restaurada. Ya puedes continuar estudiando."),
      ).toBeVisible();
      expect(
        await checked(client.from("decks").select("id,title").eq("course_id", courseId)),
      ).toEqual([{ id: deckId, title: "Acceptance deck" }]);
      expect(
        await checked(client.from("practice_items").select("id").eq("id", fixture.itemId)),
      ).toEqual([{ id: fixture.itemId }]);
      expect(
        await checked(client.from("decks").select("id,title").eq("course_id", customCourseId)),
      ).toEqual([{ id: customDeck, title: "Backup Japanese deck" }]);
      expect(
        await checked(
          client.from("courses").select("target_language_name").eq("id", customCourseId).single(),
        ),
      ).toEqual({ target_language_name: "日本語" });
      expect(
        await checked(
          client.from("profiles").select("active_course_id").eq("id", ownerId).single(),
        ),
      ).toEqual({ active_course_id: customCourseId });
      await page.goto("/es/app/courses");
      await expect(
        page.getByLabel("Curso activo", { exact: true }).locator("option:checked"),
      ).toHaveText("Learning Japanese · 日本語");
    } finally {
      try {
        if (customCourseId)
          await checked(
            client.from("courses").delete().eq("id", customCourseId).eq("owner_id", ownerId),
          );
      } finally {
        await cleanup();
      }
    }
  });
}
