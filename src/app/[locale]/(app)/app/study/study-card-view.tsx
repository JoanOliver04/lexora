"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  PracticeItemAnswer,
  PracticeItemPrompt,
} from "@/modules/library/presentation/practice-item-content";
import {
  REVIEW_RATINGS,
  type ReviewRating,
  type StudyCard,
} from "@/modules/study/application/study-card";
import { Button, FormError } from "@/shared/presentation/components";
import { revealStudyCardAction, type RevealFormState } from "./reveal-actions";

export function StudyCardView({
  locale,
  sessionId,
  card,
}: {
  locale: string;
  sessionId: string;
  card: StudyCard;
}) {
  const t = useTranslations("PracticeCard");
  const router = useRouter();
  const [state, action, pending] = useActionState<RevealFormState, FormData>(
    revealStudyCardAction,
    {},
  );
  const [rating, setRating] = useState<ReviewRating | null>(null);
  const [showIntervals, setShowIntervals] = useState(true);
  const answerHeading = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.content) answerHeading.current?.focus();
    else if (state.error) errorRef.current?.focus();
  }, [state]);
  const content = state.content ?? card.prompt;
  return (
    <section
      aria-labelledby="study-card-heading"
      data-testid="study-card"
      className="flex min-w-0 flex-col gap-4 rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-5"
    >
      <header className="flex flex-col gap-2">
        <h2 id="study-card-heading" className="text-xl font-semibold">
          {t("heading")}
        </h2>
        <p className="text-sm font-medium text-(--color-ink-muted)">{t(`modes.${content.mode}`)}</p>
      </header>
      <p className="text-sm leading-relaxed text-(--color-ink-muted)">{t("recallInstruction")}</p>
      <PracticeItemPrompt content={content} hintLabel={t("hintLabel")} />
      {state.error && (
        <div ref={errorRef} tabIndex={-1}>
          <FormError id="study-reveal-error">
            <p>{t(`revealErrors.${state.error}`)}</p>
          </FormError>
          {state.error !== "generic" && (
            <Button variant="secondary" className="mt-3" onClick={() => router.refresh()}>
              {t("reload")}
            </Button>
          )}
        </div>
      )}
      {!state.content && (
        <form action={action}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="practiceItemId" value={card.practiceItemId} />
          <Button
            type="submit"
            disabled={pending}
            aria-describedby="study-recall-hint"
            className="w-full"
          >
            {t(pending ? "revealing" : state.error ? "retryReveal" : "reveal")}
          </Button>
        </form>
      )}
      <p id="study-recall-hint" className="text-sm text-(--color-ink-muted)">
        {t("revealHint")}
      </p>
      {state.content && (
        <div className="flex min-w-0 flex-col gap-3 border-t border-(--color-border) pt-4">
          <h3 ref={answerHeading} tabIndex={-1} className="text-lg font-semibold">
            {t("answerHeading")}
          </h3>
          <PracticeItemAnswer content={state.content} clozeAnswersLabel={t("clozeAnswersLabel")} />
          {state.content.exampleText && (
            <div>
              <h4 className="font-medium">{t("exampleLabel")}</h4>
              <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">
                {state.content.exampleText}
              </p>
            </div>
          )}
          {state.content.explanationText && (
            <div>
              <h4 className="font-medium">{t("explanationLabel")}</h4>
              <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">
                {state.content.explanationText}
              </p>
            </div>
          )}
        </div>
      )}
      {state.content && state.preview && (
        <div className="space-y-2">
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={showIntervals}
              onChange={(event) => setShowIntervals(event.target.checked)}
            />
            {t("showIntervals")}
          </label>
          {showIntervals && (
            <p className="text-sm leading-relaxed text-(--color-ink-muted)">{t("intervalHint")}</p>
          )}
        </div>
      )}
      {state.previewUnavailable && (
        <p role="status" className="text-sm">
          {t("intervalUnavailable")}
        </p>
      )}
      <fieldset disabled={!state.content || pending} className="min-w-0">
        <legend className="mb-3 font-medium">{t("ratingHeading")}</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {REVIEW_RATINGS.map((value) => {
            const interval = state.preview?.intervals.find((entry) => entry.rating === value);
            return (
              <div key={value} className="min-w-0 space-y-2">
                <Button
                  aria-pressed={rating === value}
                  aria-describedby={`rating-${value}-help`}
                  variant={rating === value ? "primary" : "secondary"}
                  className="w-full"
                  onClick={() => {
                    if (state.content && !pending) setRating(value);
                  }}
                >
                  {t(`ratings.${value}.label`)}
                </Button>
                {showIntervals && interval && (
                  <p data-testid={`interval-${value}`} className="text-sm font-medium">
                    {t("intervalApproximate", {
                      duration: intervalDuration(interval.intervalMs, t),
                    })}
                  </p>
                )}
                <p
                  id={`rating-${value}-help`}
                  className="text-sm leading-relaxed text-(--color-ink-muted)"
                >
                  {t(`ratings.${value}.description`)}
                </p>
              </div>
            );
          })}
        </div>
      </fieldset>
      <p className="text-sm leading-relaxed text-(--color-ink-muted)">{t("notSavedHint")}</p>
      {rating && (
        <p role="status" className="text-sm">
          {t("ratingSelected", { rating: t(`ratings.${rating}.label`) })}
        </p>
      )}
    </section>
  );
}

/** Formatting only: durations already come from the authoritative server scheduler. */
function intervalDuration(
  ms: number,
  t: ReturnType<typeof useTranslations<"PracticeCard">>,
): string {
  if (ms < 60_000) return t("intervalUnderMinute");
  const [unit, divisor] =
    ms < 3_600_000
      ? (["minutes", 60_000] as const)
      : ms < 86_400_000
        ? (["hours", 3_600_000] as const)
        : (["days", 86_400_000] as const);
  return t(`intervalUnits.${unit}`, { count: Math.max(1, Math.round(ms / divisor)) });
}
