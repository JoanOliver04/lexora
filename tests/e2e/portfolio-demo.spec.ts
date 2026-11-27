import { expect, test } from "@playwright/test";
import { auditAxe } from "./a11y-audit";
import { assertStudyLayout } from "./study-layout";

for (const locale of ["es", "en"] as const) {
  test(`an anonymous visitor completes the Brighton demo from the home page (${locale})`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    const es = locale === "es";
    const button = (name: string) => page.getByRole("button", { name, exact: true });
    const heading = (name: string) => page.getByRole("heading", { name, exact: true });
    const demo = `/${locale}/demo`;
    const check = button(es ? "Comprobar respuesta" : "Check answer");
    const feedback = heading(es ? "Respuesta correcta" : "Review the answer");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(`/${locale}`);
    const start = page.getByRole("link", {
      name: es ? "Probar la demo" : "Try the demo",
      exact: true,
    });
    await expect(start).toHaveAttribute("href", demo);
    await start.click();
    await expect(page).toHaveURL(demo);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    const vocab = heading(es ? "En la taquilla" : "At the ticket office");
    const meaning = page.getByText(
      es ? "un billete de ida y vuelta" : "a ticket for the journey there and back",
      { exact: true },
    );
    await expect(vocab).toBeVisible();
    await expect(meaning).toBeHidden();
    const reveal = button(es ? "Revelar significado" : "Reveal meaning");
    await reveal.focus();
    await page.keyboard.press("Enter");
    await expect(meaning).toBeVisible();
    await button(es ? "Bien" : "Hard").press("Enter");

    const grammar = heading(es ? "Antes de embarcar" : "Before boarding");
    await expect(grammar).toBeFocused();
    const input = page.getByRole("textbox", {
      name: es ? "Tu respuesta" : "Your answer",
      exact: true,
    });
    await input.fill(es ? "hasn’t arrived" : "didn't arrive");
    await check.press("Enter");
    await expect(feedback).toBeVisible();
    await page.reload();
    await expect(grammar).toBeVisible();
    await expect(feedback).toBeVisible();
    await button(es ? "Ir a escucha" : "Continue to listening").press("Enter");

    await expect(heading(es ? "Por megafonía" : "Over the loudspeaker")).toBeFocused();
    const audio = page.locator("audio[controls]");
    await expect(audio).toBeVisible();
    // Exercise the media decoder and the actual audio asset in the browser.
    await audio.evaluate((player: HTMLAudioElement) => player.play());
    await expect
      .poll(() => audio.evaluate((player: HTMLAudioElement) => player.currentTime))
      .toBeGreaterThan(0);
    const track = await audio.evaluate((player: HTMLAudioElement) => {
      player.pause();
      return new URL(player.currentSrc).pathname;
    });
    expect(track).toBe("/demo-media/platform-announcement.mp3");
    const summary = page
      .locator("summary")
      .filter({ hasText: es ? "Transcripción" : "Transcript" });
    const transcript = summary.locator("..");
    await expect(transcript).not.toHaveAttribute("open", "");
    await summary.press("Enter");
    await expect(transcript).toHaveAttribute("open", "");
    await expect(transcript).toContainText(/Brighton/i);
    await expect(transcript).toContainText(/platform (four|4)/i);
    await page.getByRole("radio", { name: es ? "Platform 4" : "Platform 9", exact: true }).check();
    await check.click();
    await expect(feedback).toBeVisible();
    await button(es ? "Ver resultados" : "View results").press("Enter");

    const results = heading(es ? "Tu viaje en cifras" : "Your journey in numbers");
    const score = page.getByText(es ? "2/2" : "0/2", { exact: true });
    await expect(results).toBeFocused();
    await expect(score).toBeVisible();
    await page.reload();
    await expect(results).toBeVisible();
    await expect(score).toBeVisible();
    await expect(
      page
        .getByRole("list", { name: es ? "Tu itinerario" : "Your itinerary" })
        .locator('[aria-current="step"]'),
    ).toHaveText(/Resultados|Results/);
    const review = page.getByRole("region", { name: es ? "Próximo repaso" : "Next review" });
    await expect(review).toContainText("a return ticket");
    const interval = es ? /^[1-9]\d* (?:minutos?|días?)$/ : /^[1-9]\d* (?:minutes?|days?)$/;
    await expect(review.getByText(interval)).toBeVisible();
    const account = page.getByRole("region", {
      name: es ? "Sigue practicando en Lexora" : "Keep practising with Lexora",
    });
    const login = account.getByRole("link", { name: es ? "Entrar" : "Sign in", exact: true });
    await expect(login).toHaveAttribute("href", `/${locale}/login`);
    await login.click();
    await expect(page).toHaveURL(`/${locale}/login`);
    await page.goBack();
    await expect(results).toBeVisible();
    await assertStudyLayout(page, info, `demo-results-${locale}`);
    await button(es ? "Repetir demo" : "Restart demo").press("Enter");
    await expect(vocab).toBeFocused();
    await expect(meaning).toBeHidden();
    await page.reload();
    await expect(reveal).toBeVisible();
    await expect(meaning).toBeHidden();
    await page
      .getByRole("link", { name: es ? "Volver a Lexora" : "Back to Lexora", exact: true })
      .click();
    await expect(page).toHaveURL(`/${locale}`);
    await expect(start).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("switching language preserves the tab's demo while a new tab starts fresh", async ({
  context,
  page,
}) => {
  await page.goto("/es/demo");
  await page.getByRole("button", { name: "Revelar significado" }).click();
  await page.getByRole("button", { name: "Fácil", exact: true }).click();
  await page.getByRole("combobox", { name: "Idioma de la interfaz" }).selectOption("en");
  await expect(page).toHaveURL("/en/demo");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Before boarding" })).toBeVisible();

  const other = await context.newPage();
  await other.goto("/en/demo");
  await expect(other.getByRole("heading", { name: "At the ticket office" })).toBeVisible();
  await expect(other.getByRole("button", { name: "Reveal meaning" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Before boarding" })).toBeVisible();
});

test("the demo can be read and operated in light and dark themes at narrow widths", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.goto("/es/demo");
  await page.getByRole("radio", { name: "Oscuro", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Revelar significado" }).click();
  await expect(page.getByRole("button", { name: "Bien", exact: true })).toBeVisible();
  await auditAxe(page, info, "demo-vocabulary");
  await assertStudyLayout(page, info, "demo-vocabulary");
});

for (const locale of ["es", "en"] as const) {
  test(`both account entry points open the public demo (${locale})`, async ({ page }) => {
    const name =
      locale === "es" ? "Probar la demo sin registro" : "Try the demo without an account";
    for (const entry of ["login", "signup"]) {
      await page.goto(`/${locale}/${entry}`);
      const link = page.getByRole("link", { name, exact: true });
      await expect(link).toHaveAttribute("href", `/${locale}/demo`);
      await link.click();
      await expect(page).toHaveURL(`/${locale}/demo`);
      await expect(
        page.getByRole("button", {
          name: locale === "es" ? "Revelar significado" : "Reveal meaning",
        }),
      ).toBeVisible();
    }
  });
}
