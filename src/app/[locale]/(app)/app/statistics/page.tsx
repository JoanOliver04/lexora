import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { getHistoryContextForCurrentUser } from "@/composition/history";
import { getLibraryContextForCurrentUser } from "@/composition/library";
import { Link } from "@/i18n/navigation";
import { getStatistics } from "@/modules/study/application/statistics";
import { MEMORY_PHASES, REVIEW_RATINGS } from "@/modules/study/domain/memory";
import { V1_PRACTICE_MODES } from "@/modules/library/domain/taxonomy";
import { Button, Label } from "@/shared/presentation/components";
import { StatisticsBreakdowns } from "./statistics-breakdowns";

export default async function StatisticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ days?: string | string[]; deck?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const course = await getActiveCourseForCurrentUser();
  if (!course) redirect(`/${locale}/onboarding`);
  const context = await getHistoryContextForCurrentUser();
  if (!context) redirect(`/${locale}/login`);
  const t = await getTranslations("Statistics");
  const h = await getTranslations("History");
  const query = await searchParams;
  const now = context.clock.now();
  const result = await getStatistics(context.statistics, {
    ownerId: context.ownerId,
    courseId: course.id,
    now,
    timeZone: context.timeZone,
    days: query.days,
    deck: query.deck,
  });
  const linkClass =
    "inline-flex min-h-11 items-center text-(--color-accent) underline underline-offset-4";
  if (!result.ok)
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-5 px-4 py-12">
        <h1 className="text-3xl font-semibold">{t("title")}</h1>
        <p role="alert">{h("invalidFilters")}</p>
        <Link href="/app/statistics" className={linkClass}>
          {h("reset")}
        </Link>
      </main>
    );
  const { statistics: s, days, deckId } = result;
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
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const date = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: context.timeZone,
  });
  const chartDays = s.activity.slice(-14);
  const maxReviews = Math.max(1, ...chartDays.map((day) => day.reviews));
  const maxForecast = Math.max(1, ...s.forecast.map((day) => day.count));
  const totalStates = Object.values(s.states).reduce((sum, count) => sum + count, 0);
  const sectionClass = "flex min-w-0 flex-col gap-4 border-t border-(--color-border) pt-7";
  const selectClass =
    "min-h-11 w-full min-w-0 rounded-(--radius-control) border border-(--color-border-strong) bg-(--color-surface) px-3";
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-9 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-3">
        <Link href="/app" className={linkClass}>
          {h("back")}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight break-words sm:text-4xl">
          {t("title")}
        </h1>
        <p className="max-w-prose text-(--color-ink-muted)">{t("intro")}</p>
        <p className="break-words font-medium">{course.title}</p>
      </header>
      <form
        method="get"
        aria-label={t("filters")}
        className="grid items-end gap-4 rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-4 sm:grid-cols-[1fr_1fr_auto] sm:p-6"
      >
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="days">{t("period")}</Label>
          <select id="days" name="days" defaultValue={String(days)} className={selectClass}>
            {[7, 30, 90].map((d) => (
              <option key={d} value={d}>
                {t("days", { count: d })}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="deck">{h("deck")}</Label>
          <select id="deck" name="deck" defaultValue={deckId ?? ""} className={selectClass}>
            <option value="">{h("allDecks")}</option>
            {decks.items.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
            {deckId && !decks.items.some((d) => d.id === deckId) && (
              <option value={deckId}>{h("selectedDeck")}</option>
            )}
          </select>
        </div>
        <Button type="submit">{h("apply")}</Button>
        <p className="text-sm break-words text-(--color-ink-muted) sm:col-span-3">
          {h("zone", { zone: context.timeZone })}
          {decks.total > 100 ? ` ${h("deckLimit")}` : ""}
        </p>
      </form>
      <section aria-label={t("periodSummary")}>
        <dl className="grid grid-cols-1 gap-6 border-y border-(--color-border) py-7 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <dt className="text-sm text-(--color-ink-muted)">{t("reviews")}</dt>
            <dd className="text-4xl font-semibold tracking-tight tabular-nums">
              {n.format(s.totals.reviews)}
            </dd>
          </div>
          <div className="flex flex-col gap-2">
            <dt className="text-sm text-(--color-ink-muted)">{t("recordedMinutes")}</dt>
            <dd className="text-4xl font-semibold tracking-tight tabular-nums">
              {s.totals.measured > 0 ? n.format(s.totals.durationMs / 60000) : "—"}
            </dd>
            <p className="text-sm text-(--color-ink-muted)">
              {t("coverage", { measured: s.totals.measured, total: s.totals.reviews })}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <dt className="text-sm text-(--color-ink-muted)">{t("observedRecall")}</dt>
            <dd className="text-4xl font-semibold tracking-tight tabular-nums">
              {s.observedRecall === null ? "—" : percent.format(s.observedRecall)}
            </dd>
            <p className="text-sm text-(--color-ink-muted)">{t("recallFormula")}</p>
          </div>
        </dl>
      </section>
      {s.totals.reviews === 0 && (
        <p role="status" className="max-w-prose text-(--color-ink-muted)">
          {t("noReviews")}
        </p>
      )}
      <div className="grid min-w-0 gap-9 lg:grid-cols-2">
        <section className={sectionClass} aria-labelledby="activity-title">
          <h2 id="activity-title" className="text-xl font-semibold">
            {t("activity")}
          </h2>
          <p className="text-sm text-(--color-ink-muted)">
            {t("activityWindow", { count: chartDays.length })}
          </p>
          <table className="w-full table-fixed text-sm">
            <caption className="sr-only">{t("activity")}</caption>
            <thead className="sr-only">
              <tr>
                <th>{t("day")}</th>
                <th>{t("reviews")}</th>
              </tr>
            </thead>
            <tbody>
              {chartDays.map((day) => (
                <tr key={day.day}>
                  <th scope="row" className="w-24 py-2 text-left font-normal">
                    <time dateTime={day.day}>{date.format(day.start)}</time>
                  </th>
                  <td className="py-2">
                    <div className="flex items-center gap-3">
                      <meter
                        className="h-3 min-w-0 flex-1 accent-(--color-accent)"
                        min={0}
                        max={maxReviews}
                        value={day.reviews}
                        aria-label={t("dailyCount", { date: day.day, count: day.reviews })}
                      />
                      <span className="min-w-8 text-right tabular-nums">
                        {n.format(day.reviews)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className={sectionClass} aria-labelledby="ratings-title">
          <h2 id="ratings-title" className="text-xl font-semibold">
            {t("ratings")}
          </h2>
          <dl className="grid gap-5">
            {REVIEW_RATINGS.map((rating) => (
              <div key={rating}>
                <div className="mb-2 flex flex-wrap justify-between gap-2">
                  <dt>{h(`ratings.${rating}`)}</dt>
                  <dd className="tabular-nums">
                    {n.format(s.ratings[rating])} ·{" "}
                    {s.totals.reviews ? percent.format(s.ratings[rating] / s.totals.reviews) : "—"}
                  </dd>
                </div>
                <meter
                  className="h-3 w-full accent-(--color-accent)"
                  min={0}
                  max={Math.max(1, s.totals.reviews)}
                  value={s.ratings[rating]}
                  aria-label={h(`ratings.${rating}`)}
                />
              </div>
            ))}
          </dl>
          <p className="text-sm leading-relaxed text-(--color-ink-muted)">{t("recallNote")}</p>
          <Link
            href={{
              pathname: "/app/history",
              query: {
                from: s.activity[0]!.day,
                until: s.activity.at(-1)!.day,
                ...(deckId ? { deck: deckId } : {}),
              },
            }}
            className={linkClass}
          >
            {t("viewHistory")}
          </Link>
        </section>
        <section className={sectionClass} aria-labelledby="states-title">
          <h2 id="states-title" className="text-xl font-semibold">
            {t("states")}
          </h2>
          <p className="text-sm text-(--color-ink-muted)">{t("stateNote")}</p>
          <dl className="grid gap-4">
            {MEMORY_PHASES.map((phase) => (
              <div key={phase} className="flex flex-wrap items-baseline justify-between gap-2">
                <dt>{h(`phases.${phase}`)}</dt>
                <dd className="text-lg font-medium tabular-nums">{n.format(s.states[phase])}</dd>
              </div>
            ))}
            <div className="flex flex-wrap justify-between gap-2 border-t border-(--color-border) pt-4">
              <dt>{t("totalCards")}</dt>
              <dd className="font-semibold tabular-nums">{n.format(totalStates)}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt>{t("lapses")}</dt>
              <dd className="font-medium tabular-nums">{n.format(s.lapses)}</dd>
            </div>
          </dl>
        </section>
        <section className={sectionClass} aria-labelledby="forecast-title">
          <h2 id="forecast-title" className="text-xl font-semibold">
            {t("forecast")}
          </h2>
          <p className="text-sm leading-relaxed text-(--color-ink-muted)">{t("forecastNote")}</p>
          <p>{t("overdue", { count: s.overdue })}</p>
          <table className="w-full table-fixed text-sm">
            <caption className="sr-only">{t("forecast")}</caption>
            <thead className="sr-only">
              <tr>
                <th>{t("day")}</th>
                <th>{t("scheduled")}</th>
              </tr>
            </thead>
            <tbody>
              {s.forecast.map((day) => (
                <tr key={day.day}>
                  <th scope="row" className="w-24 py-2 text-left font-normal">
                    <time dateTime={day.day}>{date.format(day.start)}</time>
                  </th>
                  <td className="py-2">
                    <div className="flex items-center gap-3">
                      <meter
                        min={0}
                        max={maxForecast}
                        value={day.count}
                        aria-label={t("forecastCount", { date: day.day, count: day.count })}
                        className="h-3 min-w-0 flex-1 accent-(--color-accent)"
                      />
                      <span className="min-w-8 text-right tabular-nums">{n.format(day.count)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm text-(--color-ink-muted)">
            {t("estimate", { minutes: n.format(s.estimate.totalMs / 60000) })}{" "}
            {t(s.estimate.source === "history" ? "estimateHistory" : "estimateFallback", {
              count: s.estimate.sampleSize,
            })}
          </p>
        </section>
      </div>
      <StatisticsBreakdowns byKind={s.byKind} byLevel={s.byLevel} locale={locale} />
      <section className={sectionClass} aria-labelledby="difficult-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="difficult-title" className="text-xl font-semibold">
            {t("difficult")}
          </h2>
          <p className="text-sm text-(--color-ink-muted)">
            {t("difficultCount", { count: s.difficultTotal })}
          </p>
        </div>
        <p className="max-w-prose text-sm leading-relaxed text-(--color-ink-muted)">
          {t("difficultRule")}
        </p>
        {s.difficult.length === 0 ? (
          <p>{t("noDifficult")}</p>
        ) : (
          <ol className="divide-y divide-(--color-border)">
            {s.difficult.map((item) => (
              <li
                key={item.id}
                className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-4"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <Link
                    href={`/concepts/${item.conceptId}`}
                    className={`${linkClass} max-w-full font-medium break-words`}
                  >
                    {item.title}
                  </Link>
                  <p className="text-sm text-(--color-ink-muted)">
                    {V1_PRACTICE_MODES.includes(item.mode as (typeof V1_PRACTICE_MODES)[number])
                      ? h(`modes.${item.mode}`)
                      : h("otherMode")}{" "}
                    · {t("difficultySignals", { lapses: item.lapses, again: item.recentAgain })}
                  </p>
                </div>
                <Link
                  href={{ pathname: "/app/history", query: { item: item.id } }}
                  className={linkClass}
                >
                  {t("viewHistory")}
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
      <p className="max-w-prose text-sm leading-relaxed text-(--color-ink-muted)">
        {t("updated", {
          at: new Intl.DateTimeFormat(locale, {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: context.timeZone,
          }).format(now),
        })}
      </p>
    </main>
  );
}
