"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { SessionSummary } from "@/modules/study/application/session-summary";
import { REVIEW_RATINGS } from "@/modules/study/domain/memory";
import { Button, FormError } from "@/shared/presentation/components";

export function SessionSummaryView({ summary }: { summary: SessionSummary | null }) {
  const t = useTranslations("SessionSummary");
  const tCard = useTranslations("PracticeCard");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <section
      data-testid="session-summary"
      aria-labelledby="session-summary-title"
      className="flex min-w-0 flex-col gap-4 rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-5"
    >
      <h2 id="session-summary-title" className="text-xl font-semibold">
        {t("title")}
      </h2>
      {summary === null ? (
        <FormError id="session-summary-error">
          <p>{t("unavailable")}</p>
        </FormError>
      ) : (
        <>
          <p className="text-sm">{t("confirmedHint")}</p>
          {summary.reviewCount === 0 && <p>{t("empty")}</p>}
          <dl className="grid grid-cols-2 gap-3">
            <dt>{t("reviews")}</dt>
            <dd data-testid="summary-reviews" className="text-right font-semibold">
              {summary.reviewCount}
            </dd>
            <dt>{t("newItems")}</dt>
            <dd data-testid="summary-new-items" className="text-right font-semibold">
              {summary.newItemCount}
            </dd>
          </dl>
          {summary.unclassifiedCount > 0 && (
            <p className="text-sm">{t("unclassified", { count: summary.unclassifiedCount })}</p>
          )}
          <h3 className="font-semibold">{t("ratings")}</h3>
          <dl className="grid grid-cols-2 gap-3">
            {REVIEW_RATINGS.map((rating) => (
              <div key={rating} className="contents">
                <dt>{tCard(`ratings.${rating}.label`)}</dt>
                <dd data-testid={`summary-rating-${rating}`} className="text-right">
                  {summary.ratings[rating]}
                </dd>
              </div>
            ))}
          </dl>
          <h3 className="font-semibold">{t("duration")}</h3>
          <p data-testid="summary-duration">
            {summary.recordedDurationMs === null
              ? t("durationMissing")
              : t("durationSeconds", { seconds: Math.round(summary.recordedDurationMs / 1000) })}
          </p>
          {summary.timedReviewCount > 0 && (
            <p className="text-sm">
              {t("durationCoverage", {
                measured: summary.timedReviewCount,
                total: summary.reviewCount,
              })}
            </p>
          )}
          <p className="text-sm text-(--color-ink-muted)">{t("durationHint")}</p>
          <h3 className="font-semibold">{t("remainingTitle")}</h3>
          {summary.remaining === null ? (
            <p>{t("remainingUnavailable")}</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-3">
                <dt>{t("available")}</dt>
                <dd data-testid="summary-available" className="text-right">
                  {summary.remaining.availableCount}
                </dd>
                <dt>{t("hiddenReviews")}</dt>
                <dd data-testid="summary-hidden-reviews" className="text-right">
                  {summary.remaining.hiddenDueReviews}
                </dd>
                <dt>{t("hiddenNew")}</dt>
                <dd data-testid="summary-hidden-new" className="text-right">
                  {summary.remaining.hiddenNew}
                </dd>
              </dl>
              {summary.remaining.hasFutureReviews && <p>{t("future")}</p>}
            </>
          )}
          <p className="text-sm text-(--color-ink-muted)">{t("remainingHint")}</p>
        </>
      )}
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        {t(pending ? "refreshing" : "refresh")}
      </Button>
    </section>
  );
}
