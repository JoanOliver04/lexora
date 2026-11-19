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
    let frenchCourseId: string | null = null;
    try {
      const profile = await checked(
        client.from("profiles").select("updated_at").eq("id", ownerId).single(),
      );
      if (!profile) throw new Error("Missing synthetic profile");
      frenchCourseId = await checked(
        client.rpc("create_language_course", {
          p_title: "Backup French",
          p_target_locale: "fr",
          p_profile_version: profile.updated_at,
        }),
      );
      if (!frenchCourseId) throw new Error("Missing synthetic course");
      const frenchDeck = randomUUID();
      await checked(
        client.from("decks").insert({
          id: frenchDeck,
          course_id: frenchCourseId,
          owner_id: ownerId,
          title: "Backup French deck",
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
        await checked(client.from("decks").select("id,title").eq("course_id", frenchCourseId)),
      ).toEqual([{ id: frenchDeck, title: "Backup French deck" }]);
      expect(
        await checked(
          client.from("profiles").select("active_course_id").eq("id", ownerId).single(),
        ),
      ).toEqual({ active_course_id: frenchCourseId });
    } finally {
      try {
        if (frenchCourseId)
          await checked(
            client.from("courses").delete().eq("id", frenchCourseId).eq("owner_id", ownerId),
          );
      } finally {
        await cleanup();
      }
    }
  });
}
