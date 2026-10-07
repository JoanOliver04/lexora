import { useFormatter, useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import type { TodayDashboard } from "@/modules/study/application/today-dashboard";
import { Button } from "@/shared/presentation/components";

const textLink =
  "inline-flex min-h-11 items-center text-sm text-(--color-accent) underline underline-offset-4";

export function DashboardView({
  dashboard,
  timeZone,
}: {
  dashboard: TodayDashboard;
  timeZone: string;
}) {
  const t = useTranslations("Today");
  const format = useFormatter();
  const dateLocale = useLocale() === "en" ? "en-GB" : "es-ES";
  const formatDate = (instant: Date, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(dateLocale, { ...options, timeZone }).format(instant);
  const { overview, status } = dashboard;
  const metrics = [
    { key: "dueReviews", value: overview.dueReviews },
    { key: "learningDue", value: overview.learningDue },
    { key: "newAvailable", value: overview.newAvailable },
    { key: "difficultItems", value: overview.difficultItems },
  ] as const;

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <section
        aria-label={t("allDecks")}
        className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-2"
      >
        <div className="min-w-0">
          <p className="font-medium">
            {dashboard.scope.deckIds === null
              ? t("allDecks")
              : t("selectedDecks", { count: dashboard.scope.deckIds.length })}
          </p>
          {dashboard.scopeDeckNames.length > 0 && (
            <p className="mt-1 text-sm break-words text-(--color-ink-muted)">
              {dashboard.scopeDeckNames.join(" · ")}
            </p>
          )}
          {dashboard.scope.deckIds !== null && (
            <Link href="/app" className={textLink}>
              {t("clearFilter")}
            </Link>
          )}
        </div>
        {dashboard.lastScopeAvailable && dashboard.lastScope ? (
          <Link
            href={
              dashboard.lastScope.deckIds === null
                ? "/app"
                : { pathname: "/app", query: { deck: dashboard.lastScope.deckIds } }
            }
            className={textLink}
          >
            {t("lastFilter")}
          </Link>
        ) : (
          <p className="text-sm text-(--color-ink-muted)">
            {t(dashboard.lastScope ? "lastFilterUnavailable" : "noLastFilter")}
          </p>
        )}
      </section>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="today-readiness"
          className="flex min-w-0 flex-col gap-5 rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-5 shadow-(--shadow-raised) sm:p-6"
        >
          <div>
            <h2 id="today-readiness" className="text-xl font-semibold tracking-tight">
              {t(`${status}Title`)}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-(--color-ink-muted)">
              {status === "waiting" && overview.nextDueAt
                ? t("waitingDescription", {
                    date: formatDate(overview.nextDueAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone,
                    }),
                  })
                : status === "ready"
                  ? t("readyDescription", { count: overview.availableCount })
                  : t(`${status}Description`)}
            </p>
          </div>
          <div>
            <p
              className="text-5xl font-semibold tracking-tight tabular-nums"
              data-testid="today-available"
            >
              {format.number(overview.availableCount)}
            </p>
            <p className="mt-1 text-sm text-(--color-ink-muted)">{t("availableLabel")}</p>
          </div>
          {status === "ready" && (
            <div>
              <p className="font-medium" aria-label={t("estimateLabel")}>
                {t("estimate", { minutes: Math.ceil(overview.estimate.totalMs / 60_000) })}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-(--color-ink-muted)">
                {t(overview.estimate.source === "fallback" ? "fallbackHint" : "historyHint")}
              </p>
            </div>
          )}
          <div className="mt-auto flex flex-col gap-3">
            {status === "ready" ? (
              <Link
                href={
                  dashboard.scope.deckIds === null
                    ? "/app/study"
                    : { pathname: "/app/study", query: { deck: dashboard.scope.deckIds } }
                }
                className="inline-flex min-h-12 w-full items-center justify-center rounded-(--radius-control) bg-(--color-accent) px-4 text-base font-medium text-(--color-on-accent) transition-colors duration-(--duration-quick) hover:bg-(--color-accent-hover)"
              >
                {t("startSession")}
              </Link>
            ) : (
              <Button
                disabled
                className="min-h-12 w-full text-base"
                aria-describedby="session-availability"
              >
                {t("startSession")}
              </Button>
            )}
            <p
              id="session-availability"
              className="text-sm leading-relaxed text-(--color-ink-muted)"
            >
              {t(status === "ready" ? "sessionScopeHint" : "sessionUnavailable")}
            </p>
            {status === "empty" && (
              <Link href="/import" className={textLink}>
                {t("emptyAction")}
              </Link>
            )}
          </div>
        </section>

        <section
          aria-labelledby="today-counts"
          className="min-w-0 rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-5 sm:p-6"
        >
          <h2 id="today-counts" className="text-lg font-semibold">
            {t("countsHeading")}
          </h2>
          <dl className="mt-5 grid grid-cols-2 gap-5">
            {metrics.map((metric) => (
              <div key={metric.key} className="min-w-0">
                <dt className="text-sm text-(--color-ink-muted)">{t(metric.key)}</dt>
                <dd
                  className="mt-1 text-3xl font-semibold tabular-nums"
                  data-testid={`today-${metric.key}`}
                >
                  {format.number(metric.value)}
                </dd>
                {metric.key === "dueReviews" && overview.hiddenDueReviews > 0 && (
                  <p className="mt-1 text-xs text-(--color-ink-muted)">
                    {t("availableReviews", { count: overview.availableReviews })}
                  </p>
                )}
              </div>
            ))}
          </dl>
          <p className="mt-5 text-sm leading-relaxed text-(--color-ink-muted)">{t("itemsHint")}</p>
          <details className="mt-3 text-sm text-(--color-ink-muted)">
            <summary className="min-h-11 cursor-pointer content-center text-(--color-accent)">
              {t("difficultyHeading")}
            </summary>
            <p className="pb-2 leading-relaxed">{t("difficultyHint")}</p>
          </details>
          {(overview.hiddenDueReviews > 0 || overview.hiddenNew > 0) && (
            <div
              role="status"
              className="mt-3 space-y-2 rounded-(--radius-control) bg-(--color-surface-sunken) p-3 text-sm leading-relaxed"
            >
              {overview.hiddenDueReviews > 0 && (
                <p>{t("hiddenReviews", { count: overview.hiddenDueReviews })}</p>
              )}
              {overview.hiddenNew > 0 && <p>{t("hiddenNew", { count: overview.hiddenNew })}</p>}
            </div>
          )}
        </section>
      </div>

      <section
        aria-labelledby="today-activity"
        className="min-w-0 rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-5 sm:p-6"
      >
        <h2 id="today-activity" className="text-lg font-semibold">
          {t("activityHeading")}
        </h2>
        <p className="mt-2 text-sm text-(--color-ink-muted)">
          {t("todaySummary", { count: dashboard.today.reviews })}
        </p>
        <h3 className="mt-5 font-medium">{t("weekHeading")}</h3>
        <p className="mt-1 text-sm leading-relaxed text-(--color-ink-muted)">{t("weekHint")}</p>
        <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-(--color-ink-muted)">{t("reviewsDone")}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums" data-testid="week-reviews">
              {format.number(dashboard.week.reviews)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-(--color-ink-muted)">{t("newIntroduced")}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums" data-testid="week-new">
              {format.number(dashboard.week.newIntroduced)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-(--color-ink-muted)">{t("recordedTime")}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {t("recordedMinutes", {
                minutes: format.number(dashboard.week.durationMs / 60_000, {
                  maximumFractionDigits: 1,
                }),
              })}
            </dd>
          </div>
        </dl>
        {dashboard.week.measuredReviews < dashboard.week.reviews && (
          <p className="mt-3 text-sm text-(--color-ink-muted)">{t("durationIncomplete")}</p>
        )}
        <ul
          className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7"
          aria-label={t("weekHeading")}
        >
          {dashboard.days.map((day) => (
            <li
              key={day.start.toISOString()}
              className="min-w-0 rounded-(--radius-control) bg-(--color-surface-sunken) p-3"
            >
              <time
                dateTime={day.start.toISOString()}
                className="block text-xs text-(--color-ink-muted)"
              >
                {formatDate(day.start, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  timeZone,
                })}
              </time>
              <p className="mt-2 text-sm font-medium tabular-nums">
                {t("dayReviews", { count: day.reviews })}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
