import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import type { Database } from "../../src/shared/infrastructure/supabase/database.types";
import { completeOnboarding, PASSWORD, signUp } from "./helpers";
import { localBackend } from "./local-backend";
import { assertStudyLayout } from "./study-layout";
import { auditAxe } from "./a11y-audit";

async function checked<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

test("free study supports one deck, several or all and keeps the trail and summary", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const { url, publishableKey } = localBackend();
  const email = await signUp(page);
  await completeOnboarding(page);
  const client = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const auth = await client.auth.signInWithPassword({ email, password: PASSWORD });
  const user = auth.data.user;
  if (auth.error || !user) throw new Error("Synthetic account missing");
  const course = await checked(
    client.from("courses").select("id").eq("owner_id", user.id).single(),
  );
  const scope = { owner_id: user.id, course_id: course!.id };
  const deckTitles = ["Food deck", "Sports deck", "Other deck", "Archived deck"];
  const fronts = ["Synthetic apple", "Synthetic ball", "Synthetic train", "Synthetic hidden"];
  const decks = deckTitles.map((title, index) => ({
    ...scope,
    id: randomUUID(),
    title,
    position: index,
    archived_at: index === 3 ? new Date().toISOString() : null,
  }));
  const concepts = fronts.map((title) => ({
    ...scope,
    id: randomUUID(),
    title,
    kind: "vocabulary" as const,
    summary: "Synthetic fixture",
  }));
  try {
    await checked(client.from("decks").insert(decks));
    await checked(
      client.from("decks").insert(
        Array.from({ length: 25 }, (_, index) => ({
          ...scope,
          title: `ZZ synthetic deck ${String(index + 1).padStart(2, "0")}`,
          position: index + decks.length,
        })),
      ),
    );
    await checked(client.from("concepts").insert(concepts));
    await checked(
      client.from("deck_concepts").insert([
        ...concepts.map((concept, index) => ({
          owner_id: user.id,
          concept_id: concept.id,
          deck_id: decks[index]!.id,
        })),
        { owner_id: user.id, concept_id: concepts[0]!.id, deck_id: decks[1]!.id },
      ]),
    );
    await checked(
      client.from("practice_items").insert(
        concepts.map((concept) => ({
          owner_id: user.id,
          concept_id: concept.id,
          mode: "basic_recall" as const,
          prompt_text: concept.title,
          answer_text: `Answer for ${concept.title}`,
          config: { mode: "basic_recall" },
        })),
      ),
    );
    await checked(
      client
        .from("course_settings")
        .update({ daily_new_limit: 0, maximum_reviews_per_day: 0 })
        .eq("course_id", course!.id),
    );

    await page.getByRole("link", { name: "Estudio libre", exact: true }).click();
    await expect(page).toHaveURL("/es/app/study/free");
    await expect(page.getByRole("radio", { name: "Todos los mazos" })).toBeChecked();
    await page.getByRole("radio", { name: "Elegir mazos" }).check();
    const start = page.getByRole("button", { name: "Empezar estudio libre" });
    await expect(start).toBeDisabled();
    await expect(page.getByRole("checkbox", { name: "Archived deck" })).toHaveCount(0);
    await expect(page.getByRole("checkbox")).toHaveCount(24);
    await expect(page.getByRole("checkbox", { name: "ZZ synthetic deck 25" })).toHaveCount(0);
    const search = page.getByRole("searchbox", { name: "Buscar mazos" });
    await search.fill("FOOD");
    await expect(page.getByRole("checkbox", { name: "Sports deck" })).toHaveCount(0);
    await page.getByRole("checkbox", { name: "Food deck" }).check();
    await search.fill("no matching deck");
    await expect(page.getByText("No hay mazos que coincidan con la búsqueda.")).toBeVisible();
    await search.clear();
    await expect(page.getByRole("checkbox", { name: "Food deck" })).toBeChecked();
    const nextPage = page.getByRole("button", { name: "Página siguiente" });
    await nextPage.focus();
    await nextPage.press("Enter");
    await expect(nextPage).toBeFocused();
    await expect(nextPage).toBeDisabled();
    await expect(page.getByRole("checkbox", { name: "ZZ synthetic deck 25" })).toBeVisible();
    await expect(page.getByText("1 seleccionado")).toBeVisible();
    await assertStudyLayout(page, info, "free-study-deck-picker");
    const otherDeck = page.getByRole("checkbox", { name: "ZZ synthetic deck 25" });
    await otherDeck.check();
    await search.fill("no matching deck");
    const onlySelected = page.getByRole("button", { name: "Mostrar solo los mazos seleccionados" });
    await onlySelected.click();
    await expect(page.getByRole("checkbox")).toHaveCount(2);
    await expect(page.getByRole("checkbox", { name: "Food deck" })).toBeChecked();
    await otherDeck.press("Space");
    await expect(onlySelected).toBeFocused();
    await onlySelected.click();
    await expect(search).toHaveValue("no matching deck");
    await search.clear();
    await expect(page.getByRole("checkbox", { name: "Food deck" })).toBeChecked();
    let startRequests = 0;
    page.on("request", (request) => {
      if (request.headers()["next-action"]) startRequests++;
    });
    await start.click();
    const next = page.getByRole("button", { name: "Siguiente", exact: true });
    const prev = page.getByRole("button", { name: "Anterior", exact: true });
    const finish = page.getByRole("button", { name: "Terminar sesión", exact: true });
    const restart = page.getByRole("button", { name: "Nueva sesión libre", exact: true });
    const position = (number: number) =>
      page.getByRole("heading", { name: `Tarjeta ${number}`, exact: true });
    const visibleFront = () => page.getByText(/^Synthetic (apple|ball|train|hidden)$/);
    const stat = (label: string) =>
      page
        .locator("dl > div")
        .filter({ has: page.getByText(label, { exact: true }) })
        .locator("dd");
    await expect(position(1)).toBeVisible();
    expect(startRequests).toBe(1);
    await expect(prev).toBeDisabled();
    await expect(visibleFront()).toHaveText(fronts[0]!);
    const reveal = page.getByRole("button", { name: "Revelar respuesta", exact: true });
    const answer = page.getByText(`Answer for ${fronts[0]}`, { exact: true });
    await expect(answer).toBeHidden();
    await page.getByText("Escribir antes de revelar", { exact: true }).press("Enter");
    const draft = page.getByRole("textbox", { name: "Tu respuesta para comparar" });
    await draft.fill("My practice answer");
    await reveal.click();
    await expect(answer).toBeVisible();
    await expect(draft).toHaveValue("My practice answer");
    const mark = page.getByRole("checkbox", { name: "Marcar para otra ronda" });
    await mark.press("Space");
    await expect(mark).toBeChecked();
    await next.click();
    await expect(position(2)).toBeVisible();
    await expect(visibleFront()).toHaveText(fronts[0]!);
    await expect(answer).toBeHidden();
    await page.getByText("Escribir antes de revelar", { exact: true }).click();
    await expect(draft).toHaveValue("");
    await prev.click();
    await expect(position(1)).toBeVisible();
    await expect(answer).toBeHidden();
    await expect(reveal).toBeVisible();
    await finish.click();
    await expect(stat("Tarjetas recorridas")).toHaveText("2");
    await expect(stat("Tarjetas distintas")).toHaveText("1");

    await page.getByRole("button", { name: "Practicar la tarjeta marcada" }).click();
    await expect(page.getByRole("heading", { name: "Repetición · tarjeta 1 de 1" })).toBeFocused();
    await expect(visibleFront()).toHaveText(fronts[0]!);
    await expect(answer).toBeHidden();
    await expect(next).toHaveCount(0);
    await reveal.click();
    await expect(mark).not.toBeChecked();
    await auditAxe(page, info, "marked-free-study");
    await finish.click();
    await expect(page.getByRole("button", { name: "Practicar la tarjeta marcada" })).toHaveCount(0);

    await restart.click();
    await page.getByRole("checkbox", { name: "Sports deck" }).check();
    await start.click();
    await expect(position(1)).toBeVisible();
    const first = await visibleFront().innerText();
    await next.click();
    await expect(position(2)).toBeVisible();
    const second = await visibleFront().innerText();
    expect([first, second].sort()).toEqual(fronts.slice(0, 2).sort());
    await next.click();
    await expect(position(3)).toBeVisible();
    await expect(visibleFront()).toHaveText(first);
    await prev.click();
    await expect(position(2)).toBeVisible();
    await expect(visibleFront()).toHaveText(second);
    await next.click();
    await expect(position(3)).toBeVisible();
    await expect(page.getByRole("button", { name: "Otra vez", exact: true })).toHaveCount(0);
    await assertStudyLayout(page, info, "free-study-card");
    await finish.click();
    await expect(page.getByRole("heading", { name: "Resumen de estudio libre" })).toBeFocused();
    await expect(stat("Tarjetas recorridas")).toHaveText("3");
    await expect(stat("Tarjetas distintas")).toHaveText("2");
    await expect(stat("Tiempo de estudio")).toHaveText(/\d+ min \d+ s/);

    await restart.click();
    await page.getByRole("radio", { name: "Todos los mazos" }).check();
    await start.click();
    const allFronts = [];
    for (let index = 1; index <= 3; index++) {
      await expect(position(index)).toBeVisible();
      allFronts.push(await visibleFront().innerText());
      if (index < 3) await next.click();
    }
    expect(allFronts.sort()).toEqual(fronts.slice(0, 3).sort());
    await finish.click();
    const deckId = decks[0]!.id;
    await page.goto(`/en/decks/${deckId}`);
    await expect(page.getByRole("heading", { name: deckTitles[0]!, level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Review this deck" })).toHaveAttribute(
      "href",
      `/en/app/study?deck=${deckId}`,
    );
    await page.getByRole("link", { name: "Practice freely" }).click();
    await expect(page.getByRole("checkbox", { name: "Food deck" })).toBeChecked();
    await page.getByRole("button", { name: "Start free study" }).click();
    await expect(visibleFront()).toHaveText(fronts[0]!);
    await page.goto(`/en/app/study/free?deck=${decks[3]!.id}`);
    await expect(
      page.getByText("This deck selection is unavailable in the current course."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Start free study" })).toHaveCount(0);
    expect(await checked(client.from("review_logs").select("id").eq("owner_id", user.id))).toEqual(
      [],
    );
    expect(
      await checked(client.from("learning_states").select("id").eq("owner_id", user.id)),
    ).toEqual([]);
  } finally {
    await checked(client.from("courses").delete().eq("id", course!.id).eq("owner_id", user.id));
    await client.auth.signOut({ scope: "local" });
  }
});
