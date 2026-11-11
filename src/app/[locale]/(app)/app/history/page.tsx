import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { getHistoryContextForCurrentUser } from "@/composition/history";
import { getLibraryContextForCurrentUser } from "@/composition/library";
import { Link } from "@/i18n/navigation";
import { getReviewHistory, type HistoryQuery } from "@/modules/study/application/review-history";
import { MEMORY_PHASES, REVIEW_RATINGS } from "@/modules/study/domain/memory";
import { V1_PRACTICE_MODES } from "@/modules/library/domain/taxonomy";
import { Button, Input, Label } from "@/shared/presentation/components";

export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<HistoryQuery>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const course = await getActiveCourseForCurrentUser();
  if (!course) redirect(`/${locale}/onboarding`);
  const context = await getHistoryContextForCurrentUser();
  if (!context) redirect(`/${locale}/login`);
  const t = await getTranslations("History");
  const result = await getReviewHistory(context.repository, {
    ownerId: context.ownerId,
    courseId: course.id,
    query: await searchParams,
    timeZone: context.timeZone,
    now: context.clock.now(),
  });
  const linkClass =
    "inline-flex min-h-11 items-center text-(--color-accent) underline underline-offset-4";
  if (!result.ok)
    return (
      <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-10">
        <h1 className="text-3xl font-semibold">{t("title")}</h1>
        <p role="alert">{t("invalidFilters")}</p>
        <Link href="/app/history" className={linkClass}>
          {t("reset")}
        </Link>
      </main>
    );
  const library = await getLibraryContextForCurrentUser();
  const decks = library
    ? await library.decks.search({
        ownerId: context.ownerId,
        courseId: course.id,
        includeArchived: true,
        limit: 100,
        offset: 0,
      })
    : { items: [], total: 0 };
  const { filters, entries, nextCursor } = result;
  const query: Record<string, string> = {};
  for (const key of ["from", "until", "rating", "phase"] as const)
    if (filters[key]) query[key] = filters[key];
  if (filters.deckId) query["deck"] = filters.deckId;
  if (filters.conceptId) query["concept"] = filters.conceptId;
  if (filters.itemId) query["item"] = filters.itemId;
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: context.timeZone,
  });
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const selectClass =
    "min-h-11 w-full min-w-0 rounded-(--radius-control) border border-(--color-border-strong) bg-(--color-surface) px-3 text-(--color-ink)";
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-3">
        <Link href="/app" className={linkClass}>
          {t("back")}
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h1>
          <p className="break-words text-(--color-ink-muted)">{course.title}</p>
        </div>
        <p className="max-w-prose text-(--color-ink-muted)">{t("intro")}</p>
      </header>
      <form
        method="get"
        className="grid gap-4 rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3"
        aria-label={t("filters")}
      >
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="from">{t("from")}</Label>
          <Input id="from" type="date" name="from" defaultValue={filters.from ?? ""} />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="until">{t("until")}</Label>
          <Input id="until" type="date" name="until" defaultValue={filters.until ?? ""} />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="deck">{t("deck")}</Label>
          <select id="deck" name="deck" defaultValue={filters.deckId ?? ""} className={selectClass}>
            <option value="">{t("allDecks")}</option>
            {decks.items.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.title}
              </option>
            ))}
            {filters.deckId && !decks.items.some((deck) => deck.id === filters.deckId) && (
              <option value={filters.deckId}>{t("selectedDeck")}</option>
            )}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="rating">{t("rating")}</Label>
          <select
            id="rating"
            name="rating"
            defaultValue={filters.rating ?? ""}
            className={selectClass}
          >
            <option value="">{t("allRatings")}</option>
            {REVIEW_RATINGS.map((rating) => (
              <option key={rating} value={rating}>
                {t(`ratings.${rating}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="phase">{t("phase")}</Label>
          <select
            id="phase"
            name="phase"
            defaultValue={filters.phase ?? ""}
            className={selectClass}
          >
            <option value="">{t("allPhases")}</option>
            {MEMORY_PHASES.map((phase) => (
              <option key={phase} value={phase}>
                {t(`phases.${phase}`)}
              </option>
            ))}
          </select>
        </div>
        {filters.conceptId && <input type="hidden" name="concept" value={filters.conceptId} />}
        {filters.itemId && <input type="hidden" name="item" value={filters.itemId} />}
        <div className="flex flex-wrap items-end gap-4">
          <Button type="submit">{t("apply")}</Button>
          <Link href="/app/history" className={linkClass}>
            {t("reset")}
          </Link>
        </div>
        <p className="text-sm break-words text-(--color-ink-muted) sm:col-span-2 lg:col-span-3">
          {t("zone", { zone: context.timeZone })}
          {decks.total > 100 ? ` ${t("deckLimit")}` : ""}
        </p>
      </form>
      <section aria-label={t("results")} className="min-w-0">
        <p role="status" className="mb-5 text-sm text-(--color-ink-muted)">
          {t("showing", { count: entries.length })}
        </p>
        {entries.length === 0 ? (
          <div className="border-y border-(--color-border) py-12">
            <h2 className="text-xl font-medium">{t("emptyTitle")}</h2>
            <p className="mt-2 text-(--color-ink-muted)">{t("emptyDescription")}</p>
            <Link href="/app" className={`${linkClass} mt-4`}>
              {t("back")}
            </Link>
          </div>
        ) : (
          <ol className="divide-y divide-(--color-border) border-y border-(--color-border)">
            {entries.map((entry) => (
              <li key={entry.id} className="grid min-w-0 gap-3 py-6 sm:grid-cols-[10rem_1fr]">
                <time
                  dateTime={entry.reviewedAt}
                  className="text-sm leading-6 text-(--color-ink-muted)"
                >
                  {date.format(new Date(entry.reviewedAt))}
                </time>
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <Link
                      href={`/concepts/${entry.conceptId}`}
                      className={`${linkClass} min-w-0 max-w-full font-medium break-words`}
                    >
                      {entry.title}
                    </Link>
                    <span className="rounded-(--radius-control) bg-(--color-surface-sunken) px-3 py-2 text-sm font-medium">
                      {t(`ratings.${entry.rating}`)}
                    </span>
                  </div>
                  <p className="text-sm text-(--color-ink-muted)">
                    {V1_PRACTICE_MODES.includes(entry.mode as (typeof V1_PRACTICE_MODES)[number])
                      ? t(`modes.${entry.mode}`)
                      : t("otherMode")}
                  </p>
                  <p className="text-sm">
                    {t("transition", {
                      before: entry.phaseBefore ? t(`phases.${entry.phaseBefore}`) : t("unknown"),
                      after: entry.phaseAfter ? t(`phases.${entry.phaseAfter}`) : t("unknown"),
                    })}
                  </p>
                  <details>
                    <summary className="flex min-h-11 cursor-pointer items-center text-sm text-(--color-accent) underline underline-offset-4">
                      {t("details")}
                    </summary>
                    <dl className="grid gap-3 border-l-2 border-(--color-border) pl-4 text-sm">
                      <div>
                        <dt className="text-(--color-ink-muted)">{t("duration")}</dt>
                        <dd>
                          {entry.durationMs === null
                            ? t("unmeasured")
                            : t("seconds", { value: number.format(entry.durationMs / 1000) })}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-(--color-ink-muted)">{t("scheduled")}</dt>
                        <dd>
                          {entry.dueAfter ? date.format(new Date(entry.dueAfter)) : t("unknown")}
                        </dd>
                      </div>
                    </dl>
                    <Link
                      href={{ pathname: "/app/history", query: { item: entry.itemId } }}
                      className={linkClass}
                    >
                      {t("itemTimeline")}
                    </Link>
                  </details>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
      <nav aria-label={t("pagination")} className="flex flex-wrap justify-between gap-4">
        {filters.cursor && (
          <Link href={{ pathname: "/app/history", query }} className={linkClass}>
            {t("latest")}
          </Link>
        )}
        {nextCursor && (
          <Link
            rel="next"
            href={{ pathname: "/app/history", query: { ...query, cursor: nextCursor } }}
            className={`${linkClass} ml-auto`}
          >
            {t("older")}
          </Link>
        )}
      </nav>
      <p className="max-w-prose text-sm leading-relaxed text-(--color-ink-muted)">
        {t("historicalNote")}
      </p>
    </main>
  );
}
